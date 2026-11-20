// Contact sheet of card art: pnpm art:sheet [faction | id prefix]  ->  art-sheets/<filter or all>.png
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

interface Card {
  id: string;
  name: string;
  faction: string;
  type: string;
  cost: number;
  token?: boolean;
}

const cards = JSON.parse(readFileSync('src/content/cards.json', 'utf8')) as Card[];
const filter = process.argv[2];
const picked = cards.filter((c) => !filter || c.faction === filter || c.id.startsWith(filter));
if (picked.length === 0) {
  console.error(`No cards match "${filter}"`);
  process.exit(1);
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const cell = (c: Card) => {
  const file = join('src/content/art', `${c.id}.svg`);
  const caption = `<div class="id">${esc(c.id)}</div><div>${esc(c.name)} · ${c.type}${c.token ? ' (token)' : ''} · ${c.cost}</div>`;
  if (!existsSync(file)) return `<div class="cell missing"><b>MISSING</b>${caption}</div>`;
  const uri = `data:image/svg+xml;base64,${readFileSync(file).toString('base64')}`;
  const box = (n: number) =>
    `<span class="box" style="width:${n + 8}px;height:${n + 8}px"><img src="${uri}" width="${n}" height="${n}"></span>`;
  return `<div class="cell faction-${c.faction}"><div class="row">${box(120)}${box(64)}${box(40)}</div>${caption}</div>`;
};

const html = `<html><head><style>
body{margin:0;padding:12px;background:#0f1117;color:#e8e8ee;font:12px system-ui,sans-serif}
.grid{display:grid;grid-template-columns:repeat(6,280px);gap:10px}
.faction-ember{--f:#e5484d}.faction-tide{--f:#3e93f7}.faction-grove{--f:#46a758}.faction-bastion{--f:#e8e2cf}.faction-dusk{--f:#8e4ec6}
.cell{padding:6px;border-radius:10px;border:2px solid var(--f);background:linear-gradient(160deg,color-mix(in srgb,var(--f) 35%,#1a1d27),#14161e)}
.row{display:flex;gap:8px;align-items:flex-end;margin-bottom:6px}
.box{display:grid;place-items:center;border-radius:6px;background:rgb(0 0 0/.25)}
.id{font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.missing{border-color:#e5484d;background:#3a1216;min-height:150px}.missing b{display:block;color:#ff6b6b;font-size:16px;padding:50px 0 40px;text-align:center}
</style></head><body><div class="grid">${picked.map(cell).join('')}</div></body></html>`;

mkdirSync('art-sheets', { recursive: true });
const out = `art-sheets/${filter ?? 'all'}.png`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1800, height: 800 }, deviceScaleFactor: 1 });
await page.setContent(html);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(`Wrote ${out} (${picked.length} cards)`);
