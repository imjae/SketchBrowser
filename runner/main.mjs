import { readFile, writeFile, mkdir, access, symlink, realpath } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';
import { run, git, hash, normalizedHash, inside, applyReplacements, askCodex } from './core.mjs';
import { verifyAndPreview } from './preview.mjs';

const appRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const repoUrl='https://github.com/imjae/imjae.github.io.git';
const npmCli=join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

export async function loadConfig(path) {
  const config=JSON.parse(await readFile(path,'utf8'));
  if(config.server!=='https://imjae-blog-author.imjae-game-dev-notes.workers.dev')throw new Error('수정 요청 서버 주소를 확인해 주세요.');
  if(!config.root || !config.blogRoot || !config.model || !config.codex)throw new Error('실행기 설정이 필요합니다.');
  await mkdir(config.root,{recursive:true});
  // Windows Store redirects AppData. Vite's compiler and manifest must use
  // the same physical root or CSS can silently disappear from the build.
  config.root=await realpath(config.root);config.blogRoot=await realpath(config.blogRoot);
  // DPAPI CurrentUser ciphertext stays outside source control; plaintext only in memory.
  const encrypted=await readFile(config.credential,'utf8');
  config.token=await run(config.powershell||'pwsh.exe',['-NoProfile','-NonInteractive','-Command',"$v=[Console]::In.ReadToEnd(); $s=ConvertTo-SecureString $v; $p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); try { [Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($p)) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p) }"],{input:encrypted});
  return config;
}
export function service(config) {
  return async(path,body)=>{
    const response=await fetch(config.server+'/api/sketch/runner/'+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+config.token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(90000)});
    const value=await response.json().catch(()=>({error:'서버 응답 형식 오류'}));
    if(!response.ok)throw new Error(value.error||`서버 오류 ${response.status}`);return value;
  };
}

async function prepareRepository(config) {
  await mkdir(config.root,{recursive:true});config.root=await realpath(config.root);
  const repository=join(config.root,'repository');
  try{await access(join(repository,'.git'));}catch{await run('git',['clone','--no-checkout',repoUrl,repository],{timeout:10*60*1000});}
  if(await git(repository,'remote','get-url','origin')!==repoUrl)throw new Error('실행기 저장소의 원격 주소가 다릅니다.');
  if(process.platform==='win32')await git(repository,'config','core.longpaths','true');
  await git(repository,'fetch','origin','main');return repository;
}

