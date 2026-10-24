import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { validateTarget } from '../src/review/contract';

const { values } = parseArgs({ options: { 'blog-root': { type: 'string' }, url: { type: 'string' }, ref: { type: 'string', default: 'HEAD' } } });
if (!values['blog-root'] || !values.url) throw new Error('사용법: pnpm review:check --blog-root ../imjae.github.io --url https://imjae.github.io/writing/<slug>/');
const root = resolve(values['blog-root']);
const raw = execFileSync(process.execPath, [resolve(root, 'scripts/sketch-source.mjs'), '--url', values.url, '--ref', values.ref!], {
  cwd: root, encoding: 'utf8', windowsHide: true,
});
const target = JSON.parse(raw);
validateTarget(target);
process.stdout.write(`${JSON.stringify({ connected: true, target }, null, 2)}\n`);
