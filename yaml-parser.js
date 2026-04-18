// yaml-parser.js — Zero-dependency YAML parser

class YamlParser {
  constructor() { this.lines = []; this.index = 0; }

  parse(yamlString) {
    this.lines = yamlString.replace(/\r\n|\r/g, '\n').split('\n');
    this.index = 0;
    while (this.lines.length && this.lines[this.lines.length - 1].trim() === '') this.lines.pop();
    if (!this.lines.length) return {};
    const fi = this._nextLine(0);
    if (fi === -1) return {};
    const s = this.lines[fi].trimStart();
    return (s.startsWith('- ') || s === '-')
      ? this._parseSeq(this._indent(this.lines[fi]))
      : this._parseMap(this._indent(this.lines[fi]));
  }

  _parseMap(base) {
    const r = {};
    while (this.index < this.lines.length) {
      const li = this._nextLine(this.index);
      if (li === -1) break;
      const line = this.lines[li], ind = this._indent(line);
      if (ind < base) break;
      if (ind > base) { this.index = li + 1; continue; }
      this.index = li;
      const s = line.trimStart();
      if (s.startsWith('- ')) break;
      const ci = this._colonIdx(s);
      if (ci === -1) { this.index++; continue; }
      const key = this._unquote(s.substring(0, ci).trim());
      const val = s.substring(ci + 1).trim();
      this.index++;
      r[key] = this._resolveValue(val, base);
    }
    return r;
  }

  _parseSeq(base) {
    const r = [];
    while (this.index < this.lines.length) {
      const li = this._nextLine(this.index);
      if (li === -1) break;
      const line = this.lines[li], ind = this._indent(line);
      if (ind < base) break;
      if (ind > base) { this.index = li + 1; continue; }
      const s = line.trimStart();
      if (!s.startsWith('- ')) {
        if (s === '-') { this.index = li + 1; r.push(null); continue; }
        break;
      }
      this.index = li + 1;
      const after = s.substring(2).trim();
      if (after === '') { r.push(this._nestedBlock(base)); continue; }
      const ci = this._colonIdx(after);
      if (ci !== -1 && after[0] !== '{' && after[0] !== '[') {
        const key = this._unquote(after.substring(0, ci).trim());
        const val = after.substring(ci + 1).trim();
        const obj = {};
        obj[key] = this._resolveValue(val, base);
        const ni = this._nextLine(this.index);
        if (ni !== -1 && this._indent(this.lines[ni]) > base && !this.lines[ni].trimStart().startsWith('- '))
          Object.assign(obj, this._parseMap(this._indent(this.lines[ni])));
        r.push(obj);
      } else {
        r.push(this._parseInline(after));
      }
    }
    return r;
  }

  _resolveValue(val, base) {
    if (val === '' || val === null) return this._nestedBlock(base);
    if (/^\|[+-]?$/.test(val)) return this._blockScalar(base, val, true);
    if (/^>[+-]?$/.test(val)) return this._blockScalar(base, val, false);
    return this._parseInline(val);
  }

  _nestedBlock(base) {
    const ni = this._nextLine(this.index);
    if (ni === -1) return null;
    const nind = this._indent(this.lines[ni]);
    if (nind <= base) return null;
    const ns = this.lines[ni].trimStart();
    return (ns.startsWith('- ') || ns === '-') ? this._parseSeq(nind) : this._parseMap(nind);
  }

  _blockScalar(parentIndent, indicator, literal) {
    const lines = [];
    let bi = -1;
    while (this.index < this.lines.length) {
      const line = this.lines[this.index];
      if (line.trim() === '') { lines.push(''); this.index++; continue; }
      const ind = this._indent(line);
      if (bi === -1) { if (ind <= parentIndent) break; bi = ind; }
      if (ind < bi) break;
      lines.push(line.substring(bi));
      this.index++;
    }
    let res;
    if (literal) {
      res = lines.join('\n');
    } else {
      res = '';
      for (let i = 0; i < lines.length; i++) {
        if (lines[i] === '') res += '\n';
        else if (i > 0 && lines[i - 1] !== '' && res.length && !res.endsWith('\n')) res += ' ' + lines[i];
        else res += lines[i];
      }
    }
    const ch = indicator[indicator.length - 1];
    if (ch === '-') return res.replace(/\n+$/, '');
    if (ch === '+') return res + '\n';
    return res.replace(/\n+$/, '') + '\n';
  }