export async function prepare(config,job,api) {
  const repository=await prepareRepository(config),baseCommit=await git(repository,'rev-parse','origin/main');
  const resolver=await import(pathToFileURL(join(config.blogRoot,'scripts/sketch-source.mjs')).href);
  const target=resolver.resolveSketchSource(job.url,{root:repository,ref:baseCommit});
  if(target.sourceSha256!==job.sourceHash)return api(`jobs/${job.id}/result`,{lease:job.lease.token,kind:'needs-recapture',message:'필기한 뒤 글이 변경됐습니다. 글을 새로고침하고 현재 원문에 다시 필기해 보내 주세요.'});
  const input=await api(`jobs/${job.id}/input`);
  const attempt=`${job.id.slice(0,8)}-${job.generation}-${randomUUID().slice(0,8)}`,work=inside(config.root,join(config.root,'work',attempt)),dataDir=inside(config.root,join(config.root,'data',attempt));
  await mkdir(dirname(work),{recursive:true});await mkdir(dataDir,{recursive:true});
  await git(repository,'worktree','add','--detach',work,baseCommit);
  const source=(await readFile(join(work,target.sourcePath),'utf8')).replaceAll('\r\n','\n');
  const rules=(await Promise.all(['AGENTS.md','docs/EDITORIAL.md','docs/WRITING.md'].map(p=>readFile(join(work,p),'utf8')))).join('\n\n');
  const result=await askCodex({config,dataDir,input,source,rules,instruction:job.instruction});
  const applied=applyReplacements(source,result);
  if(applied.questions.length)return api(`jobs/${job.id}/result`,{lease:job.lease.token,kind:'needs-clarification',message:applied.questions.join('\n')});
  await writeFile(join(work,target.sourcePath),applied.source);
  const afterHash=normalizedHash(applied.source);
  const lock=await readFile(join(work,'package-lock.json'));
  if(hash(lock)===hash(await readFile(join(config.blogRoot,'package-lock.json'))))await symlink(join(config.blogRoot,'node_modules'),join(work,'node_modules'),'junction');
  else await run(process.execPath,[npmCli,'ci'],{cwd:work,log:join(dataDir,'install.log')});
  await api(`jobs/${job.id}/heartbeat`,{lease:job.lease.token,message:'블로그 전체 검사와 미리보기를 만들고 있습니다.'});
  await run(process.execPath,[npmCli,'run','verify'],{cwd:work,log:join(dataDir,'verify.log')});
  await run(process.execPath,[npmCli,'run','author:build'],{cwd:work,log:join(dataDir,'authoring.log')});
  const preview=await verifyAndPreview({root:work,slug:target.slug,afterHash,dataDir});
  const files=await git(work,'diff','--name-only');if(files!==target.sourcePath)throw new Error('허용한 글 외의 파일이 변경됐습니다.');
  const diff=await git(work,'diff','--no-ext-diff','--',target.sourcePath);
  await git(work,'add','--',target.sourcePath);
  await git(work,'-c','commit.gpgsign=false','commit','-m',`Apply reviewed annotation ${job.id}`);
  const headCommit=await git(work,'rev-parse','HEAD');if(await git(work,'status','--porcelain'))throw new Error('검사 후 미저장 변경이 남았습니다.');
  const checks={verify:true,authoring:true,browser:true};
  const review={generation:job.generation,baseCommit,headCommit,sourceHash:target.sourceSha256,afterHash,sourcePath:target.sourcePath,summary:applied.summary,diff,checks};
  const record={jobId:job.id,...review,work,dataDir,previewSha256:hash(preview),diffSha256:hash(diff),checksSha256:hash(JSON.stringify(checks))};
  await mkdir(join(config.root,'records'),{recursive:true});
  await writeFile(join(config.root,'records',`${headCommit}.json`),JSON.stringify(record,null,2));
  await writeFile(join(dataDir,'preview.html'),preview);
  return api(`jobs/${job.id}/result`,{lease:job.lease.token,kind:'ready',review,preview});
}

