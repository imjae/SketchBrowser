import assert from 'node:assert/strict';
import test from 'node:test';
import { fitCard, placeQuestion } from '../src/ask/layout';

test('answer card uses available space away from the selected question', () => {
  const area = { width: 1000, height: 800 }, card = { width: 440, height: 280 };
  const p = placeQuestion(card, area, { x: .55, y: .55, width: .4, height: .4 });
  assert.ok(p.x + card.width < 550 || p.y + card.height < 440);
  assert.ok(p.x >= 8 && p.y >= 8 && p.x + card.width <= 992 && p.y + card.height <= 792);
});

test('moving and rotating a card keeps its controls within the available page', () => {
  const card = { width: 374, height: 220 }, area = { width: 390, height: 600 };
  for (const request of [{ x: -200, y: -300 }, { x: 1200, y: 800 }]) {
    const p = fitCard(request, card, area);
    assert.ok(p.x >= 8 && p.y >= 8 && p.x + card.width <= 382 && p.y + card.height <= 592);
  }
});
