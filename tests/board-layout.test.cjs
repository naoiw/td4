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
