// Renders public/icon.svg to the PNG sizes the web manifest needs: pnpm tsx tools/render-icons.ts
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const svg = readFileSync('public/icon.svg', 'utf8');
const browser = await chromium.launch();
for (const size of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<html><body style="margin:0;background:#0f1117">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`,
  );
  await page.screenshot({ path: `public/icon-${size}.png`, omitBackground: false });
  await page.close();
}
await browser.close();
console.log('Wrote public/icon-192.png and public/icon-512.png');
