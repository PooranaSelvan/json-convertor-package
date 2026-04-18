const fs = require('fs');
const path = require('path');
const yaml = require('./index');

let passed = 0, failed = 0;

function assert(cond, name) {
  if (cond) { console.log(`  ✓ ${name}`); passed++; }
  else { console.error(`  ✗ ${name}`); failed++; }
}
function eq(a, b, name) {
  const m = JSON.stringify(a) === JSON.stringify(b);
  if (m) { console.log(`  ✓ ${name}`); passed++; }
  else { console.error(`  ✗ ${name}\n    Got: ${JSON.stringify(a)}\n    Exp: ${JSON.stringify(b)}`); failed++; }
}

console.log('\n── parse() basics ──');
eq(yaml.parse('name: Alice\nage: 25'), {name:'Alice',age:25}, 'Key-value pairs');
eq(yaml.parse('active: true\noff: false'), {active:true,off:false}, 'Booleans true/false');
eq(yaml.parse('a: yes\nb: no'), {a:true,b:false}, 'Booleans yes/no');
eq(yaml.parse('a: null\nb: ~'), {a:null,b:null}, 'Null values');
eq(yaml.parse('a: 42\nb: -17\nc: 3.14'), {a:42,b:-17,c:3.14}, 'Numbers');
eq(yaml.parse('h: 0xFF'), {h:255}, 'Hex number');
eq(yaml.parse('a: "hello"\nb: \'world\''), {a:'hello',b:'world'}, 'Quoted strings');
eq(yaml.parse('a: "line1\\nline2"'), {a:'line1\nline2'}, 'Escape sequences');

console.log('\n── parse() nested ──');
eq(yaml.parse('db:\n  host: localhost\n  port: 5432'), {db:{host:'localhost',port:5432}}, 'Nested object');
eq(yaml.parse('a:\n  b:\n    c: deep'), {a:{b:{c:'deep'}}}, 'Deep nesting');

console.log('\n── parse() arrays ──');
eq(yaml.parse('items:\n  - one\n  - two'), {items:['one','two']}, 'Block array');
eq(yaml.parse('- apple\n- banana'), ['apple','banana'], 'Root array');
eq(yaml.parse('c: [1, 2, 3]'), {c:[1,2,3]}, 'Inline array');
eq(yaml.parse('e: []'), {e:[]}, 'Empty array');

console.log('\n── parse() inline objects ──');
eq(yaml.parse('p: {name: John, age: 30}'), {p:{name:'John',age:30}}, 'Inline object');
eq(yaml.parse('e: {}'), {e:{}}, 'Empty object');

console.log('\n── parse() array of objects ──');
eq(yaml.parse('- name: A\n  age: 1\n- name: B\n  age: 2'), [{name:'A',age:1},{name:'B',age:2}], 'Root array of objects');
eq(yaml.parse('u:\n  - name: A\n    r: admin\n  - name: B\n    r: user'), {u:[{name:'A',r:'admin'},{name:'B',r:'user'}]}, 'Nested array of objects');

console.log('\n── parse() comments ──');
eq(yaml.parse('# comment\nname: Alice\n# another\nage: 25'), {name:'Alice',age:25}, 'Full-line comments');
eq(yaml.parse('name: Alice # inline'), {name:'Alice'}, 'Inline comment');

console.log('\n── parse() multi-line ──');
const lit = yaml.parse('t: |\n  line one\n  line two');
assert(lit.t === 'line one\nline two\n', 'Literal block (|)');
const fold = yaml.parse('t: >\n  line one\n  line two');
assert(fold.t === 'line one line two\n', 'Folded block (>)');

console.log('\n── parse() edge cases ──');
eq(yaml.parse(''), {}, 'Empty string');
eq(yaml.parse('# only comments'), {}, 'Only comments');
eq(yaml.parse('---\nname: test'), {name:'test'}, 'Document marker');
let threw = false; try { yaml.parse(123); } catch(e) { threw = true; }
assert(threw, 'TypeError for non-string');

console.log('\n── convertFile() ──');
const tmp = path.join(__dirname, '_test_tmp');
fs.mkdirSync(tmp, {recursive:true});
fs.writeFileSync(path.join(tmp,'t.yaml'), 'a:\n  b: 1\n', 'utf8');
const res = yaml.convertFile(path.join(tmp,'t.yaml'));
assert(fs.existsSync(path.join(tmp,'t.json')), 'JSON created');
eq(JSON.parse(fs.readFileSync(path.join(tmp,'t.json'),'utf8')), {a:{b:1}}, 'JSON content correct');
assert(res.data.a.b === 1, 'Return data correct');
let t1=false; try{yaml.convertFile('./nope.yaml')}catch(e){t1=true;} assert(t1,'Error on missing file');
fs.writeFileSync(path.join(tmp,'x.txt'),'hi','utf8');
let t2=false; try{yaml.convertFile(path.join(tmp,'x.txt'))}catch(e){t2=true;} assert(t2,'Error on non-YAML');

console.log('\n── convertDir() ──');
const sub = path.join(tmp,'sub');
fs.mkdirSync(sub, {recursive:true});
fs.writeFileSync(path.join(tmp,'a.yaml'), 'k: a\n', 'utf8');
fs.writeFileSync(path.join(sub,'b.yml'), 'k: b\n', 'utf8');
const dr = yaml.convertDir(tmp);
assert(dr.converted.length >= 3, 'Recursive conversion');
assert(dr.failed.length === 0, 'No failures');
assert(fs.existsSync(path.join(sub,'b.json')), 'Nested file converted');
eq(JSON.parse(fs.readFileSync(path.join(sub,'b.json'),'utf8')), {k:'b'}, 'Nested content correct');
let t3=false; try{yaml.convertDir('./nope')}catch(e){t3=true;} assert(t3,'Error on missing dir');

fs.rmSync(tmp, {recursive:true, force:true});

console.log(`\n══════════════════════════════\n  ${passed} passed, ${failed} failed\n══════════════════════════════\n`);
process.exit(failed > 0 ? 1 : 0);