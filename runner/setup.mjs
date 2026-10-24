import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { parseArgs } from 'node:util';
import { run } from './core.mjs';

const {values}=parseArgs({options:{blog:{type:'string'},root:{type:'string'},model:{type:'string',default:'gpt-6-astra'}}});
const app=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const root=resolve(values.root||join(homedir(),'.sketch-browser-runner'));
const blogRoot=resolve(values.blog||join(app,'../imjae.github.io'));
const configPath=join(root,'config.json'),credential=join(root,'credential.enc');
await access(join(blogRoot,'wrangler.authoring.jsonc'));await mkdir(root,{recursive:true});
let exists=false;try{await access(configPath);exists=true;}catch{}
if(exists){console.log('기존 실행기 설정을 유지합니다: '+configPath);process.exit(0);}
const token=randomBytes(32).toString('hex');
const powershell=(await run('where.exe',['pwsh.exe'])).split(/\r?\n/)[0];
const encrypted=await run(powershell,['-NoProfile','-NonInteractive','-Command',"$value=[Console]::In.ReadToEnd(); $secret=ConvertTo-SecureString $value -AsPlainText -Force; [Console]::Out.Write((ConvertFrom-SecureString $secret))"],{input:token});
await writeFile(credential,encrypted);
const wrangler=join(blogRoot,'node_modules/wrangler/bin/wrangler.js');
await run(process.execPath,[wrangler,'secret','put','SKETCH_RUNNER_TOKEN','--config','wrangler.authoring.jsonc'],{cwd:blogRoot,input:token+'\n',timeout:120000,log:join(root,'provision.log')});
const config={server:'https://imjae-blog-author.imjae-game-dev-notes.workers.dev',root,blogRoot,credential,powershell,codex:join(app,'node_modules/@openai/codex/bin/codex.js'),model:values.model,reasoningEffort:'xhigh'};
await writeFile(configPath,JSON.stringify(config,null,2));
console.log('실행기와 서버 연결을 설정했습니다: '+configPath);
