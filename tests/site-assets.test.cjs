const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('all script and stylesheet references resolve inside repository', () => {
  const links = [...html.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)="([^"]+)"/g)]
    .map(match => match[1])
    .filter(url => !/^https?:\/\//.test(url));
  assert.equal(links.length, 8, 'seven runtime scripts and one local stylesheet expected');
  for (const link of links) {
    assert.ok(!link.startsWith('/'), 'relative GitHub Pages asset URL: ' + link);
    assert.ok(fs.existsSync(path.join(root, link.split('?')[0])), 'missing asset: ' + link);
  }
});

test('runtime JS stays in assets and loads in dependency order', () => {
  const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map(match => match[1]);
  // Cache-busting query strings may change without changing the dependency graph.
  assert.deepEqual(scripts.map(src => src.split('?')[0]), [
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

test('Emulator and Education are separate pages with reciprocal relative navigation', () => {
  const educationFile = path.join(root, 'assets/education/index.html');
  assert.ok(fs.existsSync(educationFile), 'Education page must be part of published assets');
  const education = fs.readFileSync(educationFile, 'utf8');
  assert.match(html, /href="assets\/education\/"/);
  assert.match(education, /href="\.\.\/\.\.\/"[^>]*>Emulator<\/a>/);
  assert.match(html, /aria-current="page" href="\.\/"[^>]*>Emulator<\/a>/);
  assert.match(education, /aria-current="page" href="\.\/"[^>]*>Education<\/a>/);
  assert.doesNotMatch(html, /class="reference-card"/, 'the instruction set is no longer on the Emulator page');
  assert.match(education, /id="instruction-set"/);
  assert.match(education, /id="decode"/);
  assert.match(education, /id="hardware"/);
  assert.equal([...education.matchAll(/class="isa-instruction"/g)].length, 12, 'all 12 standard instructions retained');
  assert.match(education, /JNC/);
  const assets = [...education.matchAll(/<(?:link|script)\b[^>]*?(?:href|src)="([^"]+)"/g)]
    .map(match => match[1])
    .filter(url => !/^https?:\/\//.test(url));
  for (const asset of assets) {
    assert.ok(fs.existsSync(path.resolve(path.dirname(educationFile), asset)),
      'Education asset exists: ' + asset);
  }
});

test('Pages workflow publishes the Education page with the asset directory', () => {
  const deploy = fs.readFileSync(path.join(root, '.github/workflows/deploy-pages.yml'), 'utf8');
  assert.match(deploy, /cp -a production\/assets publish\/assets/);
  assert.match(deploy, /cp -a preview\/assets publish\/develop\/assets/);
});

test('Education shares Emulator content width and workbench panel styles', () => {
  const education = fs.readFileSync(path.join(root, 'assets/education/index.html'), 'utf8');
  const educationCss = fs.readFileSync(path.join(root, 'assets/css/education.css'), 'utf8');
  const workbenchCss = fs.readFileSync(path.join(root, 'assets/css/workbench.css'), 'utf8');
  assert.match(workbenchCss, /\.page\{max-width:1600px\}/);
  assert.doesNotMatch(educationCss, /\.education-page\s*\{\s*max-width\s*:/);
  assert.match(education, /class="page education-page"/);
  assert.match(education, /class="quick-start education-hero"/);
  assert.equal((education.match(/class="panel edu-section"/g) || []).length, 10, 'overview, binary, cycle, datapath, decode, walkthrough, hardware, hardware-details, practice and FAQ');
  assert.match(educationCss, /\.education-hero\{[^}]*background:var\(--surface\)/);
  assert.doesNotMatch(educationCss, /linear-gradient\(/);
});

test('Emulator power status sits to the left of Emulator / Education navigation', () => {
  const header = html.match(/<div class="header-right">([\s\S]*?)<\/div>/);
  assert.ok(header, 'right-hand header controls exist');
  const statusIndex = header[1].indexOf('id="runStatus"');
  const navIndex = header[1].indexOf('class="primary-nav"');
  assert.ok(statusIndex !== -1 && navIndex !== -1 && statusIndex < navIndex, 'status before navigation');
});
