import { createRelayApp } from './app.js';
import { D1DatabaseAdapter } from './db/d1.js';

interface Env {
  DB: D1Database;
}

const app = createRelayApp((c: any) => {
  const env = c.env as Env;
  return new D1DatabaseAdapter(env.DB);
});

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const db = new D1DatabaseAdapter(env.DB);
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const pruned = await db.pruneOldEvents(thirtyDaysAgo);
    console.log(`[Cron Prune] Cleaned ${pruned} events older than 30 days.`);
  }
};
