import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import cards from '../../src/content/cards.json';

/** Flip to true once every card has art, so a missing illustration fails CI. */
const REQUIRE_FULL_COVERAGE = true;

const ART_DIR = join(__dirname, '../../src/content/art');
const MAX_BYTES = 2048;
const ALLOWED = new Set(['svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'polygon', 'polyline', 'line']);
const SHAPES = new Set([...ALLOWED].filter((n) => n !== 'svg' && n !== 'g'));

/** Line-icon style (docs/art.md): one stroke group in the faction's line colour, no backdrop. */
const PALETTE: Record<string, { line: string }> = {
  ember: { line: '#ff9a3c' },
  tide: { line: '#8fd0ff' },
  grove: { line: '#a6d96a' },
  bastion: { line: '#e8e2cf' },
  dusk: { line: '#c9a3f0' },
};
const GROUP = [
  ['fill', 'none'],
  ['stroke-width', '4'],
  ['stroke-linecap', 'round'],
  ['stroke-linejoin', 'round'],
] as const;

function attr(attrs: string, name: string): string | undefined {
  return new RegExp(`(?:^|\\s)${name}\\s*=\\s*"([^"]*)"`).exec(attrs)?.[1];
}

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
        expect(src).not.toMatch(/url\(/);
      });

      it('follows the line-icon style', () => {
        const pal = PALETTE[f.split('-')[0] ?? ''];
        expect(pal, 'unknown faction prefix').toBeDefined();
        const [, group, ...shapes] = all;
        expect(group?.name, 'second element must be the stroke <g> (no backdrop shape)').toBe('g');
        for (const [k, v] of GROUP) expect(attr(group!.attrs, k), `<g ${k}>`).toBe(v);
        expect(attr(group!.attrs, 'stroke'), '<g stroke> must be the faction line colour').toBe(pal!.line);
        expect(shapes.length, 'no drawing').toBeGreaterThan(0);
        for (const t of shapes) {
          expect(SHAPES.has(t.name), `<${t.name}> inside the group`).toBe(true);
          for (const a of attrNames(t.attrs)) {
            expect(
              ['fill', 'stroke', 'stroke-width', 'opacity', 'transform'],
              `${a} on <${t.name}>`,
            ).not.toContain(a);
          }
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
