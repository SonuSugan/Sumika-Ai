import { rememberFact, forgetFacts, listFacts, saveRoutine, getRoutine, deleteRoutine, listRoutines } from '../memory.js';

// Things the user can teach Sumika, plus small everyday abilities that need no
// browser at all.

export async function memoryTool({ action, text }) {
  if (action === 'remember') return rememberFact(text);
  if (action === 'forget') return forgetFacts(text);
  if (action === 'list') return listFacts();
  return { ok: false, message: 'action must be remember, forget or list.' };
}

export async function routineTool({ action, name, steps }) {
  if (action === 'save') return saveRoutine(name, steps);
  if (action === 'delete') return deleteRoutine(name);
  if (action === 'list') return listRoutines();
  if (action === 'run') {
    const routine = await getRoutine(name);
    if (!routine) return { ok: false, message: `I don't have a routine called "${name}". Ask the user to teach it to you.` };
    // The steps are plain language: the model carries them out with its normal tools.
    return { ok: true, message: `Routine "${routine.key}". Do these now, in order, then tell the user how it went:\n${routine.steps}` };
  }
  return { ok: false, message: 'action must be save, run, list or delete.' };
}

export async function getTime(_args, ctx = {}) {
  const zone = ctx.tz && /^[A-Za-z_]+\/[A-Za-z_+\-0-9/]+$|^UTC$/.test(ctx.tz) ? ctx.tz : undefined;
  const now = new Date();
  try {
    const text = new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeStyle: 'short', timeZone: zone }).format(now);
    return { ok: true, message: `It is ${text}${zone ? ` (${zone})` : ' (server time)'}.` };
  } catch {
    return { ok: true, message: `It is ${now.toISOString()} (UTC).` };
  }
}

// The timer runs in the user's open Sumika page (like open_url, it is a client
// action): the backend on a free host can sleep and would lose it.
export async function setTimer({ seconds, label }) {
  const s = Math.round(Number(seconds));
  if (!Number.isFinite(s) || s < 1 || s > 6 * 3600) return { ok: false, message: 'Give a time between 1 second and 6 hours.' };
  const what = String(label || 'Timer').slice(0, 80);
  return { ok: true, message: `Timer set for ${s >= 120 ? `${Math.round(s / 60)} minutes` : `${s} seconds`}: ${what}. It will sound while Sumika's page is open.`, clientAction: { type: 'set_timer', seconds: s, label: what } };
}
