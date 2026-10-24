import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
// Use the configured absolute PowerShell path even outside Codex's terminal PATH.
const config=JSON.parse(await readFile(join(homedir(),'.sketch-browser-runner/config.json'),'utf8'));
const args=['-NoProfile','-NonInteractive','-File',fileURLToPath(new URL('./start.ps1',import.meta.url))];
if(process.argv.includes('--stop'))args.push('-Stop');
const result=spawnSync(config.powershell||'pwsh.exe',args,{stdio:'inherit',windowsHide:true});
if(result.error)throw result.error;
process.exitCode=result.status??1;
