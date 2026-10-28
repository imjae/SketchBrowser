import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

const channel = process.env.PLAYWRIGHT_CHANNEL === 'chromium' ? undefined : process.env.PLAYWRIGHT_CHANNEL || 'chrome';
const browser = await chromium.launch({ channel, headless: true });
const context = await browser.newContext({ viewport: { width: 1000, height: 940 }, deviceScaleFactor: 1, hasTouch: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const frame = () => page.frameLocator('iframe');
const count = (n) => expect(page.getByText(`${n}개의 획`, { exact: true }).last()).toBeVisible();
const tool = (name) => page.getByRole('button', { name, exact: true });
const selected = (name) => expect(page.getByText(new RegExp(`^${name} 모드`))).toBeVisible();
const saved = () => expect(page.getByText('기기에 저장됨', { exact: true })).toBeVisible();
const snapshot = () => page.evaluate(() => localStorage.getItem('@sketch-browser/page/v1/' + encodeURIComponent('sketch://welcome')));
const scrollTo = (y) => frame().locator('body').evaluate((_, top) => window.scrollTo(0, top), y);
const scrollY = () => frame().locator('body').evaluate(() => window.scrollY);
const cdp = await context.newCDPSession(page);
await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

async function touch(type, points) {
  const bounds = await page.locator('iframe').boundingBox();
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([id, x, y]) => ({
    id, x: bounds.x + x, y: bounds.y + y, radiusX: 2, radiusY: 2, force: 0.8,
  })) });
}
async function draw() {
  const bounds = await page.locator('iframe').boundingBox();
  await page.mouse.move(bounds.x + 110, bounds.y + 280);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 210, bounds.y + 280, { steps: 12 });
  await page.mouse.up();
}
async function pan(y = 380, distance = 100) {
  await touch('touchStart', [[1, 140, y]]);
  await touch('touchMove', [[1, 150, y - 10]]);
  await touch('touchStart', [[1, 150, y - 10], [2, 260, y - 10]]);
  for (let dy = 20; dy <= distance; dy += 20) {
    await touch('touchMove', [[1, 150, y - 10 - dy], [2, 260, y - 10 - dy]]);
  }
  await touch('touchEnd', []);
}

