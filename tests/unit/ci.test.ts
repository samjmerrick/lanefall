import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pkg from '../../package.json';

describe('CI config', () => {
  it('runs e2e in the Playwright image matching the installed @playwright/test', () => {
    const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
    const tag = /mcr\.microsoft\.com\/playwright:v([\d.]+)-/.exec(ci)?.[1];
    expect(tag).toBe(pkg.devDependencies['@playwright/test']);
  });
});
