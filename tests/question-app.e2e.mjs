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
  await page.getByRole('button',{name:'질문 영역',exact:true}).click();
  await outline();
  await expect(page.getByText('0개의 획',{exact:true}).last()).toBeVisible();
  await page.screenshot({path:'test-results/question/app-region-landscape.png'});
  assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('@sketch-browser/page/')).length),0);
  await page.getByRole('button',{name:'질문 영역 취소'}).click();await expect(page.getByRole('button',{name:'질문하기',exact:true})).toHaveCount(0);
  await outline();await page.getByRole('button',{name:'질문하기',exact:true}).click();
  await expect(page.getByText('영역 이미지로 질문하기는 Android 앱에서 사용할 수 있어요.',{exact:true})).toBeVisible();
  await page.waitForTimeout(350); // Wait for the modal fade before visual evidence.
  await page.screenshot({path:'test-results/question/app-panel-landscape.png'});
  await page.setViewportSize({width:800,height:1100});await expect(page.getByRole('button',{name:'답변 닫기'})).toBeVisible();
  await page.waitForTimeout(150);
  await page.screenshot({path:'test-results/question/app-panel-portrait.png'});
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(150);
  await expect(page.getByRole('button',{name:'답변 닫기'})).toBeInViewport();
  await page.screenshot({path:'test-results/question/app-panel-narrow.png'});
  await page.setViewportSize({width:800,height:1100});
  await page.getByRole('button',{name:'답변 닫기'}).click();await expect(page.getByRole('button',{name:'질문하기',exact:true})).toHaveCount(0);
  if(await page.getByRole('button',{name:'서재 닫기',exact:true}).isVisible())await page.getByRole('button',{name:'서재 닫기',exact:true}).click();
  await outline();await page.frameLocator('iframe').locator('body').evaluate(()=>scrollTo(0,100));
  await expect(page.getByRole('button',{name:'질문하기',exact:true})).toHaveCount(0);
  await expect(page.getByText('화면이 바뀌었어요. 질문 영역을 다시 지정해 주세요.',{exact:true})).toBeVisible();
  await page.reload({waitUntil:'networkidle'});await expect(page.getByText('0개의 획',{exact:true}).last()).toBeVisible();
  assert.equal(await page.getByRole('button',{name:'답변 닫기'}).count(),0);
  assert.deepEqual(errors,[]);
  console.log('Question tool, anchored action buttons, one-use panel, portrait layout and no saved outline passed in the app web preview.');
}finally{await browser.close();}