try {
  await page.goto(process.env.SKETCH_TEST_URL || 'http://localhost:8081', { waitUntil: 'networkidle', timeout: 120000 });
  await expect(page.getByText('필기할 준비 완료', { exact: true })).toBeVisible({ timeout: 60000 });
  await expect(page.getByText('웹 위에 남기는 나만의 생각', { exact: true })).toHaveCount(0);
  await expect(page.getByText('WEB PREVIEW', { exact: true })).toHaveCount(0);
  const address = await page.getByRole('textbox', { name: '웹 주소 또는 검색어' }).boundingBox();
  const library = await tool('서재 열기 또는 닫기').boundingBox();
  assert.ok(address.y < 80 && Math.abs(address.y + address.height / 2 - library.y - library.height / 2) < 8);
  await tool('서재 열기 또는 닫기').click();
  await expect(page.getByText('나의 서재', { exact: true })).toBeVisible();
  await tool('서재 닫기').click();
  await tool('펜').click();
  await draw(); await count(1); await saved();
  const originalNotes = await snapshot();
  await frame().locator('body').evaluate((body) => { body.dataset.session = 'same-document'; });

  // Collapsing frees document space and preserves selection, document and ink.
  const expandedBounds = await page.locator('iframe').boundingBox();
  await tool('펜 도구 접기').click();
  await expect(tool('펜')).toHaveCount(0);
  const foldedBounds = await page.locator('iframe').boundingBox();
  assert.ok(foldedBounds.height >= expandedBounds.height + 60);
  assert.equal(await frame().locator('body').getAttribute('data-session'), 'same-document');
  assert.equal(await snapshot(), originalNotes);
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/tools-folded.png' });
  await tool('펜 도구 펼치기').click();
  await selected('펜');
  await expect(tool('실행 취소')).toBeEnabled();

  // Content-only mode keeps the existing iframe, notes and undo history alive.
  await scrollTo(300);
  await tool('브라우저 전체화면').click();
  await expect(tool('전체화면 종료')).toBeVisible();
  await expect(page.getByRole('textbox', { name: '웹 주소 또는 검색어' })).toHaveCount(0);
  await expect(tool('펜')).toHaveCount(0);
  await expect(tool('서재 열기 또는 닫기')).toHaveCount(0);
  await expect(page.getByText('기기에 저장됨', { exact: true })).toHaveCount(0);
  assert.equal(await frame().locator('body').getAttribute('data-session'), 'same-document');
  assert.equal(await snapshot(), originalNotes);
  const full = await page.locator('iframe').boundingBox();
  const viewport = page.viewportSize();
  const dock = await page.getByTestId('fullscreen-dock').boundingBox();
  assert.ok(full.x <= 1 && full.y <= 1 && full.width >= viewport.width - 1 && full.height >= viewport.height - 60);
  assert.ok(dock.y >= full.y + full.height - 1 && dock.y + dock.height <= viewport.height + 1, 'screen controls reserve space below the page');
  await page.screenshot({ path: 'test-results/content-fullscreen.png' });
  await tool('전체화면 종료').click();
  await count(1); await selected('펜');
  await expect(tool('실행 취소')).toBeEnabled();
  await tool('브라우저 전체화면').click();
  await page.keyboard.press('Escape');
  await expect(tool('브라우저 전체화면')).toBeVisible();
  await scrollTo(0);

  // A two-finger tap or pinch does not change the tool or create a stray stroke.
  await touch('touchStart', [[1, 160, 360], [2, 260, 360]]);
  await touch('touchEnd', []);
  await selected('펜'); await count(1);
  await touch('touchStart', [[1, 160, 360], [2, 260, 360]]);
  await touch('touchMove', [[1, 110, 360], [2, 310, 360]]);
  await touch('touchEnd', []);
  await selected('펜'); await count(1);
  assert.equal(await snapshot(), originalNotes);

  // Drawing -> two-finger drag cancels incomplete ink, switches the UI and
  // scrolls during this same gesture (not just after lifting and touching again).
  await pan();
  await selected('탐색');
  await expect.poll(scrollY).toBeGreaterThan(70);
  await count(1);
  assert.equal(await snapshot(), originalNotes);
  const beforeNativeScroll = await scrollY();
  await touch('touchStart', [[1, 340, 440]]);
  await touch('touchMove', [[1, 340, 410]]);
  await touch('touchMove', [[1, 340, 350]]);
  await expect.poll(scrollY).toBeGreaterThan(beforeNativeScroll + 20);
  await touch('touchCancel', []);
  await tool('실행 취소').click(); await count(0);
  await tool('다시 실행').click(); await count(1); await saved();

  // Erasing with the first finger must also be rolled back when a second joins.
  await scrollTo(0);
  await tool('지우개').click();
  const beforeErase = await snapshot();
  await touch('touchStart', [[1, 150, 280]]);
  await touch('touchStart', [[1, 150, 280], [2, 260, 280]]);
  await touch('touchMove', [[1, 150, 190], [2, 260, 190]]);
  await touch('touchEnd', []);
  await selected('탐색'); await count(1);
  assert.equal(await snapshot(), beforeErase);

  // Pen-only input still allows navigation with two fingers, including when
  // the toolbar is folded and when the entire app chrome is hidden.
  await scrollTo(0);
  await tool('펜').click();
  await page.getByRole('switch', { name: '펜만 입력' }).click();
  await tool('펜 도구 접기').click();
  await pan();
  await expect.poll(scrollY).toBeGreaterThan(70);
  await tool('펜 도구 펼치기').click();
  await selected('탐색'); await count(1);
  await scrollTo(0);
  await tool('펜').click();
  await tool('브라우저 전체화면').click();
  await pan();
  await expect.poll(scrollY).toBeGreaterThan(70);
  await tool('전체화면 종료').click();
  await selected('탐색'); await count(1);
  await page.getByRole('switch', { name: '펜만 입력' }).click();

  // Scroll the nearest overflow panel before the outer document.
  await scrollTo(0);
  await frame().locator('body').evaluate((body) => {
    const panel = document.createElement('div');
    panel.id = 'nested-scroll-test';
    panel.style.cssText = 'position:fixed;top:160px;left:60px;width:400px;height:300px;overflow:auto;background:white;z-index:3';
    panel.innerHTML = '<div style="height:1400px">Nested scroll content</div>';
    body.appendChild(panel);
  });
  await tool('펜').click();
  const beforeNestedScroll = await scrollY();
  await pan(370, 80);
  await selected('탐색');
  await expect.poll(() => frame().locator('#nested-scroll-test').evaluate((element) => element.scrollTop)).toBeGreaterThan(60);
  assert.equal(await scrollY(), beforeNestedScroll);
  await count(1);
  await frame().locator('#nested-scroll-test').evaluate((element) => element.remove());
  await page.screenshot({ path: 'test-results/browser-controls.png' });

  // Compact controls remain reachable in a narrow window.
  await page.setViewportSize({ width: 430, height: 850 });
  await expect(tool('서재 열기 또는 닫기')).toBeInViewport();
  await expect(tool('펜 도구 접기')).toBeInViewport();
  await expect(tool('브라우저 전체화면')).toBeInViewport();
  await tool('펜 도구 접기').click();
  await tool('브라우저 전체화면').click();
  await tool('전체화면 종료').click();
  await expect(tool('펜 도구 펼치기')).toBeVisible();
  assert.deepEqual(errors, []);
  console.log('PASS: browser controls, toolbar folding, content fullscreen/escape without reloading, two-finger pan, no ghost ink or erasing, tap/pinch rejection, pen-only, nested scroll, compact layout.');
} catch (error) {
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/interaction-failure.png' });
  throw error;
} finally {
  await context.close();
  await browser.close();
}
