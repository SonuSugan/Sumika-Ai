import { getDb } from './db.js';

const PROFILE_ID = 'me';

// Single-user app - one profile document holds contact info + full resume
// text, which both the form-autofill tool and the LLM (for drafting answers
// to open-ended application questions) read from.
export async function getProfile() {
  const db = await getDb();
  const doc = await db.collection('profile').findOne({ _id: PROFILE_ID });
  return doc || null;
}

export async function saveProfile(fields) {
  const db = await getDb();
  await db.collection('profile').updateOne(
    { _id: PROFILE_ID },
    { $set: { ...fields, updatedAt: new Date() } },
    { upsert: true }
  );
  return getProfile();
}

// Pulls common contact details out of raw resume text with simple pattern
// matching - good enough to pre-fill name/email/phone/links on a form.
export function extractContactInfo(text) {
  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] || null;
  const phone = text.match(/(\+?\d[\d\s-]{8,14}\d)/)?.[0]?.replace(/\s+/g, ' ').trim() || null;
  const linkedin = text.match(/(https?:\/\/)?(www\.)?linkedin\.com\/\S+/i)?.[0] || null;
  const github = text.match(/(https?:\/\/)?(www\.)?github\.com\/\S+/i)?.[0] || null;
  const name = text.split('\n').map((l) => l.trim()).find(Boolean) || null;

  return { name, email, phone, linkedin, github };
}

export async function saveResume({ text, filename }) {
  const contact = extractContactInfo(text);
  return saveProfile({
    resumeText: text,
    resumeFilename: filename,
    ...contact
  });
}
