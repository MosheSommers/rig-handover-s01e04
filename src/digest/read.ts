import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, NightDigest, RunStatus } from './types.js';

type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES: readonly string[] = ['ok', 'retry', 'fail'];

function isRunLine(v: unknown): v is RunLine {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.at === 'string' &&
    typeof o.job === 'string' &&
    typeof o.status === 'string' &&
    STATUSES.includes(o.status) &&
    (o.owner === null || typeof o.owner === 'string') &&
    (o.error === undefined || typeof o.error === 'string')
  );
}

function parseLine(line: string): RunLine | null {
  try {
    const v: unknown = JSON.parse(line);
    return isRunLine(v) ? v : null;
  } catch {
    return null;
  }
}

function readLog(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
}

export function readNight(runsDir: string, night: string): NightDigest | null {
  // night comes from a URL; the regex also keeps it from escaping runsDir.
  if (!NIGHT.test(night)) return null;
  const text = readLog(join(runsDir, `${night}.jsonl`));
  if (text === null) return null;

  const byJob = new Map<string, DigestRow>();
  let badLines = 0;

  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue;
    const line = parseLine(raw);
    if (line === null) {
      badLines++;
      continue;
    }
    const row = byJob.get(line.job);
    if (row === undefined) {
      byJob.set(line.job, {
        job: line.job,
        owner: line.owner,
        runs: 1,
        retries: line.status === 'retry' ? 1 : 0,
        lastStatus: line.status,
        lastError: line.error ?? null,
        firstAt: line.at,
        lastAt: line.at,
      });
      continue;
    }
    row.owner = line.owner;
    row.runs++;
    if (line.status === 'retry') row.retries++;
    row.lastStatus = line.status;
    if (line.error !== undefined) row.lastError = line.error;
    row.lastAt = line.at;
  }

  const rows = [...byJob.values()].sort((a, b) =>
    a.job < b.job ? -1 : a.job > b.job ? 1 : 0,
  );
  return { rows, badLines };
}
