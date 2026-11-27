// Minimal, dependency-free style checks for the TypeScript editing sources.
import {readFileSync, readdirSync} from 'node:fs';
import {extname, join} from 'node:path';

/** Only check hand-edited text sources; generated assets/js are verified by CI. */
function filesIn(dir, extensions) {
  return readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return filesIn(full, extensions);
    return entry.isFile() && extensions.includes(extname(entry.name)) ? [full] : [];
  });
}

const paths = [
  ...filesIn('src', ['.ts']),
  ...filesIn('assets/education', ['.html', '.js']),
  ...filesIn('assets/css', ['.css']),
  ...filesIn('scripts', ['.mjs']),
  ...filesIn('tests', ['.cjs']),
  ...filesIn('docs', ['.md']),
  ...filesIn('.github/workflows', ['.yml', '.yaml']),
  'index.html', 'README.md', 'package.json', 'tsconfig.json'
].sort();
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
