const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('all script and stylesheet references resolve inside repository', () => {
  const links = [...html.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)="([^"]+)"/g)].map(match => match[1]);
  assert.equal(links.length, 8, 'seven scripts and one stylesheet expected');
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
    'assets/js/data/netlist.js',
    'assets/js/core/ic-circuit.js',
    'assets/js/ui/board.js',
    'assets/js/ui/app.js'
  ]);
  for (const file of ['app.js', 'td4-core.js', 'samples.js', 'signals.js']) {
    assert.ok(!fs.existsSync(path.join(root, file)), 'root runtime file must be removed: ' + file);
  }
});


test('CSS imports resolve in the intended cascade order', () => {
  const entry = fs.readFileSync(path.join(root, 'assets/css/style.css'), 'utf8');
  const imports = [...entry.matchAll(/@import\s+url\(["']?\.\/([^"')]+)["']?\)/g)].map(match => match[1]);
  assert.deepEqual(imports, ['foundation.css', 'workbench.css', 'circuit-board.css']);
  for (const file of imports) {
    const css = fs.readFileSync(path.join(root, 'assets/css', file), 'utf8');
    assert.ok(css.length > 200, 'nonempty stylesheet: ' + file);
  }
});


test('footer uses shared Pages layout and points to this repository', () => {
  const footerMatch = html.match(/<footer class="site-footer">([\s\S]*?)<\/footer>/);
  assert.ok(footerMatch, 'dedicated footer must exist');
  const footer = footerMatch[1];
  assert.match(footer, /© 2026 naoiw/);
  assert.match(footer, /href="https:\/\/github\.com\/naoiw\/td4"/);
  assert.match(footer, /GitHub\s*<span aria-hidden="true">↗<\/span>/);
  assert.match(footer, /target="_blank"/);
  assert.match(footer, /rel="noopener noreferrer"/);
  const css = fs.readFileSync(path.join(root, 'assets/css/foundation.css'), 'utf8');
  assert.match(css, /\.site-footer\s*\{[^}]*display:\s*flex/);
  assert.match(css, /\.site-footer\s*\{[^}]*justify-content:\s*space-between/);
  assert.match(css, /\.site-footer\s*\{[^}]*border-top:\s*1px solid var\(--line\)/);
  assert.match(css, /\.site-footer a\s*\{[^}]*margin-left:\s*auto/);
});

test('clock frequency is controlled only by PCB 2Hz / 10Hz switch', () => {
  assert.match(html, /id="boardClockSwitch"/);
  assert.match(html, /<span>10Hz<\/span><span>2Hz<\/span>/);
  assert.doesNotMatch(html, /<select id="speed"/);
  const source = fs.readFileSync(path.join(root, 'src/ui/app.ts'), 'utf8');
  assert.match(source, /let boardClockHz: 2 \| 10 = 2/);
  assert.match(source, /const halfPeriod = 500 \/ boardClockHz/);
});
