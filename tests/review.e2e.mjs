import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { INK_SCRIPT, commandScript } from '../src/ink/engine.ts';
import { fixture, submission } from '../../imjae.github.io/tests/fixtures/sketch.mjs';
import { handleSketchRequest } from '../../imjae.github.io/server/sketch-review.mjs';

await mkdir('test-results/review',{recursive:true});
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1000,height:800}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
  await page.route('https://imjae.github.io/**',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html><body><article class="prose" data-sketch-source="'+ 'a'.repeat(64)+'"><h1>예시 글</h1><p>첫 문장입니다.</p><p style="margin-top:1400px">아래 문장입니다.</p></article></body></html>'}));
  await page.goto('https://imjae.github.io/writing/sample/');
  await page.evaluate(()=>{window.messages=[];window.ReactNativeWebView={postMessage:raw=>window.messages.push(JSON.parse(raw))};});
  await page.evaluate(INK_SCRIPT);
  const stroke=y=>({id:'s'+y,tool:'pen',color:'#315de8',width:3,anchor:null,points:[{x:20,y,pressure:.5},{x:200,y,pressure:.5}]});
  await page.evaluate(commandScript({type:'restore',strokes:[stroke(70),stroke(1500)],sourceHash:null}));
  await page.evaluate(commandScript({type:'capture',nonce:'n1'}));
  const capture=await page.evaluate(()=>window.messages.find(m=>m.channel==='sketch-review'));
  assert.equal(capture.context.strokes.length,1);assert.equal(capture.context.sourceHash,null);assert.equal(capture.context.currentSourceHash,'a'.repeat(64));assert.match(capture.context.visibleText,/첫 문장/);assert.doesNotMatch(capture.context.visibleText,/아래 문장/);
  await page.evaluate(commandScript({type:'captureCheck',nonce:'n1'}));
  assert.equal(await page.evaluate(()=>window.messages.at(-1).ok),true);
  await page.evaluate(()=>scrollTo(0,200));
  await page.evaluate(commandScript({type:'captureCheck',nonce:'n1'}));
  assert.equal(await page.evaluate(()=>window.messages.at(-1).ok),false);
  await page.evaluate(commandScript({type:'captureRelease',nonce:'n1'}));
  await page.evaluate(()=>scrollTo(0,0));

  // The real owner UI and real storage/state code, using only in-memory test identity.
  const f=fixture();
  await page.route('https://author.test/**',async route=>{
    const r=route.request();const headers=r.headers();
    if(r.method()==='POST')headers.origin='https://author.test';
    const response=await handleSketchRequest(new Request(r.url(),{method:r.method(),headers,body:r.postData()||undefined}),f.env,{ownerId:'37284282'});
    await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
  });
  await page.addInitScript(()=>{window.nativeMessages=[];window.ReactNativeWebView={postMessage:raw=>{const m=JSON.parse(raw);window.nativeMessages.push(m);if(m.type==='sketch-save')setTimeout(()=>window.sketchPersisted(m.id),0);}};});
  await page.goto('https://author.test/sketch/');
  const input=submission();input.context.currentSourceHash=input.context.sourceHash;
  await page.evaluate(value=>window.receiveSketchCapture(value),input);
  await page.getByLabel('추가 설명 (선택)').fill('첫 문장을 줄여 주세요.');
  await page.getByRole('button',{name:'AI로 수정안 만들기',exact:true}).click();
  await expect(page.getByRole('button',{name:'PC 연결 대기 · 예시',exact:true})).toBeVisible();
  assert.equal((await f.storage.get('job:'+input.id)).instruction,'첫 문장을 줄여 주세요.');
  const messages=await page.evaluate(()=>window.nativeMessages);assert.ok(messages.some(m=>m.type==='sketch-save'));assert.ok(messages.some(m=>m.type==='sketch-submitted'));
  const claim=await f.claim();
  const ready=await f.call('/api/sketch/runner/jobs/'+input.id+'/result',{runner:true,body:{lease:claim.lease.token,kind:'ready',preview:'<!doctype html><h1>수정된 문장</h1><script>parent.hacked=true</script>',review:{generation:1,baseCommit:'b'.repeat(40),headCommit:'c'.repeat(40),sourceHash:'a'.repeat(64),afterHash:'d'.repeat(64),summary:'첫 문장을 줄였습니다.',diff:'-첫 문장입니다.\n+첫 문장.',checks:{verify:true,authoring:true,browser:true}}}});
  assert.equal(ready.status,200);
  await page.reload();await page.getByRole('button',{name:'검토 대기 · 예시',exact:true}).click();
  await expect(page.getByText('첫 문장을 줄였습니다.',{exact:true})).toBeVisible();
  const approve=page.getByRole('button',{name:'이 수정안 승인·배포',exact:true});await expect(approve).toBeDisabled();
  await expect(page.frameLocator('iframe').getByRole('heading',{name:'수정된 문장'})).toBeVisible();
  assert.equal(await page.evaluate(()=>window.hacked),undefined);
  await page.getByRole('checkbox').check();await expect(approve).toBeEnabled();
  await page.screenshot({path:'test-results/review/owner-review.png',fullPage:true});
  const originalFetch=globalThis.fetch;
  try {globalThis.fetch=async()=>Response.json({object:{sha:'b'.repeat(40)}});await approve.click();await expect(page.getByRole('button',{name:'승인·배포 대기 · 예시',exact:true})).toBeVisible();}
  finally{globalThis.fetch=originalFetch;}
  assert.equal((await f.claim()).lease.kind,'deploy');
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
  assert.deepEqual(errors,[]);
  console.log('Capture consistency, owner UI, durable outbox acknowledgement, sandbox preview and explicit approval passed. No live article was changed.');
} finally {await browser.close();}
