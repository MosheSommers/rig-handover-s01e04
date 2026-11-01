import { Hono } from 'hono';
import { loadConfig, type RigConfig } from './config.js';
import { readNight } from './digest/types.js';
import { lane } from './lane.js';
import { readStatus } from './status.js';
import { Layout } from './views/layout.js';
import { DigestPage, NoRunLog } from './views/digest.js';
import { StatusBoard } from './views/status.js';

export function createApp(config: RigConfig = loadConfig()) {
  const app = new Hono();

  // The one readNight call: the page and the JSON share it (ADR 0001).
  const digestFor = (night: string) => readNight(config.runsDir, night);

  app.get('/health', (c) => c.json({ ok: true, lane: lane().id }));

  app.get('/', (c) =>
    c.html(
      <Layout title="status" lane={lane()}>
        <StatusBoard status={readStatus(config)} />
      </Layout>,
    ),
  );

  app.get('/digest/:night', (c) => {
    const night = c.req.param('night');
    const digest = digestFor(night);
    if (!digest) {
      return c.html(
        <Layout title={`digest · ${night}`} lane={lane()}>
          <NoRunLog night={night} />
        </Layout>,
        404,
      );
    }
    return c.html(
      <Layout title={`digest · ${night}`} lane={lane()}>
        <DigestPage night={night} digest={digest} />
      </Layout>,
    );
  });

  app.get('/api/digest/:night', (c) => {
    const night = c.req.param('night');
    const digest = digestFor(night);
    if (!digest) return c.json({ error: `no run log for ${night}` }, 404);
    return c.json({ night, rows: digest.rows, badLines: digest.badLines });
  });

  return app;
}
