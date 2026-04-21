import { MongoClient, type Db } from "mongodb";

const MONGODB_URL = process.env.MONGODB_URL;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || "job_outreach";

type MongoGlobal = typeof globalThis & {
  _dashboardMongoClientPromise?: Promise<MongoClient>;
};

const globalForMongo = globalThis as MongoGlobal;

if (!MONGODB_URL) {
  throw new Error("MONGODB_URL is not configured for dashboard fallback");
}

const clientPromise =
  globalForMongo._dashboardMongoClientPromise ??
  new MongoClient(MONGODB_URL).connect();

globalForMongo._dashboardMongoClientPromise = clientPromise;

export async function getMongoDb(): Promise<Db> {
  const client = await clientPromise;
  return client.db(MONGODB_DB_NAME);
}
