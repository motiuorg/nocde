// Rewrite absolute /assets/ asset URLs in dist/ to relative ones, so the static
// build can be opened from any sub-path or as a file bundle (used for previews).
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname, sep } from 'node:path';

const dist = join(process.cwd(), 'dist');
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
for (const file of walk(dist)) {
  if (file.endsWith('.html')) {
    const depth = relative(dist, dirname(file)).split(sep).filter(Boolean).length;
    const prefix = depth ? '../'.repeat(depth) : './';
    const s = readFileSync(file, 'utf8').replaceAll('"/assets/', `"${prefix}assets/`);
    writeFileSync(file, s);
  } else if (file.endsWith('.css') || file.endsWith('.js')) {
    const s = readFileSync(file, 'utf8').replaceAll('url(/assets/', 'url(./').replaceAll('"/assets/', '"./');
    writeFileSync(file, s);
  }
}
console.log('relativized', dist);
