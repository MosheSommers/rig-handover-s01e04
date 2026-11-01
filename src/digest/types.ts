export type RunStatus = 'ok' | 'retry' | 'fail';

// One job's night, folded from its log lines in file order.
export type DigestRow = {
  job: string;
  owner: string | null; // from the job's last line; null renders as `—`
  runs: number; // log lines for this job
  retries: number; // lines with status `retry`
  lastStatus: RunStatus;
  lastError: string | null; // most recent `error` seen, even if later ok
  firstAt: string; // `at` exactly as logged, offset kept
  lastAt: string;
};

export type NightDigest = {
  rows: DigestRow[]; // sorted by job
  badLines: number; // lines that are not valid JSON or not a run line
};

// readNight(runsDir, night): NightDigest | null
// null: no log file for that night (or not a YYYY-MM-DD night).
// An empty file gives { rows: [], badLines: 0 }.
export { readNight } from './read.js';
