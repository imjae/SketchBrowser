import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(packageJson.version)) throw new Error('Invalid APK version');
const source = path.join(root, 'android/app/build/outputs/apk/release/app-release.apk');
const bytes = await readFile(source);
if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes.length < 1_000_000) throw new Error('Missing or invalid APK');
const output = path.join(root, 'dist/apk');
await mkdir(output, { recursive: true });
const filename = `SketchBrowser-${packageJson.version}-test.apk`;
await copyFile(source, path.join(output, filename));
const sha256 = createHash('sha256').update(bytes).digest('hex');
await writeFile(path.join(output, `${filename}.sha256`), `${sha256}  ${filename}\n`);
const info = {
  app: 'SketchBrowser',
  package: 'com.sketchbrowser.app',
  version: packageJson.version,
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  builtAt: new Date().toISOString(),
  architectures: ['arm64-v8a', 'armeabi-v7a'],
  standalone: true,
  signing: 'Expo template test key',
  bytes: bytes.length,
  sha256,
};
await writeFile(path.join(output, 'build-info.json'), JSON.stringify(info, null, 2) + '\n');
console.log(`Packaged ${filename} (${(bytes.length / 1024 / 1024).toFixed(1)} MiB), SHA-256 ${sha256}`);
