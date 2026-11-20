import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import cards from '../../src/content/cards.json';

/** Flip to true once every card has art, so a missing illustration fails CI. */
const REQUIRE_FULL_COVERAGE = false;

const ART_DIR = join(__dirname, '../../src/content/art');
const MAX_BYTES = 4096;
const ALLOWED = new Set([
  'svg',
  'g',
  'path',
  'circle',
  'ellipse',
  'rect',
  'polygon',
  'polyline',
  'line',
  'defs',
  'linearGradient',
  'radialGradient',
  'stop',
  'clipPath',
]);

const ids = new Set((cards as { id: string }[]).map((c) => c.id));
const files = readdirSync(ART_DIR).filter((f) => f.endsWith('.svg'));

/** Tiny tag scanner: returns each opening tag's name and raw attribute text. */
function tags(src: string): { name: string; attrs: string }[] {
  const stripped = src.replace(/<!--[\s\S]*?-->/g, '').replace(/<\?[\s\S]*?\?>/g, '');
  return [...stripped.matchAll(/<\s*([A-Za-z][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g)].map((m) => ({
    name: m[1] ?? '',
    attrs: m[2] ?? '',
  }));
}

function attrNames(attrs: string): string[] {
  return [...attrs.matchAll(/([^\s=/"']+)\s*=\s*(?:"[^"]*"|'[^']*')/g)].map((m) => m[1] ?? '');
}

describe('card art', () => {
  it('only contains SVG files named after base card ids', () => {
    for (const f of readdirSync(ART_DIR)) {
      if (f === '.gitkeep') continue;
      expect(f.endsWith('.svg'), `${f} is not an .svg file`).toBe(true);
      expect(ids.has(f.slice(0, -4)), `${f} does not match a base card id`).toBe(true);
    }
  });

  for (const f of files) {
    describe(f, () => {
      const src = readFileSync(join(ART_DIR, f), 'utf8');
      const all = tags(src);

      it('is small enough', () => {
        expect(statSync(join(ART_DIR, f)).size).toBeLessThanOrEqual(MAX_BYTES);
      });

      it('has a well-formed root', () => {
        expect(all[0]?.name).toBe('svg');
        const root = all[0]?.attrs ?? '';
        expect(root).toMatch(/xmlns\s*=\s*"http:\/\/www\.w3\.org\/2000\/svg"/);
        expect(root).toMatch(/viewBox\s*=\s*"0 0 100 100"/);
        const names = attrNames(root);
        expect(names).not.toContain('width');
        expect(names).not.toContain('height');
      });

      it('uses only allowed elements and attributes', () => {
        for (const t of all) {
          expect(ALLOWED.has(t.name), `<${t.name}> is not allowed`).toBe(true);
          for (const a of attrNames(t.attrs)) {
            expect(/^on/i.test(a), `${a} event handler`).toBe(false);
            expect(/(^|:)href$/i.test(a), `${a} is not allowed`).toBe(false);
            expect(
              a.toLowerCase(),
              'style attributes are not allowed (use presentation attributes)',
            ).not.toBe('style');
          }
        }
        expect(src).not.toMatch(/<!(?!--)/); // DOCTYPE, CDATA
        for (const m of src.matchAll(/url\(([^)]*)\)/g)) {
          expect((m[1] ?? '').trim(), `url(${m[1]})`).toMatch(/^#[\w-]+$/);
        }
      });
    });
  }

  it('reports cards without art', () => {
    const have = new Set(files.map((f) => f.slice(0, -4)));
    const missing = (cards as { id: string }[]).map((c) => c.id).filter((id) => !have.has(id));
    if (REQUIRE_FULL_COVERAGE) {
      expect(missing, `cards missing art:\n${missing.join('\n')}`).toEqual([]);
    } else if (missing.length > 0) {
      console.warn(`card art: ${missing.length} of ${ids.size} cards have no art yet`);
    }
  });
});
