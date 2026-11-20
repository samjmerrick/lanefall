// Rewrites every card's `text` in cards.json from its data (src/engine/text.ts). `pnpm content:text`
import { readFileSync, writeFileSync } from 'node:fs';
import { CARDS, generatedText } from '../../src/engine';

const path = new URL('../../src/content/cards.json', import.meta.url);
const raw = JSON.parse(readFileSync(path, 'utf8')) as { id: string; text: string }[];
const byId = new Map(CARDS.map((c) => [c.id, c]));
let changed = 0;
for (const card of raw) {
  const text = generatedText(byId.get(card.id)!);
  if (card.text !== text) {
    console.log(`${card.id}: ${card.text} → ${text}`);
    card.text = text;
    changed++;
  }
}
writeFileSync(path, JSON.stringify(raw, null, 2) + '\n');
console.log(`${changed} card texts updated`);
