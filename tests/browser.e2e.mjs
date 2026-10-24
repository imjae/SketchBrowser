import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';

const baseUrl = process.env.SKETCH_TEST_URL || 'http://localhost:8081';
const channel = process.env.PLAYWRIGHT_CHANNEL === 'chromium' ? undefined : process.env.PLAYWRIGHT_CHANNEL || 'chrome';
const browser = await chromium.launch({ channel, headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, hasTouch: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const frame = () => page.frameLocator('iframe');
const count = (n) => expect(page.getByText(`${n}개의 획`, { exact: true }).last()).toBeVisible();

async function draw(points) {
  const bounds = await page.locator('iframe').boundingBox();
  await page.mouse.move(bounds.x + points[0][0], bounds.y + points[0][1]);
  await page.mouse.down();
  for (const [x, y] of points.slice(1)) await page.mouse.move(bounds.x + x, bounds.y + y, { steps: 8 });
  await page.mouse.up();
}
async function notes(url) {
  return page.evaluate((value) => JSON.parse(localStorage.getItem('@sketch-browser/page/v1/' + encodeURIComponent(value)) || 'null'), url);
}
async function waitSaved() { await expect(page.getByText('기기에 저장됨', { exact: true })).toBeVisible(); }

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 120000 });
  await expect(page.getByText('필기할 준비 완료', { exact: true })).toBeVisible({ timeout: 60000 });
  await expect(frame().locator('#headline')).toContainText('웹 위에');
  await count(0);

  // Draw real pointer strokes through the same canvas script used on Android.
  await page.getByRole('button', { name: '펜', exact: true }).click();
  await draw([[110, 280], [150, 240], [180, 285], [210, 245]]);
  await count(1); await waitSaved();
  assert.equal((await notes('sketch://welcome')).strokes[0].tool, 'pen');

  await page.getByRole('button', { name: '밑줄', exact: true }).click();
  await draw([[110, 350], [300, 390]]);
  await count(2); await waitSaved();
  const underline = (await notes('sketch://welcome')).strokes[1];
  assert.equal(underline.points[0].y, underline.points[1].y);
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await count(1);
  await page.getByRole('button', { name: '다시 실행', exact: true }).click();
  await count(2);

  await page.getByRole('button', { name: '형광펜', exact: true }).click();
  await draw([[120, 410], [320, 410]]);
  await count(3); await waitSaved();
  assert.equal((await notes('sketch://welcome')).strokes[2].tool, 'highlighter');

  await page.getByRole('button', { name: '지우개', exact: true }).click();
  await draw([[200, 345], [200, 355]]);
  await count(2); await waitSaved();
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await count(3); await waitSaved();

  // Reload and switching pages must restore independently, including library entries.
  await page.reload({ waitUntil: 'networkidle' });
  await count(3); await waitSaved();
  await page.getByRole('button', { name: '연습 노트 열기', exact: true }).click();
  await count(0);
  await expect(page.getByText('필기할 준비 완료', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '펜', exact: true }).click();
  await draw([[120, 300], [280, 320]]);
  await count(1); await waitSaved();
  assert.equal((await notes('sketch://practice')).strokes.length, 1);
  await page.getByRole('button', { name: '시작 노트 열기', exact: true }).click();
  await count(3);

  // Ink follows scrolling and a paragraph moving down the page.
  await page.getByRole('button', { name: '탐색', exact: true }).click();
  await frame().locator('body').evaluate(() => window.scrollTo(0, 600));
  await page.getByRole('button', { name: '펜', exact: true }).click();
  const paragraph = await frame().locator('#paragraph-one').boundingBox();
  const iframeBounds = await page.locator('iframe').boundingBox();
  const relativeY = paragraph.y - iframeBounds.y + 20;
  await draw([[paragraph.x - iframeBounds.x + 10, relativeY], [paragraph.x - iframeBounds.x + 100, relativeY]]);
  await count(4); await waitSaved();
  const anchored = (await notes('sketch://welcome')).strokes.at(-1);
  assert.equal(anchored.anchor.selector, '#paragraph-one');
  await frame().locator('#section-one').evaluate((element) => { element.style.marginTop = '150px'; });
  await frame().locator('body').evaluate(() => window.scrollTo(0, 720));
  await expect.poll(() => frame().locator('canvas[data-sketch-browser-ink]').evaluate((canvas, stroke) => {
    const element = document.querySelector(stroke.anchor.selector);
    const rect = element.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const x = rect.left + (stroke.points[0].x - stroke.anchor.x) * rect.width / stroke.anchor.width - canvasRect.left;
    const y = rect.top + stroke.points[0].y - stroke.anchor.y - canvasRect.top;
    const dpr = canvas.width / canvasRect.width;
    return canvas.getContext('2d').getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data[3];
  }, anchored)).toBeGreaterThan(0);
  await page.getByRole('button', { name: '탐색', exact: true }).click();

  // Pen-only mode must reject finger/mouse but accept stylus pointer events.
  await page.getByRole('button', { name: '펜', exact: true }).click();
  await page.getByRole('switch', { name: '펜만 입력' }).click();
  await draw([[120, 300], [180, 320]]);
  await count(4);
  const bounds = await page.locator('iframe').boundingBox();
  await page.touchscreen.tap(bounds.x + 180, bounds.y + 300);
  await count(4);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: bounds.x + 150, y: bounds.y + 300, button: 'left', clickCount: 1, pointerType: 'pen', force: 0.4 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: bounds.x + 220, y: bounds.y + 325, button: 'left', buttons: 1, pointerType: 'pen', force: 0.8 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: bounds.x + 220, y: bounds.y + 325, button: 'left', clickCount: 1, pointerType: 'pen' });
  await count(5); await waitSaved();
  await page.getByRole('switch', { name: '펜만 입력' }).click();
  await page.getByRole('button', { name: '탐색', exact: true }).click();
  await frame().locator('body').evaluate(() => window.scrollTo(0, 0));
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/tablet-landscape.png' });

  // Portrait mode keeps a usable canvas and a dismissible library drawer.
  await page.setViewportSize({ width: 800, height: 1100 });
  await page.getByRole('button', { name: '서재 닫기', exact: true }).click();
  await expect(page.locator('iframe')).toBeVisible();
  await page.getByRole('button', { name: '서재 열기 또는 닫기' }).click();
  await expect(page.getByText('나의 서재', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '서재 닫기', exact: true }).click();
  await page.screenshot({ path: 'test-results/tablet-portrait.png' });

  // A new app session uses persisted ink, not component state.
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto(baseUrl, { waitUntil: 'networkidle' });
  await expect(reopened.getByText('5개의 획', { exact: true }).last()).toBeVisible();
  // Simulate a full disk: do not claim success, keep the draft when navigating,
  // and allow a successful retry without losing the new stroke.
  await reopened.evaluate(() => {
    window.sketchFailSave = true;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (window.sketchFailSave && key.startsWith('@sketch-browser/page/')) throw new Error('disk full');
      return original.call(this, key, value);
    };
  });
  await reopened.getByRole('button', { name: '펜', exact: true }).click();
  const reopenedBounds = await reopened.locator('iframe').boundingBox();
  await reopened.mouse.move(reopenedBounds.x + 120, reopenedBounds.y + 300);
  await reopened.mouse.down();
  await reopened.mouse.move(reopenedBounds.x + 180, reopenedBounds.y + 310, { steps: 8 });
  await reopened.mouse.up();
  await expect(reopened.getByText('저장 확인 필요', { exact: true })).toBeVisible();
  await reopened.getByRole('button', { name: '연습 노트 열기', exact: true }).click();
  await expect(reopened.getByText('1개의 획', { exact: true }).last()).toBeVisible();
  await reopened.getByRole('button', { name: '시작 노트 열기', exact: true }).click();
  await expect(reopened.getByText('6개의 획', { exact: true }).last()).toBeVisible();
  await expect(reopened.getByText('저장 확인 필요', { exact: true })).toBeVisible();
  await reopened.evaluate(() => { window.sketchFailSave = false; });
  await reopened.getByRole('button', { name: '다시 시도', exact: true }).click();
  await expect(reopened.getByText('기기에 저장됨', { exact: true })).toBeVisible();
  await reopened.reload({ waitUntil: 'networkidle' });
  await expect(reopened.getByText('6개의 획', { exact: true }).last()).toBeVisible();
  await reopened.close();
  assert.deepEqual(errors, []);
  console.log('PASS: drawing, straight underline, highlight, erasing, undo/redo, reload, per-page persistence, anchored ink pixels, pen-only, portrait layout, session restore, failed-save draft recovery.');
} finally {
  await context.close();
  await browser.close();
}
