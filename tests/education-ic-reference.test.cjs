'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'assets', 'education', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets', 'css', 'education.css'), 'utf8');
const netlist = JSON.parse(fs.readFileSync(path.join(root, 'src', 'data', 'netlist.json'), 'utf8'));

test('Education offers a linked 74HC reference for all nine chip types', () => {
  const parts = ['74HC161', '74HC153', '74HC283', '74HC74', '74HC32', '74HC10', '74HC14', '74HC154', '74HC540'];
  assert.match(html, /href="#hardware-details"/);
  assert.match(html, /id="hardware-details"/);
  assert.equal((html.match(/class="edu-ic-card"/g) || []).length, parts.length);
  for (const part of parts) {
    const id = 'ic-' + part.toLowerCase();
    assert.ok(html.includes('id="' + id + '"'), 'detail: ' + part);
    assert.ok(html.includes('href="#' + id + '"'), 'index: ' + part);
  }
  assert.match(css, /\.edu-ic-card\{/);
  assert.match(css, /\.edu-ic-pins\{/);
});

test('chip pinout is generated from repository netlist with no invented wire names', () => {
  const representative = ['U3', 'U7', 'U9', 'U1', 'U10', 'U11', 'U2', 'U13', 'U12'];
  for (const unit of representative) {
    const match = html.match(new RegExp('<table class="edu-ic-pins" data-component="' + unit + '"[^>]*>([\\s\\S]*?)<\\/table>'));
    assert.ok(match, 'DIP table of ' + unit);
    const table = match[1];
    const pins = Object.entries(netlist.pinNames[unit]);
    assert.equal((table.match(/<th scope="row">/g) || []).length, pins.length, 'pin count ' + unit);
    for (const [number, name] of pins) {
      assert.ok(table.includes('<code>' + name + '</code>'), unit + ' pin name: ' + number);
      const mapped = netlist.pinNets[unit][number];
      if (mapped) assert.ok(table.includes('<small>' + mapped + '</small>'), unit + ' mapped net: ' + number);
    }
  }
});

test('important distinctions are explicitly included in educational text', () => {
  assert.match(html, /未モデル化/);
  assert.match(html, /COUT/);
  assert.match(html, /ROM_RAW0/);
  assert.match(html, /アクティブLOW/);
  assert.match(html, /高インピーダンス/);
  assert.match(html, /https:\/\/www\.ti\.com\/product\/CD74HC283/);
  assert.match(html, /https:\/\/www\.ti\.com\/product\/SN74HC161/);
});
