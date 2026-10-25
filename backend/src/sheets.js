import { google } from 'googleapis';
import fs from 'node:fs';

const RESULTS_SHEET_TITLE = 'Job Results';
const HEADER_ROW = ['Company', 'Job Title', 'Location', 'Date Posted', 'Job Link', 'Found At'];

let sheetsClientPromise = null;

// Auth via a service account (free) - either a JSON blob in
// GOOGLE_SERVICE_ACCOUNT_JSON (used on Render) or a key file on disk
// (used locally, see backend/secrets/google-service-account.json).
function getCredentials() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  }
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || new URL('../secrets/google-service-account.json', import.meta.url);
  return JSON.parse(fs.readFileSync(keyPath, 'utf-8'));
}

async function getSheetsClient() {
  if (!sheetsClientPromise) {
    const credentials = getCredentials();
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    sheetsClientPromise = auth.getClient().then((authClient) => google.sheets({ version: 'v4', auth: authClient }));
  }
  return sheetsClientPromise;
}

function getSheetId() {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error('GOOGLE_SHEET_ID not set');
  return id;
}

// Reads the company names Sheet1 (column A) so the target-company list lives
// in the sheet itself, not hardcoded in code.
export async function readCompanyList() {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getSheetId(),
    range: 'Sheet1!A:A'
  });
  return (res.data.values || []).flat().map((v) => String(v).trim()).filter(Boolean);
}

async function ensureResultsSheetExists(sheets, spreadsheetId) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existing = meta.data.sheets.find((s) => s.properties.title === RESULTS_SHEET_TITLE);
  if (existing) return existing.properties.sheetId;

  const addRes = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: RESULTS_SHEET_TITLE } } }] }
  });
  const newSheetId = addRes.data.replies[0].addSheet.properties.sheetId;

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${RESULTS_SHEET_TITLE}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [HEADER_ROW] }
  });

  return newSheetId;
}

// Existing links already in the results tab, so re-runs don't duplicate rows.
export async function getExistingJobLinks() {
  const sheets = await getSheetsClient();
  const spreadsheetId = getSheetId();
  await ensureResultsSheetExists(sheets, spreadsheetId);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${RESULTS_SHEET_TITLE}!E:E`
  });
  return new Set((res.data.values || []).flat());
}

// rows: [{ company, title, location, datePosted, link }]
export async function appendJobRows(rows) {
  if (!rows.length) return;
  const sheets = await getSheetsClient();
  const spreadsheetId = getSheetId();
  await ensureResultsSheetExists(sheets, spreadsheetId);

  const values = rows.map((r) => [
    r.company,
    r.title || '',
    r.location || '',
    r.datePosted || '',
    r.link,
    new Date().toISOString()
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${RESULTS_SHEET_TITLE}!A:F`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values }
  });
}
