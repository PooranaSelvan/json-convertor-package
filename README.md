# yaml2json-api

A **zero-dependency** YAML to JSON converter for Node.js. Written from scratch — no `js-yaml`, no `yaml`, no external libraries. Just **3.9 kB** compressed.

[![npm version](https://img.shields.io/npm/v/yaml2json-api)](https://www.npmjs.com/package/yaml2json-api)
[![license](https://img.shields.io/npm/l/yaml2json-api)](https://opensource.org/licenses/MIT)

---

## Installation

```bash
npm install yaml2json-api
```

---

## Quick Start

```js
const yaml = require("yaml2json-api");

// Parse a YAML string
const config = yaml.parse(`
server:
  host: localhost
  port: 3000
  debug: true
`);

console.log(config.server.port); // 3000
```

---

## API Reference

### `yaml.parse(yamlString)`

Parses a YAML string and returns a JavaScript object or array.

**Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `yamlString` | `string` | YAML content to parse |

**Returns:** `object | array`

**Example — Object:**
```js
const yaml = require("yaml2json-api");

const data = yaml.parse(`
name: John Doe
age: 30
hobbies:
  - reading
  - coding
  - hiking
`);

console.log(data);
// {
//   name: 'John Doe',
//   age: 30,
//   hobbies: ['reading', 'coding', 'hiking']
// }
```

**Example — Array:**
```js
const users = yaml.parse(`
- name: Alice
  role: admin
- name: Bob
  role: viewer
`);

console.log(users);
// [
//   { name: 'Alice', role: 'admin' },
//   { name: 'Bob', role: 'viewer' }
// ]
```

---

### `yaml.convertFile(inputPath, outputPath?, indent?)`

Converts a `.yaml` or `.yml` file to a `.json` file.

**Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `inputPath` | `string` | — | Path to the YAML file |
| `outputPath` | `string` | auto | Output JSON path (defaults to same name with `.json`) |
| `indent` | `number` | `2` | JSON indentation spaces |

**Returns:** `{ input: string, output: string, data: object }`

**Example:**
```js
const yaml = require("yaml2json-api");

// config.yaml → config.json (auto-named)
const result = yaml.convertFile("./config.yaml");
console.log("Created:", result.output);

// Custom output path
yaml.convertFile("./config.yaml", "./dist/config.json");

// Compact JSON (no indentation)
yaml.convertFile("./config.yaml", "./config.min.json", 0);
```

---

### `yaml.convertDir(dirPath, options?)`

Recursively finds all `.yaml` and `.yml` files in a directory (including subdirectories) and converts each to a `.json` file.

**Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `dirPath` | `string` | — | Directory to search |
| `options.indent` | `number` | `2` | JSON indentation spaces |

**Returns:** `{ converted: string[], failed: { file: string, error: string }[] }`

**Example:**
```js
const yaml = require("yaml2json-api");

const results = yaml.convertDir("./my-project");

console.log(`✓ Converted: ${results.converted.length} files`);
console.log(`✗ Failed: ${results.failed.length} files`);

// List converted files
results.converted.forEach(f => console.log("  →", f));
```

---

## ES Module Support

Works with both CommonJS and ES Modules:

```js
// CommonJS
const yaml = require("yaml2json-api");

// ES Module (.mjs or "type": "module")
import { parse, convertFile, convertDir } from "yaml2json-api/index.js";
```

---

## Supported YAML Features

| Feature | Example | Parsed As |
|---------|---------|-----------|
| Strings | `name: hello` | `"hello"` |
| Quoted strings | `"hello\nworld"` | `"hello\nworld"` |
| Single-quoted | `'it''s'` | `"it's"` |
| Integers | `42`, `-17` | `42`, `-17` |
| Hex / Octal | `0xFF`, `0o77` | `255`, `63` |
| Floats | `3.14`, `1.5e10` | `3.14`, `15000000000` |
| Booleans | `true`, `yes`, `on` | `true` |
| Booleans | `false`, `no`, `off` | `false` |
| Null | `null`, `~`, empty | `null` |
| Nested objects | Indentation-based | `{ a: { b: 1 } }` |
| Block arrays | `- item` | `["item"]` |
| Inline arrays | `[1, 2, 3]` | `[1, 2, 3]` |
| Inline objects | `{a: 1, b: 2}` | `{a: 1, b: 2}` |
| Literal blocks | `\|` | Preserves newlines |
| Folded blocks | `>` | Joins into paragraph |
| Block modifiers | `\|-`, `\|+`, `>-`, `>+` | Strip/keep trailing newlines |
| Comments | `# ignored` | Stripped |
| Inline comments | `key: val # note` | `"val"` |
| Document markers | `---`, `...` | Skipped |

---

## Package Info

| | |
|-|-|
| **Size** | 3.9 kB compressed, 12 kB unpacked |
| **Dependencies** | Zero |
| **Node.js** | >= 12.0.0 |
| **License** | MIT |

---