const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('all script and stylesheet references resolve inside repository', () => {
  const links = [...html.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)="([^"]+)"/g)].map(match => match[1]);
  assert.equal(links.length, 5, 'four scripts and one stylesheet expected');
  for (const link of links) {
    assert.ok(!link.startsWith('/'), 'relative GitHub Pages asset URL: ' + link);
    assert.ok(fs.existsSync(path.join(root, link)), 'missing asset: ' + link);
  }
});

test('runtime JS stays in assets and loads in dependency order', () => {
  const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(scripts, [
    'assets/js/core/td4-core.js',
    'assets/js/data/samples.js',
    'assets/js/core/signals.js',
    'assets/js/ui/app.js'
  ]);
  for (const file of ['app.js', 'td4-core.js', 'samples.js', 'signals.js']) {
    assert.ok(!fs.existsSync(path.join(root, file)), 'root runtime file must be removed: ' + file);
  }
});
