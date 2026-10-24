import { serve } from '@hono/node-server';
import { createRelayApp } from './app.js';
import { SqliteDatabase } from './db/sqlite.js';

const port = parseInt(process.env.PORT || '8080', 10);
const dbPath = process.env.DB_PATH || './sync.db';

console.log(`[Puki Relay] Initializing SQLite database at: ${dbPath}`);
const db = new SqliteDatabase(dbPath);

const app = createRelayApp(() => db);

// Daily prune task for standalone container (run every 24 hours)
setInterval(async () => {
  try {
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const pruned = await db.pruneOldEvents(thirtyDaysAgo);
    if (pruned > 0) {
      console.log(`[Cron Prune] Cleaned ${pruned} events older than 30 days.`);
    }
  } catch (err) {
    console.error('[Cron Prune] Error during cleanup:', err);
  }
}, 24 * 60 * 60 * 1000);

console.log(`[Puki Relay] Server listening on port ${port}...`);
serve({
  fetch: app.fetch,
  port
});