  _parseInline(v) {
    if (v == null || v === '') return null;
    v = this._stripComment(v);
    if (v === '' || v === 'null' || v === 'Null' || v === 'NULL' || v === '~') return null;
    if (/^(true|True|TRUE|yes|Yes|YES|on|On|ON)$/.test(v)) return true;
    if (/^(false|False|FALSE|no|No|NO|off|Off|OFF)$/.test(v)) return false;
    if ((v[0] === '"' && v[v.length - 1] === '"') || (v[0] === "'" && v[v.length - 1] === "'")) return this._parseQuoted(v);
    if (v[0] === '[' && v[v.length - 1] === ']') {
      const inner = v.slice(1, -1).trim();
      return inner === '' ? [] : this._splitComma(inner).map(x => this._parseInline(x.trim()));
    }
    if (v[0] === '{' && v[v.length - 1] === '}') {
      const inner = v.slice(1, -1).trim();
      if (inner === '') return {};
      const r = {};
      for (const p of this._splitComma(inner)) {
        const ci = p.indexOf(':');
        if (ci !== -1) r[this._unquote(p.substring(0, ci).trim())] = this._parseInline(p.substring(ci + 1).trim());
      }
      return r;
    }
    if (/^-?0x[0-9a-fA-F]+$/.test(v)) return parseInt(v, 16);
    if (/^-?0o[0-7]+$/.test(v)) return parseInt(v.replace('0o', ''), 8);
    if (/^-?\d+$/.test(v)) return parseInt(v, 10);
    if (/^-?\d+\.\d+$/.test(v) || /^-?\d+(\.\d+)?[eE][+-]?\d+$/.test(v)) return parseFloat(v);
    if (/^\.inf$/i.test(v)) return Infinity;
    if (/^-\.inf$/i.test(v)) return -Infinity;
    if (/^\.nan$/i.test(v)) return NaN;
    return v;
  }

  _parseQuoted(v) {
    const q = v[0], inner = v.slice(1, -1);
    return q === '"'
      ? inner.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r').replace(/\\\\/g, '\\').replace(/\\"/g, '"').replace(/\\0/g, '\0')
      : inner.replace(/''/g, "'");
  }

  _scanQuoted(str, cb) {
    let sq = false, dq = false;
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      if (c === '\\' && dq && i + 1 < str.length) { i++; continue; }
      if (c === '"' && !sq) { dq = !dq; continue; }
      if (c === "'" && !dq) { sq = !sq; continue; }
      if (!sq && !dq) { const r = cb(c, i, str); if (r !== undefined) return r; }
    }
    return undefined;
  }

  _colonIdx(line) {
    return this._scanQuoted(line, (c, i, s) => {
      if (c === ':' && (i + 1 >= s.length || s[i + 1] === ' ' || s[i + 1] === '\t')) return i;
    }) ?? -1;
  }

  _stripComment(v) {
    const idx = this._scanQuoted(v, (c, i, s) => {
      if (c === '#' && (i === 0 || s[i - 1] === ' ' || s[i - 1] === '\t')) return i;
    });
    return idx !== undefined ? v.substring(0, idx).trim() : v.trim();
  }

  _splitComma(str) {
    const items = [];
    let cur = '', depth = 0, sq = false, dq = false;
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      if (c === '\\' && dq && i + 1 < str.length) { cur += c + str[++i]; continue; }
      if (c === '"' && !sq) { dq = !dq; cur += c; continue; }
      if (c === "'" && !dq) { sq = !sq; cur += c; continue; }
      if (!sq && !dq) {
        if (c === '[' || c === '{') depth++;
        if (c === ']' || c === '}') depth--;
        if (c === ',' && depth === 0) { items.push(cur.trim()); cur = ''; continue; }
      }
      cur += c;
    }
    if (cur.trim()) items.push(cur.trim());
    return items;
  }

  _unquote(k) {
    return ((k[0] === '"' && k[k.length - 1] === '"') || (k[0] === "'" && k[k.length - 1] === "'"))
      ? k.slice(1, -1) : k;
  }

  _indent(line) {
    let n = 0;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === ' ') n++;
      else if (line[i] === '\t') n += 2;
      else break;
    }
    return n;
  }

  _nextLine(from) {
    for (let i = from; i < this.lines.length; i++) {
      const t = this.lines[i].trim();
      if (t !== '' && t[0] !== '#' && t !== '---' && t !== '...') return i;
    }
    return -1;
  }
}

module.exports = YamlParser;
