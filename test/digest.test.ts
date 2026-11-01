import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/types.js';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28');

  it('folds the night into one row per job, sorted, with 1 bad line', () => {
    expect(night).not.toBeNull();
    expect(night?.badLines).toBe(1);
    expect(night?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('counts runs and retries and keeps the last status and error', () => {
    const row = (job: string) => night?.rows.find((r) => r.job === job);
    expect(row('fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(row('lane/sync')).toMatchObject({
      runs: 8,
      retries: 1,
      lastStatus: 'ok',
      lastError: 'lock held',
      firstAt: '2026-10-28T23:00:06+01:00',
      lastAt: '2026-10-29T05:00:04+01:00',
    });
    expect(row('notes/backup')).toMatchObject({
      lastStatus: 'fail',
      lastError: 'quota exceeded',
    });
    expect(row('rig/rotate-logs')).toMatchObject({ lastError: null });
    expect(row('digest/render')).toMatchObject({ owner: null, runs: 1 });
  });
});

describe('readNight edge cases', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('returns null when the night has no file', () => {
    expect(readNight(dir, '2026-01-01')).toBeNull();
  });

  it('returns no rows for an empty file', () => {
    writeFileSync(join(dir, '2026-01-02.jsonl'), '');
    expect(readNight(dir, '2026-01-02')).toEqual({ rows: [], badLines: 0 });
  });

  it('counts JSON that is not a run line as bad', () => {
    const lines = [
      '{"at":"x","job":"a","status":"done","owner":null}',
      '{"at":"x","job":"a","status":"ok"}',
      '[]',
      '',
    ];
    writeFileSync(join(dir, '2026-01-03.jsonl'), lines.join('\n'));
    expect(readNight(dir, '2026-01-03')).toEqual({ rows: [], badLines: 3 });
  });

  it('rejects a night that is not YYYY-MM-DD', () => {
    writeFileSync(join(dir, 'x.jsonl'), '');
    expect(readNight(dir, 'x')).toBeNull();
    expect(readNight(dir, '../runs/2026-10-28')).toBeNull();
  });
});
