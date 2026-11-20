// Every lane effect's name and text must fit the 56 px lane strip (three columns) at each supported width.
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openMenu } from './helpers';
import { VIEWPORTS } from './viewports';

const LANE_EFFECTS = JSON.parse(readFileSync('src/content/lanes.json', 'utf8')) as {
  name: string;
  text: string;
}[];

for (const vp of VIEWPORTS) {
  test(`lane effect texts fit the lane strip at ${vp.width}px`, async ({ page }) => {
    await page.setViewportSize(vp);
    await openMenu(page);
    const tooBig = await page.evaluate(
      (lanes) => {
        const out: string[] = [];
        const host = document.createElement('div');
        host.className = 'match';
        host.style.display = 'block';
        host.style.position = 'absolute';
        host.style.inset = '0 auto auto 0';
        host.style.zIndex = '9999';
        document.body.appendChild(host);
        for (let i = 0; i < lanes.length; i += 3) {
          const strip = document.createElement('div');
          strip.className = 'lane-strip';
          strip.style.gridTemplateRows = '56px';
          strip.style.height = '56px';
          for (const lane of lanes.slice(i, i + 3)) {
            const info = document.createElement('div');
            info.className = 'lane-info';
            info.style.height = '56px';
            info.innerHTML =
              '<span class="lane-info__powers"><span class="lane-info__power">0</span><span class="lane-info__power">0</span></span>' +
              '<span class="lane-info__effect"><strong></strong><span></span></span>';
            info.querySelector('strong')!.textContent = lane.name;
            info.querySelector('.lane-info__effect > span')!.textContent = lane.text;
            strip.appendChild(info);
          }
          host.appendChild(strip);
        }
        for (const info of host.querySelectorAll<HTMLElement>('.lane-info')) {
          const fx = info.querySelector<HTMLElement>('.lane-info__effect')!;
          const name = fx.querySelector('strong')!.textContent;
          if (fx.offsetHeight > info.clientHeight - 4 || fx.scrollWidth > fx.clientWidth)
            out.push(`${name} (${fx.offsetHeight}px of ${info.clientHeight - 4}px)`);
        }
        return out;
      },
      LANE_EFFECTS.map((l) => ({ name: l.name, text: l.text })),
    );
    expect(tooBig, 'lane texts that do not fit').toEqual([]);
  });
}
