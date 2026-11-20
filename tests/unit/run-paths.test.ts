import { describe, expect, it } from 'vitest';
import { starterCollection } from '../../src/engine';
import { replayRun, type RunChoice } from '../../src/run';
import fixture from '../fixtures/run-paths.json';

// The e2e tests load these saved runs to reach each node screen; keep them valid as content changes.
describe('e2e run path fixture', () => {
  it('uses the starter pool and each path reaches its node', () => {
    expect(fixture.config.pool).toEqual([...starterCollection()].sort());
    const paths = fixture.paths as Record<string, RunChoice[]>;
    for (const [kind, choices] of Object.entries(paths)) {
      const r = replayRun(fixture.config, choices);
      expect(r.phase.kind, kind).toBe(kind === 'restAfterLoss' ? 'rest' : kind);
    }
    expect(replayRun(fixture.config, paths.restAfterLoss!).hearts).toBe(2);
  });
});
