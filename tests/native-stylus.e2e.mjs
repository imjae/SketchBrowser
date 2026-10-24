import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';

const channel = process.env.PLAYWRIGHT_CHANNEL === 'chromium' ? undefined : process.env.PLAYWRIGHT_CHANNEL || 'chrome';
const browser = await chromium.launch({ channel, headless: true });
const context = await browser.newContext({ viewport: { width: 1000, height: 940 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const frame = () => page.frameLocator('iframe').locator('body');
const tool = (name) => page.getByRole('button', { name, exact: true });
const mode = (name) => expect(page.getByText(new RegExp(`^${name} 모드`))).toBeVisible();
const count = (n) => expect(page.getByText(`${n}개의 획`, { exact: true }).last()).toBeVisible();
const notes = () => page.evaluate(() => JSON.parse(localStorage.getItem('@sketch-browser/page/v1/' + encodeURIComponent('sketch://welcome'))));
let stream = 0;
const pen = (type, x, y, pressed = false) => ({ kind: 'pen', id: 0, type, x, y, pressed, pressure: type === 'state' || type === 'up' ? 0 : 0.75 });
const finger = (type, id, x, y) => ({ kind: 'touch', id, type, x, y, pressed: false, pressure: 0.5 });
async function native(events, flags = {}, scale = 3) {
  if (flags.start) stream++;
  await frame().evaluate((_, data) => {
    window.__sketchBrowserInk.nativeInput({ ...data.flags, stream: data.stream,
      width: innerWidth * data.scale, height: innerHeight * data.scale,
      events: data.events.map((p) => ({ ...p, x: p.x * data.scale, y: p.y * data.scale })) });
  }, { events, flags, stream, scale });
}
async function stroke(y, held = false) {
  await native([pen('down', 120, y, held)], { start: true, owned: true });
  for (let x = 140; x <= 220; x += 20) await native([pen('move', x, y, held)]);
  await native([pen('up', 220, y, held)], { end: true });
}

try {
  await page.goto(process.env.SKETCH_TEST_URL || 'http://localhost:8081', { waitUntil: 'networkidle', timeout: 120000 });
  await expect(page.getByText('필기할 준비 완료', { exact: true })).toBeVisible({ timeout: 60000 });
  const cdp = await context.newCDPSession(page);
  const bounds = await page.locator('iframe').boundingBox();
  const domPen = (type, x, buttons, force) => cdp.send('Input.dispatchMouseEvent', {
    type, x: bounds.x + x, y: bounds.y + 250, pointerType: 'pen', buttons, force,
    button: type === 'mouseMoved' ? 'none' : 'left', clickCount: type === 'mouseMoved' ? 0 : 1,
  });

  // Browser preview: hover does not select pen; first contact draws immediately,
  // and the React acknowledgement must not split or truncate that first stroke.
  await domPen('mouseMoved', 100, 0, 0); await mode('탐색');
  await domPen('mousePressed', 100, 1, 0.6); await mode('펜');
  await domPen('mouseMoved', 180, 1, 0.7);
  await domPen('mouseReleased', 220, 0, 0); await count(1);
  let first = (await notes()).strokes[0];
  assert.equal(first.points[0].x, 100); assert.equal(first.points.at(-1).x, 220);
  await tool('실행 취소').click(); await count(0);
  await tool('탐색').click();

  // Native Android packets do not need any browser PointerEvent. Physical
  // pixels (3x) must map to the same document coordinates as browser events.
  await native([pen('state', 120, 300)]); await mode('탐색');
  await stroke(300); await count(1); await mode('펜');
  first = (await notes()).strokes[0];
  assert.equal(first.tool, 'pen'); assert.equal(first.points[0].x, 120);
  assert.equal(first.points.at(-1).x, 220); assert.equal(first.points[0].y, 300);
  assert.ok(first.points.length >= 6); assert.equal(first.points[1].pressure, 0.75);
  await stroke(390); await count(2);

  // Hover button changes the visible tool without deleting saved ink.
  await native([pen('state', 150, 300, true)]); await mode('지우개'); await count(2);
  await native([pen('state', 150, 300)]); await mode('펜'); await count(2);
  await stroke(300, true); await count(1); await mode('지우개');
  await native([pen('state', 220, 300)]); await mode('펜');
  await tool('실행 취소').click(); await count(2);

  // The physical button can start erasing and restore drawing mid-contact.
  await tool('밑줄').click();
  await native([pen('down', 120, 390)], { start: true });
  await mode('밑줄');
  await native([pen('state', 120, 390, true)]); await mode('지우개');
  await native([pen('state', 260, 480)]); await mode('밑줄');
  await native([pen('move', 330, 500)]);
  await native([pen('up', 330, 500)], { end: true }); await count(2);
  const resumed = (await notes()).strokes.at(-1);
  assert.equal(resumed.tool, 'underline'); assert.equal(resumed.points[0].y, resumed.points.at(-1).y);

  // ACTION_CANCEL and Android FLAG_CANCELED never persist incomplete ink or
  // deletions. Reset/focus loss must also release the temporary eraser.
  const beforeCancel = (await notes()).strokes;
  await native([pen('down', 120, 300, true)], { start: true });
  await native([pen('cancel', 180, 300)], { end: true }); await mode('밑줄');
  assert.deepEqual((await notes()).strokes, beforeCancel);
  await native([pen('down', 120, 520)], { start: true });
  await native([], { reset: true, end: true });
  assert.deepEqual((await notes()).strokes, beforeCancel);

  // Mixed native pen+finger streams retain two-finger navigation. A continuing
  // pen move cannot switch back to ink after the navigation gesture starts.
  await tool('펜').click();
  await native([pen('down', 100, 580)], { start: true });
  await native([finger('down', 1, 150, 500), finger('down', 2, 270, 500)]);
  await native([finger('move', 1, 150, 460), finger('move', 2, 270, 460)]);
  await mode('탐색');
  assert.ok(await frame().evaluate(() => scrollY) > 0);
  await native([pen('move', 200, 580)]); await mode('탐색');
  await native([finger('up', 1, 150, 460), finger('up', 2, 270, 460), pen('up', 200, 580)], { end: true });
  assert.deepEqual((await notes()).strokes, beforeCancel);

  // Next pen contact re-enters pen, including with folded controls/pen-only.
  await frame().evaluate(() => scrollTo(0, 0));
  await page.getByRole('switch', { name: '펜만 입력' }).click();
  await tool('펜 도구 접기').click();
  await stroke(600); await count(3); await mode('펜');
  await native([pen('state', 120, 600, true)]); await mode('지우개');
  await native([], { reset: true }); await mode('펜');
  assert.deepEqual(errors, []);
  console.log('PASS: first pen contact, native S Pen packets without DOM events, physical coordinate scaling, hover, button chord, tool restore, cancellation, mixed-touch navigation, folded controls.');
} finally {
  await context.close(); await browser.close();
}
