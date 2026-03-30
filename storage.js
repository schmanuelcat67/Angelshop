import fs from "fs";
import path from "path";
import { MongoClient } from "mongodb";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : __dirname;
const STATE_COLLECTION_NAME = process.env.MONGO_COLLECTION || "nekobot_state";

const KEY_TO_FILE = {
  drinks: "drinks.json",
  achievements: "achievements.json",
  command_usage: "command_usage.json",
  fish_inventory: "fish_inventory.json",
  currency: "currency.json",
  user_map: "user_map.json",
};

let initPromise = null;
let mongoClient = null;
let stateCollection = null;
let storageInfo = { mode: "file", location: DATA_DIR };

function cloneValue(value) {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value));
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function getStateFilePath(key) {
  const fileName = KEY_TO_FILE[key] || `${key}.json`;
  return path.join(DATA_DIR, fileName);
}

function readJsonFile(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    return cloneValue(fallback);
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    console.error(`Failed to parse ${filePath}:`, error.message);
    return cloneValue(fallback);
  }
}

function writeJsonFile(filePath, value) {
  ensureDataDir();
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function resolveMongoUri() {
  const directCandidates = [
    process.env.MONGODB_URI,
    process.env.MONGODB_URL,
    process.env.MONGO_URL,
    process.env.MONGO_PUBLIC_URL,
    process.env.MONGO_PRIVATE_URL,
    process.env.DATABASE_URL,
  ];

  for (const candidate of directCandidates) {
    if (candidate && candidate.startsWith("mongodb")) {
      return candidate;
    }
  }

  const host = process.env.MONGOHOST || process.env.MONGODB_HOST;
  const port = process.env.MONGOPORT || process.env.MONGODB_PORT || "27017";
  const database = process.env.MONGODATABASE || process.env.MONGODB_DATABASE || process.env.MONGO_DB_NAME || "admin";
  const username = process.env.MONGOUSER || process.env.MONGODB_USER;
  const password = process.env.MONGOPASSWORD || process.env.MONGODB_PASSWORD;

  if (host && username && password) {
    return `mongodb://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}/${database}?authSource=admin`;
  }

  if (host) {
    return `mongodb://${host}:${port}/${database}`;
  }

  return "";
}

async function ensureMongoReady() {
  if (stateCollection) {
    return stateCollection;
  }

  const mongoUri = resolveMongoUri();
  if (!mongoUri) {
    return null;
  }

  mongoClient = new MongoClient(mongoUri, {
    serverSelectionTimeoutMS: 5000,
  });

  await mongoClient.connect();

  const dbName = process.env.MONGO_DB_NAME || process.env.MONGODB_DATABASE || process.env.MONGODATABASE;
  const db = dbName ? mongoClient.db(dbName) : mongoClient.db();
  stateCollection = db.collection(STATE_COLLECTION_NAME);

  storageInfo = {
    mode: "mongo",
    location: `${db.databaseName}/${STATE_COLLECTION_NAME}`,
  };

  console.log(`🗄️ Persistent storage: MongoDB (${storageInfo.location})`);
  return stateCollection;
}

async function ensureStateFile(key, fallback = {}) {
  const filePath = getStateFilePath(key);
  const localValue = readJsonFile(filePath, undefined);
  let resolvedValue = localValue ?? cloneValue(fallback) ?? {};

  if (stateCollection) {
    const doc = await stateCollection.findOne({ _id: key });

    if (doc?.value !== undefined) {
      resolvedValue = doc.value;
    } else {
      await stateCollection.updateOne(
        { _id: key },
        {
          $set: {
            value: resolvedValue,
            updatedAt: new Date(),
          },
        },
        { upsert: true }
      );
    }
  }

  writeJsonFile(filePath, resolvedValue);
  return resolvedValue;
}

export async function initPersistentCache(defaults = {}) {
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    ensureDataDir();

    try {
      await ensureMongoReady();
    } catch (error) {
      storageInfo = { mode: "file", location: DATA_DIR };
      stateCollection = null;
      console.error("MongoDB connection failed, falling back to JSON files:", error.message);
    }

    const entries = Object.entries(defaults);
    for (const [key, fallback] of entries) {
      await ensureStateFile(key, fallback);
    }

    if (!entries.length) {
      for (const key of Object.keys(KEY_TO_FILE)) {
        await ensureStateFile(key, {});
      }
    }

    return storageInfo;
  })();

  return initPromise;
}

export function syncState(key, value) {
  const filePath = getStateFilePath(key);
  writeJsonFile(filePath, value);

  void (initPromise || Promise.resolve(storageInfo)).then(async () => {
    if (!stateCollection) {
      return;
    }

    await stateCollection.updateOne(
      { _id: key },
      {
        $set: {
          value,
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );
  }).catch((error) => {
    console.error(`Failed to sync ${key} to persistent storage:`, error.message);
  });
}

export function getDataDir() {
  ensureDataDir();
  return DATA_DIR;
}

export function getStorageInfo() {
  return { ...storageInfo };
}
