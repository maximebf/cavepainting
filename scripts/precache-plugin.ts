// After the build: write dist/precache.json (every file with hash and size) and dist/sw.js.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';

const SKIP = new Set(['precache.json', 'sw.js', '_headers']);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

export function precachePlugin(): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'precache',
    apply: 'build',
    configResolved(c) {
      config = c;
    },
    closeBundle() {
      const out = config.build.outDir;
      const files = walk(out)
        .map((p) => relative(out, p).split(sep).join('/'))
        .filter((u) => !SKIP.has(u) && !u.endsWith('.map'))
        .sort()
        .map((url) => {
          const buf = readFileSync(join(out, url));
          return { url, hash: createHash('sha256').update(buf).digest('hex').slice(0, 16), size: buf.length };
        });
      const version = createHash('sha256').update(JSON.stringify(files)).digest('hex').slice(0, 12);
      writeFileSync(join(out, 'precache.json'), JSON.stringify({ version, files }, null, 1));
      const sw = readFileSync(join(config.root, 'src/sw-template.js'), 'utf8').replace('__VERSION__', version);
      writeFileSync(join(out, 'sw.js'), sw);
    },
  };
}
