// Minimal, dependency-free style checks for the TypeScript editing sources.
import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';

function filesIn(dir) {
  return readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? filesIn(full) : full.endsWith('.ts') ? [full] : [];
  });
}

const paths = [...filesIn('src'), 'package.json', 'tsconfig.json'];
const failures = [];
for (const path of paths) {
  const contents = readFileSync(path, 'utf8');
  if (contents.includes('\r')) failures.push(path + ': CR character (use LF)');
  if (!contents.endsWith('\n')) failures.push(path + ': missing final newline');
  const lines = contents.split('\n');
  lines.forEach((line, index) => {
    if (/[ \t]+$/.test(line)) failures.push(path + ':' + (index + 1) + ': trailing whitespace');
    if (/^\t/.test(line)) failures.push(path + ':' + (index + 1) + ': tab indentation');
  });
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Source formatting checks passed (' + paths.length + ' files)');
}
