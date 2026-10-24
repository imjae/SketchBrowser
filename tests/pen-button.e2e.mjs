import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';

const channel = process.env.PLAYWRIGHT_CHANNEL === 'chromium' ? undefined : process.env.PLAYWRIGHT_CHANNEL || 'chrome';
const browser = await chromium.launch({ channel, headless: true });
const context = await browser.newContext({ viewport: { width: 1000, height: 940 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const cdp = await context.newCDPSession(page);
const tool = (name) => page.getByRole('button', { name, exact: true });
const mode = (name) => expect(page.getByText(new RegExp(`^${name} 모드`))).toBeVisible();
const count = (n) => expect(page.getByText(`${n}개의 획`, { exact: true }).last()).toBeVisible();
const snapshot = () => page.evaluate(() => localStorage.getItem('@sketch-browser/page/v1/' + encodeURIComponent('sketch://welcome')));

async function pen(type, x, y, button = 'none', buttons = 0, force = 0) {
  const bounds = await page.locator('iframe').boundingBox();
  await cdp.send('Input.dispatchMouseEvent', { type, x: bounds.x + x, y: bounds.y + y,
    button, buttons, force, clickCount: type === 'mouseMoved' ? 0 : 1, pointerType: 'pen' });
}
async function mouseStroke(y) {
  const bounds = await page.locator('iframe').boundingBox();
  await page.mouse.move(bounds.x + 110, bounds.y + y);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 220, bounds.y + y, { steps: 12 });
  await page.mouse.up();
}

try {
  await page.goto(process.env.SKETCH_TEST_URL || 'http://localhost:8081', { waitUntil: 'networkidle', timeout: 120000 });
  await expect(page.getByText('필기할 준비 완료', { exact: true })).toBeVisible({ timeout: 60000 });
  await tool('펜').click();
  await mouseStroke(300); await mouseStroke(390); await count(2);
  const original = await snapshot();

  // A barrel press while hovering changes the UI but must not erase anything.
  await pen('mousePressed', 150, 300, 'right', 2, 0);
  await mode('지우개'); await count(2);
  await pen('mouseMoved', 180, 300, 'none', 2, 0);
  assert.equal(await snapshot(), original);
  await pen('mouseReleased', 180, 300, 'right', 0, 0);
  await mode('펜'); await count(2);

  // Keep the barrel held, touch the tip, lift the tip, then release the barrel.
  // Chord transitions arrive as pointermove instead of a new pointerdown/up.
  await tool('형광펜').click();
  await pen('mousePressed', 150, 300, 'right', 2, 0);
  await mode('지우개');
  await pen('mousePressed', 150, 300, 'left', 3, 0.8);
  await pen('mouseMoved', 200, 300, 'none', 3, 0.8);
  await pen('mouseReleased', 200, 300, 'left', 2, 0);
  await count(1); await mode('지우개');
  await pen('mouseReleased', 200, 300, 'right', 0, 0);
  await mode('형광펜'); await count(1);
  await tool('실행 취소').click(); await count(2);

  // Restore whichever tool was selected, including browse with no canvas hit test.
  for (const name of ['펜', '밑줄', '형광펜', '탐색']) {
    await tool(name).click();
    await pen('mousePressed', 150, 390, 'right', 2, 0);
    await mode('지우개');
    await pen('mouseReleased', 150, 390, 'right', 0, 0);
    await mode(name); await count(2);
  }

  // Some stylus drivers report barrel-only buttons=2 plus contact pressure.
  await pen('mousePressed', 150, 390, 'right', 2, 0.8);
  await mode('지우개');
  await pen('mouseMoved', 210, 390, 'none', 2, 0.8);
  await pen('mouseReleased', 210, 390, 'right', 0, 0);
  await count(1); await mode('펜');
  await tool('실행 취소').click(); await count(2);

  // Release the barrel while the tip is still down: resume the original pen
  // and retain its color/width without needing another tap on the toolbar.
  await tool('펜').click();
  await tool('색상 #d65c53').click(); await tool('굵기 5').click();
  await pen('mousePressed', 350, 480, 'left', 1, 0.7);
  await pen('mouseMoved', 400, 480, 'none', 1, 0.7);
  await pen('mousePressed', 400, 480, 'right', 3, 0.7);
  await mode('지우개');
  await pen('mouseReleased', 400, 480, 'right', 1, 0.7);
  await mode('펜');
  await pen('mouseMoved', 480, 480, 'none', 1, 0.7);
  await pen('mouseReleased', 480, 480, 'left', 0, 0);
  await count(3);
  const resumed = JSON.parse(await snapshot()).strokes.at(-1);
  assert.equal(resumed.tool, 'pen'); assert.equal(resumed.color, '#d65c53'); assert.equal(resumed.width, 5);

  // Mouse right-click is not a pen barrel button.
  const beforeMouse = await snapshot();
  const bounds = await page.locator('iframe').boundingBox();
  await page.mouse.click(bounds.x + 150, bounds.y + 300, { button: 'right' });
  await mode('펜'); assert.equal(await snapshot(), beforeMouse);

  // Pen-only and folded tools continue to support temporary erasing.
  await page.getByRole('switch', { name: '펜만 입력' }).click();
  await tool('펜 도구 접기').click();
  await pen('mousePressed', 150, 300, 'right', 2, 0.8);
  await mode('지우개');
  await pen('mouseReleased', 150, 300, 'right', 0, 0);
  await mode('펜'); await count(2);
  await tool('펜 도구 펼치기').click();
  await tool('실행 취소').click(); await count(3);

  // Losing focus must not leave the eraser stuck on after returning.
  await pen('mousePressed', 150, 300, 'right', 2, 0);
  await mode('지우개');
  await page.frameLocator('iframe').locator('body').evaluate(() => window.dispatchEvent(new Event('blur')));
  await mode('펜');
  await pen('mouseReleased', 150, 300, 'right', 0, 0);
  await count(3);
  assert.deepEqual(errors, []);
  console.log('PASS: pen barrel hover/contact, chorded tip/button transitions, previous tool/color/width restore, browse-mode erase, pressure-only contact, mouse exclusion, pen-only, folded toolbar, focus recovery.');
} finally {
  await context.close();
  await browser.close();
}
