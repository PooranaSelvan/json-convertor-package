# yaml2json-api — Developer Documentation

This document is for developers who want to understand, modify, or contribute to the `yaml2json-api` package.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [File Structure](#file-structure)
- [How It Works](#how-it-works)
- [Module: index.js (Public API)](#module-indexjs-public-api)
- [Module: yaml-parser.js (Parser Engine)](#module-yaml-parserjs-parser-engine)
- [Parser Internal Methods](#parser-internal-methods)
- [YAML Parsing Flow](#yaml-parsing-flow)
- [Type Coercion Rules](#type-coercion-rules)
- [Running Tests](#running-tests)
- [Publishing Updates](#publishing-updates)
- [Known Limitations](#known-limitations)
- [Contributing](#contributing)

---

## Architecture Overview

```
┌─────────────────────────────────────────────┐
│                  User Code                   │
│                                              │
│  yaml.parse()  yaml.convertFile()  yaml.convertDir()  │
└────────────────────┬────────────────────────┘
                     │
              ┌──────▼──────┐
              │   index.js   │   ← Public API (3 methods)
              │              │   ← File I/O, path handling
              └──────┬───────┘
                     │
              ┌──────▼──────┐
              │ yaml-parser  │   ← Core YAML parser
              │    .js       │   ← Pure string parsing
              │              │   ← No dependencies
              └──────────────┘
```

The architecture is intentionally simple:
- **`index.js`** handles the public API, file system operations, and directory traversal
- **`yaml-parser.js`** is a pure YAML-to-JS parser with zero I/O — it only takes a string and returns an object

---

## File Structure

```
yaml-to-json/
├── index.js          # Public API — parse(), convertFile(), convertDir()
├── yaml-parser.js    # YamlParser class — core parsing engine
├── package.json      # npm package manifest
├── README.md         # User-facing documentation
├── DEVELOPER.md      # This file — developer/contributor docs
└── test.js           # Test suite (36 tests)
```

---

## How It Works

### High-level flow:

1. **Input**: YAML string (or file path)
2. **Normalize**: Replace `\r\n` and `\r` with `\n`, split into lines
3. **Skip**: Empty lines, comments (`#`), document markers (`---`, `...`)
4. **Detect root type**: If first meaningful line starts with `- `, parse as array; otherwise parse as object
5. **Recursive descent**: Parse mappings and sequences based on indentation levels
6. **Type coercion**: Convert scalar values to JS types (numbers, booleans, null, strings)
7. **Output**: JavaScript object/array

---

## Module: index.js (Public API)

### `parse(yamlString) → object | array`

- Validates input is a string (throws `TypeError` otherwise)
- Creates a new `YamlParser` instance
- Calls `parser.parse(yamlString)` and returns the result

### `convertFile(inputPath, outputPath?, indent?) → { input, output, data }`

- Resolves the input path to absolute
- Validates file exists and has `.yaml` or `.yml` extension
- Reads the file as UTF-8
- Parses with `parse()`
- Writes JSON to output path (auto-generated if not provided: `config.yaml` → `config.json`)
- Returns `{ input: string, output: string, data: object }`

### `convertDir(dirPath, options?) → { converted, failed }`

- Recursively walks the directory tree using `walk()` IIFE
- Collects all `.yaml`/`.yml` files
- Sorts files alphabetically
- Calls `convertFile()` on each
- Returns `{ converted: string[], failed: { file, error }[] }`

---

## Module: yaml-parser.js (Parser Engine)

The `YamlParser` class is a **recursive descent parser** that operates on an array of lines with a shared cursor (`this.index`).

### State:
```js
this.lines   // string[] — all lines of the YAML input
this.index   // number   — current line position (shared cursor)
```

### Core parsing methods:

| Method | Purpose |
|--------|---------|
| `parse(yamlString)` | Entry point — normalizes input, detects root type, dispatches to `_parseMap` or `_parseSeq` |
| `_parseMap(baseIndent)` | Parses a YAML mapping (object) at the given indentation level |
| `_parseSeq(baseIndent)` | Parses a YAML sequence (array) at the given indentation level |
| `_resolveValue(val, base)` | Routes a value to the correct parser: nested block, block scalar, or inline |
| `_nestedBlock(base)` | Looks ahead to determine if the next block is a mapping or sequence |
| `_blockScalar(parentIndent, indicator, literal)` | Parses multi-line `|` (literal) and `>` (folded) block scalars |
| `_parseInline(v)` | Parses a single inline value — handles all scalar types, inline arrays, inline objects |

---

## Parser Internal Methods

### Helper methods:

| Method | Purpose |
|--------|---------|
| `_scanQuoted(str, cb)` | **Shared quote-aware scanner** — iterates through a string, tracking single/double quote state, and calls `cb(char, index, str)` for each unquoted character. Returns early if `cb` returns a value. Used by `_colonIdx`, `_stripComment`. |
| `_colonIdx(line)` | Finds the `:` that separates key from value, ignoring colons inside quoted strings. Requires colon to be followed by space, tab, or end of line. |
| `_stripComment(v)` | Removes inline comments (`# ...`) outside quoted strings |
| `_splitComma(str)` | Splits by `,` respecting quotes and nested `[]`/`{}` brackets |
| `_parseQuoted(v)` | Strips quotes and processes escape sequences (`\n`, `\t`, `\\`, etc.) for double-quoted strings; handles `''` → `'` for single-quoted strings |
| `_unquote(k)` | Strips surrounding quotes from a key if present |
| `_indent(line)` | Counts leading spaces (tabs count as 2 spaces) |
| `_nextLine(from)` | Finds the next meaningful line — skips empty lines, comments, `---`, `...` |

### The `_scanQuoted` pattern:

This is the key optimization — a single shared function that handles quote-aware scanning. Instead of duplicating quote-tracking logic in every method, `_colonIdx` and `_stripComment` both call `_scanQuoted` with a callback:

```js
// Find colon index (ignoring colons in quotes)
_colonIdx(line) {
  return this._scanQuoted(line, (c, i, s) => {
    if (c === ':' && (i + 1 >= s.length || s[i + 1] === ' ')) return i;
  }) ?? -1;
}

// Find comment start (ignoring # in quotes)
_stripComment(v) {
  const idx = this._scanQuoted(v, (c, i, s) => {
    if (c === '#' && (i === 0 || s[i - 1] === ' ')) return i;
  });
  return idx !== undefined ? v.substring(0, idx).trim() : v.trim();
}
```

---

## YAML Parsing Flow

### Mapping (object) parsing — `_parseMap(baseIndent)`:

```
1. Find next meaningful line
2. If indent < baseIndent → exit (back to parent)
3. If indent > baseIndent → skip (wrong level)
4. If starts with "- " → exit (sequence context)
5. Find colon index → extract key and value
6. If value is empty → look ahead for nested block
7. If value is |, |-, |+, >, >-, >+ → parse block scalar
8. Otherwise → parse as inline value
9. Repeat
```

### Sequence (array) parsing — `_parseSeq(baseIndent)`:

```
1. Find next meaningful line
2. If indent < baseIndent → exit
3. If not starting with "- " → exit
4. Extract content after "- "
5. If empty → look ahead for nested mapping/sequence
6. If contains ":" → parse as mapping entry (object in array)
7. Otherwise → parse as inline value
8. Repeat
```

---

## Type Coercion Rules

The `_parseInline(v)` method converts YAML scalar values to JavaScript types in this order:

| Priority | Check | Result |
|----------|-------|--------|
| 1 | `null`, `Null`, `NULL`, `~`, empty | `null` |
| 2 | `true`, `True`, `TRUE`, `yes`, `Yes`, `YES`, `on`, `On`, `ON` | `true` |
| 3 | `false`, `False`, `FALSE`, `no`, `No`, `NO`, `off`, `Off`, `OFF` | `false` |
| 4 | Quoted string (`"..."` or `'...'`) | String with escapes processed |
| 5 | Inline array (`[...]`) | Recursively parsed array |
| 6 | Inline object (`{...}`) | Recursively parsed object |
| 7 | Hex integer (`0xFF`) | `parseInt(v, 16)` |
| 8 | Octal integer (`0o77`) | `parseInt(v, 8)` |
| 9 | Integer (`42`, `-17`) | `parseInt(v, 10)` |
| 10 | Float (`3.14`, `1.5e10`) | `parseFloat(v)` |
| 11 | `.inf`, `.Inf`, `.INF` | `Infinity` |
| 12 | `-.inf` | `-Infinity` |
| 13 | `.nan`, `.NaN`, `.NAN` | `NaN` |
| 14 | Everything else | Plain string |

---

## Running Tests

```bash
cd yaml-to-json
node test.js
```

The test suite includes **36 tests** covering:
- Basic key-value pairs, booleans, null, numbers, hex, quoted strings, escapes
- Nested objects (2-3 levels deep)
- Block arrays, root arrays, inline arrays, empty arrays
- Inline objects, empty objects
- Root-level and nested arrays of objects
- Full-line and inline comments
- Literal block (`|`) and folded block (`>`)
- Document markers (`---`)
- Edge cases: empty input, comments only, TypeError on non-string
- `convertFile()`: file creation, content validation, error handling
- `convertDir()`: recursive traversal, nested subdirectories, error handling

---

## Publishing Updates

### Step 1: Make your changes

### Step 2: Run tests
```bash
node test.js
```

### Step 3: Bump version
```bash
npm version patch   # 1.0.0 → 1.0.1 (bug fix)
npm version minor   # 1.0.0 → 1.1.0 (new feature)
npm version major   # 1.0.0 → 2.0.0 (breaking change)
```

### Step 4: Publish
```bash
npm publish
```

### Step 5: Push to GitHub
```bash
git push && git push --tags
```

---

## Known Limitations

1. **No multi-document support** — Files with multiple `---` separated documents will only parse the first document
2. **No anchors/aliases** — `&anchor` and `*alias` are not supported
3. **No merge keys** — `<<:` merge syntax is not supported
4. **No complex keys** — Keys must be simple scalars (no multi-line keys or `? key` syntax)
5. **No tag directives** — `!!int`, `!!str`, `%YAML`, `%TAG` directives are ignored
6. **Tab indentation** — Tabs are converted to 2 spaces; mixing tabs and spaces may cause issues
7. **Infinity/NaN in JSON** — `JSON.stringify` converts `Infinity` to `null` and `NaN` to `null` (JSON spec limitation, not a parser bug)

These limitations cover edge cases rarely used in typical config files, CI/CD pipelines, and API specs. For most real-world YAML files (configs, OpenAPI specs, Docker Compose, GitHub Actions, etc.), the parser works correctly.

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b my-feature`
3. Make your changes
4. Run tests: `node test.js`
5. Commit: `git commit -m "Add my feature"`
6. Push: `git push origin my-feature`
7. Open a Pull Request

### Code style:
- No external dependencies — keep it zero-dep
- Keep methods small and focused
- Add tests for any new feature or bug fix
- Use `_` prefix for internal/private methods

---

## License

MIT
