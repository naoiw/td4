/** Synchronize the browser-facing data file with the reviewed schematic netlist. */
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(resolve(root, 'src/data/netlist.json'), 'utf8'));
if (data.schemaVersion !== 1 || !data.pinNets || !data.pinNames || !data.romSwitches)
  throw new Error('Invalid src/data/netlist.json schema');
for (const [id, type] of Object.entries(data.components)) {
  const count = {'74HC74':14,'74HC14':14,'74HC161':16,'74HC153':16,'74HC283':16,
    '74HC32':14,'74HC10':14,'74HC540':20,'74HC154':24}[type];
  if (!count || !data.pinNets[id] || Object.keys(data.pinNames[id] || {}).length !== count)
    throw new Error('Missing physical pin metadata for ' + id);
  for (const pin of Object.keys(data.pinNets[id]))
    if (Number(pin) < 1 || Number(pin) > count || !data.pinNames[id][pin])
      throw new Error('Invalid connection at ' + id + '.' + pin);
}
// Only the documented gate pin groups are used; validate every contact is connected.
for (const [id, expectedCount] of [['U10', 4], ['U11', 3]]) {
  const groups = data.gateGroups?.[id];
  if (!Array.isArray(groups) || groups.length !== expectedCount)
    throw new Error('Invalid PDF gate groups for ' + id);
  for (const group of groups) {
    for (const pin of [...group.inputPins, group.outputPin])
      if (!data.pinNets[id]?.[pin] || !data.nets[data.pinNets[id][pin]]?.includes(id + '.' + pin))
        throw new Error('Missing or untracked gate connection: ' + id + '.' + pin);
  }
}
const header = "/* Generated from src/data/netlist.json — do not edit. */\n(function (root) {\n  'use strict';\n  const netlist = ";
const footer = ";\n  root.TD4Netlist = netlist;\n  if (typeof module === 'object' && module.exports) module.exports = netlist;\n})(globalThis);\n";
const output = header + JSON.stringify(data) + footer;
const path = resolve(root, 'assets/js/data/netlist.js');
mkdirSync(dirname(path), {recursive:true});
writeFileSync(path, output, 'utf8');
