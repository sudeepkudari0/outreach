import { MongoClient, type Db } from "mongodb";

const MONGODB_URL = process.env.MONGODB_URL;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME;

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
  const dbNames = getCandidateDbNames();
  return client.db(dbNames[0]);
}

export async function getMongoCandidateDbs(): Promise<Db[]> {
  const client = await clientPromise;
  return getCandidateDbNames().map((name) => client.db(name));
}

function getCandidateDbNames(): string[] {
  const fromUrl = getDbNameFromMongoUrl();
  const candidates = [
    MONGODB_DB_NAME,
    fromUrl,
    "job_outreach",
    "outreach",
  ].filter((name): name is string => Boolean(name && name.trim()));

  return [...new Set(candidates)];
}

function getDbNameFromMongoUrl(): string | null {
  if (!MONGODB_URL) return null;

  try {
    const parsed = new URL(MONGODB_URL);
    const path = parsed.pathname.replace(/^\/+/, "");
    if (!path) return null;
    const dbName = path.split("/")[0]?.trim();
    return dbName || null;
  } catch {
    return null;
  }
}
