import getDb from '../src/config/database.js';
import { logger } from '../src/utils/logger.js';

async function migrate() {
  const db = getDb() as any;

  await db.collection('daily_price_rows').createIndex({ dataset_id: 1 });
  await db.collection('users').createIndex({ email: 1 }, { unique: true });
  await db.collection('sessions').createIndex({ token: 1 }, { unique: true });
  await db.collection('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await db.collection('counters').updateOne(
    { _id: 'dataset_id' },
    { $setOnInsert: { seq: 0 } },
    { upsert: true }
  );

  logger.info('MongoDB indexes and counters initialized successfully');
}

migrate().catch((err: unknown) => {
  logger.error('Migration failed', err);
  process.exit(1);
});
