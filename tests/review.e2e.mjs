import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { INK_SCRIPT, commandScript } from '../src/ink/engine.ts';
import { fixture, submission } from '../../imjae.github.io/tests/fixtures/sketch.mjs';
import { handleSketchRequest } from '../../imjae.github.io/server/sketch-review.mjs';
import { pathToFileURL } from 'node:url';

const bundledPage = process.env.SKETCH_REVIEW_BUNDLE ? (await import(pathToFileURL(process.env.SKETCH_REVIEW_BUNDLE).href)).testReviewPage : null;

await mkdir('test-results/review',{recursive:true});
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1280,height:800},hasTouch:true});
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
    const response=bundledPage && new URL(r.url()).pathname==='/sketch/' ? bundledPage() : await handleSketchRequest(new Request(r.url(),{method:r.method(),headers,body:r.postData()||undefined}),f.env,{ownerId:'37284282'});
    await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
  });
  await page.addInitScript(()=>{window.nativeMessages=[];window.ReactNativeWebView={postMessage:raw=>{const m=JSON.parse(raw);window.nativeMessages.push(m);if(m.type==='sketch-save')setTimeout(()=>window.sketchPersisted(m.id),0);}};});
  await page.goto('https://author.test/sketch/');
  const input=submission();input.context.currentSourceHash=input.context.sourceHash;
  await page.evaluate(value=>window.receiveSketchCapture(value),input);
  await page.getByLabel('추가 설명 (선택)').fill('첫 문장을 줄여 주세요.');
  await page.getByRole('button',{name:'AI로 수정안 만들기',exact:true}).click();
  await expect(page.locator('#detail .status')).toHaveText('PC 연결 대기');
  assert.equal((await f.storage.get('job:'+input.id)).instruction,'첫 문장을 줄여 주세요.');
  const messages=await page.evaluate(()=>window.nativeMessages);assert.ok(messages.some(m=>m.type==='sketch-save'));assert.ok(messages.some(m=>m.type==='sketch-submitted'));
  const claim=await f.claim();
  const diff = ['diff --git a/post.md b/post.md','--- a/post.md','+++ b/post.md','@@ -1,3 +1,3 @@', ...Array.from({length:12},(_,i)=>'-기존 문장 '+i+'입니다. 문장을 비교하고 문맥을 확인합니다.'), ...Array.from({length:12},(_,i)=>'+다듬은 문장 '+i+'입니다. 수정 내용을 확인합니다.'), ' 문맥', '-마지막 문장입니다.', '+마지막 문장을 간결하게 정리했습니다.', ' 문맥', '+<img src=x onerror="parent.hacked=true">'].join('\n');
  const ready=await f.call('/api/sketch/runner/jobs/'+input.id+'/result',{runner:true,body:{lease:claim.lease.token,kind:'ready',preview:'<!doctype html><html lang="ko"><meta charset="utf-8"><style>body{font:18px/1.9 system-ui;background:#fbfaf6;color:#29352d;padding:36px;max-width:760px;margin:auto}h1{font-size:32px}</style><h1>수정된 문장</h1>'+Array.from({length:30},(_,i)=>'<p>다듬은 문장 '+i+'입니다. 실제 글의 흐름을 미리보기에서 확인합니다.</p>').join('')+'<script>parent.hacked=true</script></html>',review:{generation:1,baseCommit:'b'.repeat(40),headCommit:'c'.repeat(40),sourceHash:'a'.repeat(64),afterHash:'d'.repeat(64),summary:'문장을 간결하게 다듬고 마지막 설명을 정리했습니다.',diff,checks:{verify:true,authoring:true,browser:true}}}});
  assert.equal(ready.status,200);
  await page.reload();await page.getByRole('button',{name:'검토 대기 · 예시',exact:true}).click();
  await expect(page.getByRole('tab',{name:'변경 비교',exact:true})).toHaveAttribute('aria-selected','true');
  await expect(page.locator('.change-card')).toHaveCount(3);
  await expect(page.locator('.change-side.before').first()).toBeVisible();
  await expect(page.locator('.change-side.after').first()).toBeVisible();
  assert.equal(await page.locator('.change-card img').count(),0);
  const approve=page.getByRole('button',{name:'이 수정안 승인·배포',exact:true});await expect(approve).toBeDisabled();
  await page.screenshot({path:'test-results/review/compare-landscape.png'});
  await page.getByRole('button',{name:'다음 →',exact:true}).click();
  await expect(page.getByLabel('변경 위치',{exact:true})).toHaveValue('1');
  assert.ok((await approve.boundingBox()).y < 800);
  await page.getByRole('tab',{name:'글 미리보기',exact:true}).click();
  await expect(page.frameLocator('iframe').getByRole('heading',{name:'수정된 문장'})).toBeVisible();
  assert.equal(await page.evaluate(()=>window.hacked),undefined);
  await page.screenshot({path:'test-results/review/preview-landscape.png'});
  await page.getByRole('tab',{name:'보낸 필기',exact:true}).click();
  await expect(page.getByText('문장을 간결하게 다듬고 마지막 설명을 정리했습니다.',{exact:true})).toBeVisible();
  assert.equal(await page.locator('details').first().getAttribute('open'),null);
  await page.getByRole('tab',{name:'변경 비교',exact:true}).click();
  await page.clock.install();
  await page.getByRole('button',{name:'추가 수정 요청',exact:true}).click();
  await page.getByLabel('추가 수정 요청',{exact:true}).fill('두 번째 문장은 원래 표현을 유지해 주세요.');
  const saved = await f.storage.get('job:'+input.id);saved.updatedAt+=5000;await f.storage.put('job:'+input.id,saved);
  await page.clock.runFor(8100);
  await expect(page.getByLabel('추가 수정 요청',{exact:true})).toHaveValue('두 번째 문장은 원래 표현을 유지해 주세요.');
  await page.setViewportSize({width:800,height:420});
  await page.getByRole('button',{name:'검토로 돌아가기',exact:true}).click();
  for (const [width,height] of [[800,1280],[1024,600],[390,844]]) {
    await page.setViewportSize({width,height});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight+2),false);
    const bounds=await approve.boundingBox();assert.ok(bounds.y>=0 && bounds.y+bounds.height<=height);
    if(width<900){
      await expect(page.getByRole('button',{name:'수정 전',exact:true})).toBeVisible();
      await page.getByRole('button',{name:'수정 전',exact:true}).click();
      await expect(page.locator('.change-side.after').first()).toBeHidden();
      await page.getByRole('button',{name:'수정 후',exact:true}).click();
      await expect(page.locator('.change-side.before').first()).toBeHidden();
    }
    await page.screenshot({path:'test-results/review/compare-'+width+'.png'});
  }
  await page.setViewportSize({width:800,height:1280});
  await page.getByRole('button',{name:'추가 수정 요청',exact:true}).click();
  await expect(page.getByLabel('추가 수정 요청',{exact:true})).toHaveValue('두 번째 문장은 원래 표현을 유지해 주세요.');
  await page.getByRole('button',{name:'검토로 돌아가기',exact:true}).click();
  await page.getByRole('checkbox').check();await expect(approve).toBeEnabled();
  await page.screenshot({path:'test-results/review/owner-review.png',fullPage:true});
  const originalFetch=globalThis.fetch;
  try {globalThis.fetch=async()=>Response.json({object:{sha:'b'.repeat(40)}});await approve.click();await expect(page.locator('#detail .status')).toHaveText('승인·배포 대기');}
  finally{globalThis.fetch=originalFetch;}
  assert.equal((await f.claim()).lease.kind,'deploy');
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
  assert.deepEqual(errors,[]);
  console.log('Capture consistency, owner UI, durable outbox acknowledgement, sandbox preview and explicit approval passed. No live article was changed.');
} finally {await browser.close();}
