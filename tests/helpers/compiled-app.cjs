'use strict';

// Load named functions from the exact compiled JavaScript shipped to browsers.
// The AST lookup avoids slicing functions at comment boundaries.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
const compiledCache = new Map();

function declarationsFor(bundle) {
  assert.match(bundle, /^(?:app|board)\.js$/, 'only known compiled UI entrypoints');
  if (compiledCache.has(bundle)) return compiledCache.get(bundle);

  const file = path.join(root, 'assets/js/ui', bundle);
  const source = fs.readFileSync(file, 'utf8');
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
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
  compiledCache.set(bundle, declarations);
  return declarations;
}

function loadCompiledUIFunctions(bundle, names, context = {}) {
  assert.ok(Array.isArray(names) && names.length > 0, 'function names are required');
  assert.equal(new Set(names).size, names.length, 'function names must be unique');
  const declarations = declarationsFor(bundle);
  for (const name of names) {
    assert.match(name, /^[A-Za-z_$][\w$]*$/);
    assert.ok(declarations.has(name), 'missing compiled function: ' + name);
  }
  const source = names.map(name => declarations.get(name)).join('\n\n') +
    '\n({ ' + names.join(', ') + ' })';
  return vm.runInNewContext(source, context, {filename:'compiled-ui-' + bundle});
}

function loadAppFunctions(names, context = {}) {
  return loadCompiledUIFunctions('app.js', names, context);
}

module.exports = {loadAppFunctions, loadCompiledUIFunctions};
