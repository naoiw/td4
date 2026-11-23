'use strict';

// Load specific *compiled* application functions for behavior tests.
// AST lookup avoids the fragile "slice between neighboring comments" pattern,
// while keeping the production browser bundle unchanged.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
const appPath = path.join(root, 'assets/js/ui/app.js');
const compiled = fs.readFileSync(appPath, 'utf8');
const parsed = ts.createSourceFile(appPath, compiled, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);

const declarations = new Map();
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name) {
    const name = node.name.text;
    assert.ok(!declarations.has(name), 'duplicate compiled function: ' + name);
    declarations.set(name, node.getText(parsed));
  }
  ts.forEachChild(node, visit);
}
visit(parsed);

function loadAppFunctions(names, context = {}) {
  assert.ok(Array.isArray(names) && names.length > 0, 'function names are required');
  assert.equal(new Set(names).size, names.length, 'function names must be unique');
  for (const name of names) {
    assert.match(name, /^[A-Za-z_$][\w$]*$/);
    assert.ok(declarations.has(name), 'missing compiled function: ' + name);
  }
  const source = names.map(name => declarations.get(name)).join('\n\n') +
    '\n({ ' + names.join(', ') + ' })';
  return vm.runInNewContext(source, context, {filename:'compiled-app-functions.js'});
}

module.exports = {loadAppFunctions};
