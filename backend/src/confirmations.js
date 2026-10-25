// "Final" clicks (Submit, Send, Place order, Delete...) need the user's explicit
// yes. The yes has to come from the user's own message - never from the model
// and never from text on a web page - so it is recognised here, in code, from
// what the user actually said, and bound to the one button that was asked about.
const TTL_MS = 3 * 60 * 1000;
const pending = new Map(); // session key -> { label, url, approved, at }

const AFFIRM = /^\s*(yes|yeah|yep|yup|sure|ok|okay|confirm|confirmed|go ahead|do it|proceed|please do|go for it|absolutely)\b/i;
const DENY = /^\s*(no|nope|nah|cancel|stop|don't|do not|never ?mind|abort|wait)\b/i;
const SHORT = (text) => text.trim().split(/\s+/).length <= 8;

const live = (p) => p && Date.now() - p.at < TTL_MS;

export function requestConfirmation(key, { label, url }) {
  pending.set(key, { label, url, approved: false, at: Date.now() });
}

// Called with every incoming user message. Returns what the message did to a
// pending confirmation, so the agent can tell the model.
export function interpretReply(key, text) {
  const p = pending.get(key);
  if (!live(p)) {
    pending.delete(key);
    return null;
  }
  if (!SHORT(text)) return null;
  if (DENY.test(text)) {
    pending.delete(key);
    return { denied: true, label: p.label };
  }
  if (AFFIRM.test(text)) {
    p.approved = true;
    return { approved: true, label: p.label };
  }
  return null;
}

// One use only, and only for the button that was asked about.
export function consumeApproval(key) {
  const p = pending.get(key);
  if (!live(p) || !p.approved) return null;
  pending.delete(key);
  return p.label;
}
