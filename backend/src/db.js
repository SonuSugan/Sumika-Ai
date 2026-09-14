import { MongoClient } from 'mongodb';

let clientPromise = null;

// Single shared connection, lazily created on first use so the server can
// still boot (and other tools still work) even if MONGODB_URI isn't set yet.
function getClient() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not set - add it to backend/.env (see .env.example)');
  if (!clientPromise) {
    const client = new MongoClient(uri);
    clientPromise = client.connect();
  }
  return clientPromise;
}

export async function getDb() {
  const client = await getClient();
  return client.db(process.env.MONGODB_DB || 'sumika');
}
