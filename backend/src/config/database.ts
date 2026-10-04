import { MongoClient, type Db } from 'mongodb';

let client: MongoClient | null = null;
let database: Db | null = null;

function getDatabase(): Db {
  if (database === null) {
    throw new Error('MongoDB has not been connected. Call connectDatabase() during startup.');
  }
  return database;
}

async function connectDatabase() {
  if (database !== null) return database;
  const uri = process.env.DATABASE_URL || 'mongodb://localhost:27017';
  const dbName = process.env.DATABASE_NAME || 'stocklens';
  const nextClient = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  await nextClient.connect();
  const nextDatabase = nextClient.db(dbName);
  await nextDatabase.command({ ping: 1 });
  client = nextClient;
  database = nextDatabase;
  return nextDatabase;
}

async function closeDatabase() {
  if (client !== null) {
    await client.close();
    client = null;
    database = null;
  }
}

export default getDatabase;
export { connectDatabase, closeDatabase };
