import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { INK_SCRIPT, commandScript } from '../src/ink/engine.ts';
import { parseCapture } from '../src/review/transfer.ts';
import { fixture, submission } from '../../imjae.github.io/tests/fixtures/sketch.mjs';
import { handleSketchRequest } from '../../imjae.github.io/server/sketch-review.mjs';
import { pathToFileURL } from 'node:url';

const bundledPage=process.env.SKETCH_REVIEW_BUNDLE?(await import(pathToFileURL(process.env.SKETCH_REVIEW_BUNDLE).href)).testReviewPage:null;
const origin='https://imjae-blog-author.imjae-game-dev-notes.workers.dev';
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1280,height:800},hasTouch:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await mkdir('test-results/portfolio-review',{recursive:true});
const f=fixture();
try {
  await page.route(origin+'/**',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.pathname==='/portfolio/krafton-2027/'){
      await route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><style>body{font:22px/2 system-ui;padding:80px;background:#fbfaf6}.rp-main{max-width:800px}</style><main class="rp-main" data-sketch-source="'+'a'.repeat(64)+'"><h1 data-portfolio-copy="profile.headline">게임 기능과 도구를 구현합니다.</h1><p data-portfolio-copy="profile.intro">수정할 소개 문장입니다.</p></main>'});return;
    }
    const headers=request.headers();if(request.method()==='POST')headers.origin=origin;
    const response=bundledPage&&url.pathname==='/sketch/'?bundledPage():await handleSketchRequest(new Request(request.url(),{method:request.method(),headers,body:request.postData()||undefined}),f.env,{ownerId:'37284282'});
    await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
  });
  await page.goto(origin+'/portfolio/krafton-2027/?edit=1');
  await page.evaluate(()=>{window.messages=[];window.ReactNativeWebView={postMessage:raw=>window.messages.push(JSON.parse(raw))};});
  await page.evaluate(INK_SCRIPT);
  await page.evaluate(commandScript({type:'restore',strokes:[{id:'pen-1',tool:'pen',color:'#315de8',width:3,anchor:null,points:[{x:110,y:225,pressure:.5},{x:420,y:225,pressure:.5}]}],sourceHash:'a'.repeat(64)}));
  await page.evaluate(()=>{document.body.dataset.sketchDirty='true';});
  await page.evaluate(commandScript({type:'capture',nonce:'dirty'}));
  assert.match(await page.evaluate(()=>window.messages.at(-1).error),/미저장/);
  await page.evaluate(()=>{document.body.dataset.sketchDirty='false';});
  await page.evaluate(commandScript({type:'capture',nonce:'portfolio'}));
  const raw=await page.evaluate(()=>JSON.stringify(window.messages.find(m=>m.channel==='sketch-review'&&m.nonce==='portfolio')));
  const context=parseCapture(raw,'portfolio',page.url());assert.ok(context);assert.match(context.visibleText,/수정할 소개/);assert.equal(context.strokes.length,1);
  await page.screenshot({path:'test-results/portfolio-review/capture.png'});
  await page.evaluate(commandScript({type:'captureRelease',nonce:'portfolio'}));
  const input={...submission(),context,instruction:'소개 문장을 간결하게 정리해 주세요.'};
  const create=await f.call('/api/sketch/jobs',{body:input});assert.equal(create.status,201);
  const job=await create.json();assert.equal(job.url,'https://imjae.github.io/portfolio/krafton-2027/');
  const claim=await f.claim();
  const ready=await f.call('/api/sketch/runner/jobs/'+job.id+'/result',{runner:true,body:{lease:claim.lease.token,kind:'ready',preview:'<!doctype html><meta charset="utf-8"><h1>수정한 포트폴리오</h1><p>소개 문장을 정리했습니다.</p><script>parent.hacked=true</script>',review:{generation:1,targetKind:'portfolio',sourcePath:`content/portfolio-copy/sketch-${job.id}-1.json`,baseCommit:'b'.repeat(40),headCommit:'c'.repeat(40),sourceHash:'a'.repeat(64),afterHash:'d'.repeat(64),summary:'소개 문장을 정리했습니다.',diff:'+++ 기록.json\n+"profile.intro": "소개 문장을 정리했습니다."',displayChanges:[{label:'상단 소개',before:['수정할 소개 문장입니다.'],after:['소개 문장을 정리했습니다.']}],checks:{verify:true,authoring:true,browser:true}}}});assert.equal(ready.status,200);
  await page.goto(origin+'/sketch/');
  await page.getByRole('button',{name:/검토 대기 ·/}).click();
  await expect(page.locator('.change-side.before')).toContainText('수정할 소개 문장입니다.');
  await expect(page.locator('.change-side.after')).toContainText('소개 문장을 정리했습니다.');
  assert.doesNotMatch(await page.locator('#panel-compare').innerText(),/기록.json/);
  await page.screenshot({path:'test-results/portfolio-review/compare.png'});
  const approve=page.getByRole('button',{name:'이 수정안 승인·배포'});await expect(approve).toBeDisabled();
  await page.getByRole('tab',{name:'글 미리보기'}).click();
  await expect(page.frameLocator('iframe').getByRole('heading',{name:'수정한 포트폴리오'})).toBeVisible();
  assert.equal(await page.evaluate(()=>window.hacked),undefined);
  await page.setViewportSize({width:800,height:1280});
  await page.screenshot({path:'test-results/portfolio-review/preview-portrait.png'});
  await page.getByRole('checkbox').check();
  const originalFetch=globalThis.fetch;
  try{globalThis.fetch=async()=>Response.json({object:{sha:'b'.repeat(40)}});await approve.click();await expect(page.locator('#detail .status')).toHaveText('승인·배포 대기');}
  finally{globalThis.fetch=originalFetch;}
  assert.equal((await f.claim()).lease.kind,'deploy');
  assert.deepEqual(errors,[]);
  console.log('Portfolio capture, dirty-edit rejection, normalized target, text comparison, sandbox preview and explicit approval passed using memory jobs. No live copy changed.');
} finally {await browser.close();}
