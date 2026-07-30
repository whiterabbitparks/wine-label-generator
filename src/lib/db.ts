import { MongoClient, Db } from "mongodb";

/* MongoDB singleton. The client promise is cached on globalThis so Next's dev
   hot-reload reuses one connection pool instead of leaking a new one per
   recompile. Database: 8k-labels. */

const DB_NAME = "8k-labels";

declare global {
  // eslint-disable-next-line no-var
  var __mongoClientPromise: Promise<MongoClient> | undefined;
}

function getClientPromise(): Promise<MongoClient> {
  if (!globalThis.__mongoClientPromise) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is not set (put it in .env.local)");
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
    globalThis.__mongoClientPromise = client.connect();
  }
  return globalThis.__mongoClientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await getClientPromise();
  return client.db(DB_NAME);
}
