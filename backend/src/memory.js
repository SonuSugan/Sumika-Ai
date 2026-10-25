import { getDb } from './db.js';

// What Sumika has been taught: short facts about the user ("my address is...",
// "I prefer window seats") and named routines ("morning routine": do A, B, C).
// One document in the user's own database. Without MongoDB configured (a plain
// local run) it falls back to memory that lasts until the process restarts.
const ID = 'me';
const MAX_FACTS = 60;
const MAX_ROUTINES = 30;

let fallback = { facts: [], routines: {}, updatedAt: null };

async function read() {
  try {
    const db = await getDb();
    const doc = await db.collection('memory').findOne({ _id: ID });
    return { facts: doc?.facts || [], routines: doc?.routines || {}, updatedAt: doc?.updatedAt || null };
  } catch {
    return fallback;
  }
}

async function write(state) {
  const next = { ...state, updatedAt: new Date() };
  try {
    const db = await getDb();
    await db.collection('memory').updateOne({ _id: ID }, { $set: next }, { upsert: true });
  } catch {
    fallback = next;
  }
}

// Never keep secrets, even when asked: this text is replayed into every prompt.
const SECRET = /\b(password|passcode|passwd|cvv|cvc|otp|one[- ]time (?:code|password)|atm pin|card pin|credit card|debit card|card number|ssn|social security|aadhaar|passport number)\b|\b\d{12,19}\b/i;

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

export async function rememberFact(text) {
  const fact = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 240);
  if (!fact) return { ok: false, message: 'Nothing to remember - say what to remember.' };
  if (SECRET.test(fact)) return { ok: false, message: "I don't store passwords, card numbers or ID numbers - those you keep." };
  const state = await read();
  if (state.facts.some((f) => norm(f) === norm(fact))) return { ok: true, message: 'I already had that.' };
  const facts = [...state.facts, fact].slice(-MAX_FACTS);
  await write({ ...state, facts });
  return { ok: true, message: `Remembered: ${fact}` };
}

export async function forgetFacts(match) {
  const want = norm(match);
  if (!want) return { ok: false, message: 'Say what to forget.' };
  const state = await read();
  const facts = state.facts.filter((f) => !norm(f).includes(want));
  const removed = state.facts.length - facts.length;
  if (!removed) return { ok: false, message: `I don't have anything about "${match}".` };
  await write({ ...state, facts });
  return { ok: true, message: `Forgot ${removed} thing${removed > 1 ? 's' : ''} about "${match}".` };
}

export async function listFacts() {
  const { facts } = await read();
  return { ok: true, message: facts.length ? facts.map((f) => `- ${f}`).join('\n') : "I don't have anything saved about you yet." };
}

export async function saveRoutine(name, steps) {
  const key = norm(name);
  const body = String(steps || '').trim().slice(0, 1200);
  if (!key || !body) return { ok: false, message: 'A routine needs a name and the steps to do.' };
  const state = await read();
  if (!state.routines[key] && Object.keys(state.routines).length >= MAX_ROUTINES) return { ok: false, message: 'That is the most routines I can keep - delete one first.' };
  await write({ ...state, routines: { ...state.routines, [key]: body } });
  return { ok: true, message: `Saved the routine "${key}".` };
}

function findRoutineKey(routines, name) {
  const want = norm(name);
  const keys = Object.keys(routines);
  return keys.find((k) => k === want) || keys.find((k) => k.includes(want) || want.includes(k));
}

export async function getRoutine(name) {
  const { routines } = await read();
  const key = findRoutineKey(routines, name);
  return key ? { key, steps: routines[key] } : null;
}

export async function deleteRoutine(name) {
  const state = await read();
  const key = findRoutineKey(state.routines, name);
  if (!key) return { ok: false, message: `I don't have a routine called "${name}".` };
  const { [key]: _gone, ...routines } = state.routines;
  await write({ ...state, routines });
  return { ok: true, message: `Deleted the routine "${key}".` };
}

export async function listRoutines() {
  const { routines } = await read();
  const names = Object.keys(routines);
  return { ok: true, message: names.length ? names.map((n) => `- ${n}: ${routines[n]}`).join('\n') : 'No routines saved yet.' };
}

// What goes into the system prompt: small and capped, since free-tier models
// limit tokens per minute and this rides along on every call.
export async function memoryForPrompt() {
  const { facts, routines, updatedAt } = await read();
  return { facts: facts.slice(-30), routineNames: Object.keys(routines), stamp: updatedAt ? String(updatedAt) : 'none' };
}
