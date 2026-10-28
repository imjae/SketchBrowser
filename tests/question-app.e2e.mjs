import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

await mkdir('test-results/question',{recursive:true});
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL||'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1280,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
async function outline() {
  const b=await page.locator('iframe').boundingBox();
  const x=Math.min(b.width-50,400),y=Math.min(b.height-60,280);
  await page.mouse.move(b.x+60,b.y+60);await page.mouse.down();
  for(const p of [[x,60],[x,y],[60,y],[60,60]])await page.mouse.move(b.x+p[0],b.y+p[1],{steps:12});
  await page.mouse.up();await expect(page.getByRole('button',{name:'질문하기',exact:true})).toBeVisible();
}
try {
  await page.goto(process.env.SKETCH_TEST_URL||'http://localhost:8081',{waitUntil:'networkidle',timeout:120000});
  await expect(page.getByText('필기할 준비 완료',{exact:true})).toBeVisible({timeout:60000});
  const normalPage=await page.locator('iframe').boundingBox();
  const enter=await page.getByRole('button',{name:'브라우저 전체화면'}).boundingBox();
  assert.ok(enter.y>=normalPage.y+normalPage.height-1,'maximize control cannot cover page View/Edit links');
  await page.getByRole('button',{name:'질문 영역',exact:true}).click();
  await outline();
  await expect(page.getByText('0개의 획',{exact:true}).last()).toBeVisible();
  await page.screenshot({path:'test-results/question/app-region-landscape.png'});
  assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('@sketch-browser/page/')).length),0);
  await page.getByRole('button',{name:'질문 영역 취소'}).click();await expect(page.getByRole('button',{name:'질문하기',exact:true})).toHaveCount(0);
  await outline();await page.getByRole('button',{name:'질문하기',exact:true}).click();
  await expect(page.getByText('영역 이미지로 질문하기는 Android 앱에서 사용할 수 있어요.',{exact:true})).toBeVisible();
  const card=page.getByTestId('question-card');
  const originalCard=await card.boundingBox();
  assert.ok(originalCard.height<=normalPage.height*.4 && originalCard.width<=440,'default answer leaves most of the document visible');
  assert.deepEqual(await page.locator('iframe').boundingBox(),normalPage,'opening an answer must not reflow the document or ink');
  await page.frameLocator('iframe').locator('body').evaluate(body=>{
    body.dataset.session='same-question-document';
    const nav=document.createElement('div');nav.id='fixture-modes';nav.style='position:fixed;top:12px;right:12px;z-index:20';
    for(const label of ['View','Edit']){const b=document.createElement('button');b.textContent=label;b.style='width:65px;height:44px';b.onclick=()=>body.dataset.clicked=label;nav.append(b);}
    body.append(nav);
  });
  await page.frameLocator('iframe').getByRole('button',{name:'Edit',exact:true}).click();
  assert.equal(await page.frameLocator('iframe').locator('body').getAttribute('data-clicked'),'Edit','answer card must not block background controls');
  await page.screenshot({path:'test-results/question/app-panel-landscape.png'});

  // Folding preserves the mounted answer; dragging and expansion stay in bounds.
  await card.evaluate(el=>{window.answerNode=el;});
  const handle=await page.getByTestId('question-drag-handle').boundingBox();
  await page.mouse.move(handle.x+40,handle.y+20);await page.mouse.down();
  await expect(page.getByTestId('question-drag-shield')).toBeVisible();
  await page.mouse.move(handle.x-80,handle.y-100,{steps:10});await page.mouse.up();
  await expect(page.getByTestId('question-drag-shield')).toHaveCount(0);
  const moved=await card.boundingBox();assert.ok(moved.x<originalCard.x-80 && moved.y<originalCard.y-80,JSON.stringify({originalCard,moved,handle}));
  await page.getByRole('button',{name:'답변 접기'}).click();assert.ok((await card.boundingBox()).height<=58);
  await page.getByRole('button',{name:'답변 펼치기'}).click();
  assert.equal(await card.evaluate(el=>window.answerNode===el),true);
  await page.getByRole('button',{name:'답변 크게 보기'}).click();assert.ok((await card.boundingBox()).height>originalCard.height*1.5);
  await page.getByRole('button',{name:'답변 작게 보기'}).click();
  await page.mouse.move(normalPage.x+40,normalPage.y+180);await page.mouse.wheel(0,220);
  await expect.poll(()=>page.frameLocator('iframe').locator('body').evaluate(()=>scrollY)).toBeGreaterThan(100);
  await expect(card).toBeVisible();
  await page.setViewportSize({width:800,height:1100});await expect(page.getByRole('button',{name:'답변 닫기'})).toBeVisible();
  await page.waitForTimeout(150);
  await page.screenshot({path:'test-results/question/app-panel-portrait.png'});
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(150);
  await expect(page.getByRole('button',{name:'답변 닫기'})).toBeInViewport();
  const narrowCard=await card.boundingBox(),narrowPage=await page.locator('iframe').boundingBox();
  assert.ok(narrowCard.x>=narrowPage.x && narrowCard.x+narrowCard.width<=narrowPage.x+narrowPage.width+1);
  await page.screenshot({path:'test-results/question/app-panel-narrow.png'});
  await page.setViewportSize({width:800,height:1100});
  await page.getByRole('button',{name:'답변 닫기'}).click();await expect(page.getByRole('button',{name:'질문하기',exact:true})).toHaveCount(0);
  if(await page.getByRole('button',{name:'서재 닫기',exact:true}).isVisible())await page.getByRole('button',{name:'서재 닫기',exact:true}).click();
  await page.getByRole('button',{name:'질문 영역',exact:true}).click();
  await page.frameLocator('iframe').locator('body').evaluate(()=>scrollTo(0,0));
  await outline();await page.frameLocator('iframe').locator('body').evaluate(()=>scrollTo(0,100));
  await expect(page.getByRole('button',{name:'질문하기',exact:true})).toHaveCount(0);
  await expect(page.getByText('화면이 바뀌었어요. 질문 영역을 다시 지정해 주세요.',{exact:true})).toBeVisible();

  // Fullscreen retains a permanent bottom fold control and the same page.
  await page.getByRole('button',{name:'브라우저 전체화면'}).click();
  await page.getByRole('button',{name:'펜 도구 펼치기'}).click();
  const fullPage=await page.locator('iframe').boundingBox();
  const exit=await page.getByRole('button',{name:'전체화면 종료'}).boundingBox();
  assert.ok(exit.y>=fullPage.y+fullPage.height-1);
  await expect(page.getByRole('button',{name:'질문 영역',exact:true})).toBeInViewport();
  await page.screenshot({path:'test-results/question/fullscreen-tools.png'});
  await page.getByRole('button',{name:'탐색',exact:true}).click();
  await page.frameLocator('iframe').getByRole('button',{name:'View',exact:true}).click();
  await expect(page.frameLocator('iframe').locator('body')).toHaveAttribute('data-clicked','View');
  await page.getByRole('button',{name:'펜 도구 펼치기'}).click();
  await page.getByRole('button',{name:'질문 영역',exact:true}).click();
  await expect(page.getByTestId('fullscreen-tools')).toHaveCount(0);
  const beforeFold=await page.locator('iframe').boundingBox();
  await outline();
  await page.getByRole('button',{name:'펜 도구 펼치기'}).click();await page.getByRole('button',{name:'펜 도구 접기'}).click();
  assert.deepEqual(await page.locator('iframe').boundingBox(),beforeFold,'folding tools must not invalidate a chosen region');
  await expect(page.getByRole('button',{name:'질문하기',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'질문하기',exact:true}).click();await expect(card).toBeVisible();
  await page.screenshot({path:'test-results/question/fullscreen-question.png'});
  await page.keyboard.press('Escape');await expect(card).toHaveCount(0);await expect(page.getByRole('button',{name:'전체화면 종료'})).toBeVisible();
  await page.getByRole('button',{name:'전체화면 종료'}).click();
  assert.equal(await page.frameLocator('iframe').locator('body').getAttribute('data-session'),'same-question-document');

  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'브라우저 전체화면'}).click();await page.getByRole('button',{name:'펜 도구 펼치기'}).click();
  await expect(page.getByRole('button',{name:'질문 영역',exact:true})).toBeInViewport();
  await expect(page.getByRole('button',{name:'전체화면 종료'})).toBeInViewport();
  await page.screenshot({path:'test-results/question/fullscreen-tools-narrow.png'});
  await page.getByRole('button',{name:'질문 영역',exact:true}).click();await outline();
  await page.getByRole('button',{name:'질문하기',exact:true}).click();await expect(card).toBeVisible();
  await page.screenshot({path:'test-results/question/fullscreen-question-narrow.png'});
  await page.getByRole('button',{name:'답변 닫기'}).click();await page.getByRole('button',{name:'전체화면 종료'}).click();
  await page.reload({waitUntil:'networkidle'});await expect(page.getByText('0개의 획',{exact:true}).last()).toBeVisible();
  assert.equal(await page.getByRole('button',{name:'답변 닫기'}).count(),0);
  assert.deepEqual(errors,[]);
  console.log('Question selection, movable nonmodal answer, collapse/expand, background interaction, fullscreen fold tools, clear View/Edit controls, rotation and no saved outline passed in the app web preview.');
}finally{await browser.close();}
