import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const dir = mkdtempSync(join(tmpdir(), 'rig-routes-'));
const config = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir: dir,
};

const line = (at: string, job: string, status: string, owner: string | null, error?: string) =>
  JSON.stringify({ at, job, status, owner, ...(error ? { error } : {}) });

const good = [
  line('2026-02-01T23:00:00+01:00', 'zeta/job', 'ok', 'rook'),
  line('2026-02-01T23:05:00+01:00', 'alpha/job', 'ok', null),
  line('2026-02-01T23:10:00+01:00', 'mid/job', 'fail', 'lane-07', 'boom'),
];

const app = () => createApp(config);
const get = (path: string) => app().request(path);

// Job names in the order they appear in the page's job column.
const pageJobs = (html: string) =>
  [...html.matchAll(/<tr><td>([^<]+)<\/td>/g)].map((m) => m[1]);

beforeAll(() => {
  process.env.LANE_MARKER = 'TEST-MARKER';
  writeFileSync(join(dir, '2026-02-01.jsonl'), good.join('\n') + '\n');
  writeFileSync(join(dir, '2026-02-02.jsonl'), '');
  writeFileSync(
    join(dir, '2026-02-03.jsonl'),
    [good[0], 'not json at all', good[1]].join('\n') + '\n',
  );
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('GET /digest/:night', () => {
  it('200 with sorted jobs and the lane banner', async () => {
    const res = await get('/digest/2026-02-01');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    expect(pageJobs(html)).toEqual(['alpha/job', 'mid/job', 'zeta/job']);
  });

  it('renders a null owner as an em dash', async () => {
    const html = await (await get('/digest/2026-02-01')).text();
    expect(html).toContain('<td>alpha/job</td><td>—</td>');
  });

  it('404 for a night with no file', async () => {
    const res = await get('/digest/2026-02-09');
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('no run log for 2026-02-09');
  });

  it('says nothing ran for an empty night', async () => {
    const res = await get('/digest/2026-02-02');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('stays 200 and mentions the bad line count', async () => {
    const res = await get('/digest/2026-02-03');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('1 line did not parse');
    expect(pageJobs(html)).toEqual(['alpha/job', 'zeta/job']);
  });
});

describe('GET /api/digest/:night', () => {
  it('200 with night, rows and badLines in the page order', async () => {
    const res = await get('/api/digest/2026-02-01');
    const body = (await res.json()) as { night: string; rows: { job: string }[]; badLines: number };
    const html = await (await get('/digest/2026-02-01')).text();
    expect(res.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(['badLines', 'night', 'rows']);
    expect(body.night).toBe('2026-02-01');
    expect(body.badLines).toBe(0);
    expect(body.rows.map((r) => r.job)).toEqual(pageJobs(html));
  });

  it('404 for a night with no file', async () => {
    const res = await get('/api/digest/2026-02-09');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no run log for 2026-02-09' });
  });

  it('gives no rows and no bad lines for an empty night', async () => {
    const res = await get('/api/digest/2026-02-02');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ night: '2026-02-02', rows: [], badLines: 0 });
  });

  it('counts the bad line and keeps the good rows', async () => {
    const res = await get('/api/digest/2026-02-03');
    const body = (await res.json()) as { rows: { job: string }[]; badLines: number };
    expect(res.status).toBe(200);
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['alpha/job', 'zeta/job']);
  });
});
