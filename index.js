/**
 * yaml-to-json-converter
 * A zero-dependency YAML to JSON converter for Node.js
 *
 * API:
 *   yaml.parse(yamlString)        → JS object
 *   yaml.convertFile('a.yaml')    → a.json
 *   yaml.convertDir('./configs')  → converts all YAML recursively
 */

const fs = require('fs');
const path = require('path');
const YamlParser = require('./yaml-parser');

function parse(yamlString) {
  if (typeof yamlString !== 'string') {
    throw new TypeError('Expected a string argument, got ' + typeof yamlString);
  }
  const parser = new YamlParser();
  return parser.parse(yamlString);
}

function convertFile(inputPath, outputPath, indent = 2) {
  const resolvedInput = path.resolve(inputPath);
  if (!fs.existsSync(resolvedInput)) throw new Error('File not found: ' + resolvedInput);
  const ext = path.extname(resolvedInput).toLowerCase();
  if (ext !== '.yaml' && ext !== '.yml') throw new Error('Not a YAML file: ' + resolvedInput);
  const data = parse(fs.readFileSync(resolvedInput, 'utf8'));
  const json = JSON.stringify(data, null, indent);
  if (!outputPath) {
    outputPath = path.join(path.dirname(resolvedInput), path.basename(resolvedInput, ext) + '.json');
  }
  const resolvedOutput = path.resolve(outputPath);
  fs.writeFileSync(resolvedOutput, json + '\n', 'utf8');
  return { input: resolvedInput, output: resolvedOutput, data };
}

function convertDir(dirPath, options = {}) {
  const { indent = 2 } = options;
  const resolvedDir = path.resolve(dirPath);
  if (!fs.existsSync(resolvedDir) || !fs.statSync(resolvedDir).isDirectory()) {
    throw new Error('Directory not found: ' + resolvedDir);
  }
  const files = [], converted = [], failed = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const fp = path.join(dir, e.name);
      if (e.isDirectory()) walk(fp);
      else if (e.isFile() && /\.(yaml|yml)$/i.test(e.name)) files.push(fp);
    }
  })(resolvedDir);
  files.sort();
  for (const f of files) {
    try { converted.push(convertFile(f, undefined, indent).output); }
    catch (err) { failed.push({ file: f, error: err.message }); }
  }
  return { converted, failed };
}

module.exports = { parse, convertFile, convertDir };