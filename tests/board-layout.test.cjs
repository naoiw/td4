const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '../assets/css/style.css'), 'utf8');
const rule = selector => {
  const match = css.match(new RegExp('\\.' + selector + '\\s*\\{([^}]*)\\}'));
  assert.ok(match, selector + ' CSS rule must exist');
  return match[1];
};

test('ROM DIP switches occupy two columns with addresses 0-7, 8-F vertically', () => {
  const rom = rule('rom-dip-grid');
  assert.match(rom, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(rom, /grid-template-rows:\s*repeat\(8,\s*max-content\)/);
  assert.match(rom, /grid-auto-flow:\s*column/);
});

test('IO panels stack vertically and provide extra space for ICs', () => {
  const io = rule('schematic-io-strip');
  assert.match(io, /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  const board = rule('schematic-board');
  assert.match(board, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+380px/);
});


test('IC cards are approximately half-width, with four per row instead of two', () => {
  const matches = [...css.matchAll(/\.ic-chip-grid\s*\{([^}]*)\}/g)];
  assert.ok(matches.length > 0);
  assert.match(matches.at(-1)[1], /grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
});

test('DIP drawing uses fixed 2.54mm lead pitch and proportional package lengths', () => {
  const footprint = rule('ic-footprint');
  assert.match(footprint, /height:\s*var\(--dip-height\)/);
  const body = rule('ic-footprint-body');
  assert.match(body, /width:\s*var\(--dip-body-width\)/);
  for (const [pins, height] of [[14,126],[16,144],[20,180],[24,216]]) {
    const compactCss = css.replace(/\s+/g, '');
    assert.ok(compactCss.includes('.ic-dip[data-package-pins="' + pins + '"]{--dip-height:' + height + 'px'), 'DIP-' + pins + ' footprint height');
  }
  assert.match(css, /--dip-pitch:\s*18px/);
  assert.match(css, /--dip-span:\s*54px/);
  assert.match(css, /--dip-span:\s*108px/);
  const leg = rule('ic-leg');
  // Explicit selectors under .ic-footprint must use a fixed pitch, not justify-content:space-around.
  assert.match(css, /\.ic-footprint \.ic-leg\s*\{[^}]*flex:0 0 var\(--dip-pitch\)/);
  assert.match(css, /\.ic-footprint \.ic-leg-bank\s*\{[^}]*justify-content:flex-start/);
});

test('physical footprint is separate from logical signal probes', () => {
  const app = fs.readFileSync(path.join(__dirname, '../assets/js/ui/app.js'), 'utf8');
  assert.match(app, /footprint\.append\(bank\)/);
  assert.match(app, /card\.append\(title,\s*desc,\s*footprint,\s*pinList\)/);
  assert.match(app, /packageMark\.textContent\s*=\s*chip\.type/);
});