async function githubToken(repository) {
  const data=await run('git',['credential','fill'],{cwd:repository,input:'protocol=https\nhost=github.com\npath=imjae/imjae.github.io.git\n\n',env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never'}});
  const token=/^password=(.+)$/m.exec(data)?.[1];if(!token)throw new Error('GitHub 로그인 연결이 필요합니다.');return token;
}
async function githubGet(path,token){const response=await fetch('https://api.github.com/repos/imjae/imjae.github.io/'+path,{headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','User-Agent':'SketchBrowser-runner'},signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error('GitHub 배포 상태를 확인하지 못했습니다.');return response.json();}

export async function deploy(config,job,api) {
  if(!job.review || !job.approval || job.approval.reviewId!==job.review.id || job.approval.digest!==job.review.digest)throw new Error('승인 영수증이 일치하지 않습니다.');
  const review=await api(`jobs/${job.id}/review`);
  const {digest:reviewDigest,...reviewBody}=review;
  if(hash(JSON.stringify(reviewBody))!==reviewDigest || reviewDigest!==job.approval.digest)throw new Error('검토 결과 해시가 다릅니다.');
  const record=JSON.parse(await readFile(inside(config.root,join(config.root,'records',`${job.review.headCommit}.json`)),'utf8'));
  const work=inside(config.root,record.work),dataDir=inside(config.root,record.dataDir);
  if(record.jobId!==job.id || record.headCommit!==review.headCommit || record.baseCommit!==review.baseCommit || record.afterHash!==review.afterHash || record.previewSha256!==review.previewSha256 || record.diffSha256!==review.diffSha256)throw new Error('승인 이후 결과가 변경됐습니다.');
  if(hash(await readFile(join(dataDir,'preview.html')))!==review.previewSha256)throw new Error('승인한 미리보기가 변경됐습니다.');
  if(await git(work,'rev-parse','HEAD')!==review.headCommit || await git(work,'status','--porcelain'))throw new Error('승인한 작업 공간이 변경됐습니다.');
  if(normalizedHash(await readFile(join(work,record.sourcePath),'utf8'))!==review.afterHash)throw new Error('승인한 글이 변경됐습니다.');
  if(await git(work,'diff','--name-only',review.baseCommit,review.headCommit)!==record.sourcePath)throw new Error('허용하지 않은 파일 변경입니다.');
  if(hash(await git(work,'diff','--no-ext-diff',review.baseCommit,review.headCommit,'--',record.sourcePath))!==review.diffSha256)throw new Error('승인한 diff가 변경됐습니다.');
  await git(work,'merge-base','--is-ancestor',review.baseCommit,review.headCommit);
  const repository=await prepareRepository(config),current=await git(repository,'rev-parse','origin/main');
  if(current!==review.headCommit){
    if(current!==review.baseCommit)throw new Error('main이 변경됐습니다. 새 수정 요청에서 다시 검토해야 합니다.');
    if(job.approval.expiresAt<=Date.now())throw new Error('배포 승인이 만료됐습니다. 다시 승인해 주세요.');
    await api(`jobs/${job.id}/heartbeat`,{lease:job.lease.token,message:'승인한 커밋을 main에 반영합니다.'});
    await git(work,'push','origin',`${review.headCommit}:refs/heads/main`);
  }
  const token=await githubToken(repository),deadline=Date.now()+35*60*1000;let evidence;
  while(Date.now()<deadline){
    const data=await githubGet(`actions/runs?branch=main&event=push&head_sha=${review.headCommit}&per_page=100`,token);
    const runs=data.workflow_runs.filter(r=>r.head_sha===review.headCommit);
    const pages=runs.find(r=>r.path==='.github/workflows/deploy.yml'),authoring=runs.find(r=>r.path==='.github/workflows/authoring.yml');
    for(const r of [pages,authoring])if(r?.status==='completed' && r.conclusion!=='success')throw new Error(`배포 검사에 실패했습니다. 승인 커밋 ${review.headCommit.slice(0,12)}의 Actions를 확인해 주세요.`);
    if(pages?.conclusion==='success' && authoring?.conclusion==='success'){evidence={pages:pages.html_url,authoring:authoring.html_url};break;}
    await sleep(15000);
  }
  if(!evidence)throw new Error('배포 완료를 기다리는 시간이 초과됐습니다. Actions 상태를 확인해 주세요.');
  let live=false;
  for(let attempt=0;attempt<12;attempt++){
    const published=await fetch(job.url+'?sketch_version='+review.headCommit,{cache:'no-store',signal:AbortSignal.timeout(30000)});
    const publicHash=/data-sketch-source="([a-f0-9]{64})"/.exec(await published.text())?.[1];
    const author=await api('published/'+new URL(job.url).pathname.split('/')[2]);
    if(published.ok && publicHash===review.afterHash && author.sourceHash===review.afterHash){live=true;break;}await sleep(10000);
  }
  if(!live)throw new Error('Actions는 성공했지만 실제 글 버전이 아직 일치하지 않습니다.');
  return api(`jobs/${job.id}/result`,{lease:job.lease.token,kind:'deployed',headCommit:review.headCommit,pages:true,authoring:true,live:true,deployment:evidence});
}

export async function tick(config) {
  const api=service(config),{job}=await api('claim',{});if(!job)return false;
  console.log(`${new Date().toISOString()} ${job.id} ${job.lease.kind}`);
  let heartbeatError;
  const heartbeat=setInterval(()=>{api(`jobs/${job.id}/heartbeat`,{lease:job.lease.token}).catch(e=>{heartbeatError=e;});},45000);
  try {if(job.lease.kind==='deploy')await deploy(config,job,api);else await prepare(config,job,api);}
  catch(e){console.error(`${job.id}: ${e.message}`);await writeFile(join(config.root,`error-${job.id}.log`),e.diagnostic||e.stack||e.message).catch(()=>{});await api(`jobs/${job.id}/result`,{lease:job.lease.token,kind:job.lease.kind==='deploy'?'deployment-failed':'failed',message:e.message}).catch(()=>{});}
  finally{clearInterval(heartbeat);if(heartbeatError)console.error('작업 연결이 끊긴 구간이 있습니다. 서버 상태를 확인합니다.');}
  return true;
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const {values}=parseArgs({options:{config:{type:'string'},once:{type:'boolean',default:false}}});
  const config=await loadConfig(values.config||join(process.env.LOCALAPPDATA,'SketchBrowserRunner','config.json'));
  await mkdir(config.root,{recursive:true});
  do {try{await tick(config);}catch(e){console.error(`${new Date().toISOString()} ${e.message}`);}if(!values.once)await sleep(15000);}while(!values.once);
}
