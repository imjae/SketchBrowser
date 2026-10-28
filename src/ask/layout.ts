import type { QuestionSelection } from './protocol';

export type Area = { width: number; height: number };
export type Position = { x: number; y: number };
export type QuestionPlacement = { area: Area; anchor?: QuestionSelection['bounds'] };

export function fitCard(position: Position, card: Area, area: Area): Position {
  return {
    x: Math.max(8, Math.min(position.x, Math.max(8, area.width - card.width - 8))),
    y: Math.max(8, Math.min(position.y, Math.max(8, area.height - card.height - 8))),
  };
}

export function placeQuestion(card: Area, area: Area, anchor?: QuestionSelection['bounds']): Position {
  const corners = [
    { x: area.width - card.width - 8, y: area.height - card.height - 8 },
    { x: 8, y: area.height - card.height - 8 },
    { x: area.width - card.width - 8, y: 8 }, { x: 8, y: 8 },
  ].map(p => fitCard(p, card, area));
  if (!anchor) return corners[0];
  const target = { x: anchor.x * area.width, y: anchor.y * area.height,
    width: anchor.width * area.width, height: anchor.height * area.height };
  const overlap = (p: Position) => Math.max(0, Math.min(p.x + card.width, target.x + target.width + 8) - Math.max(p.x, target.x - 8)) *
    Math.max(0, Math.min(p.y + card.height, target.y + target.height + 8) - Math.max(p.y, target.y - 8));
  return corners.reduce((best, p) => overlap(p) < overlap(best) ? p : best);
}
