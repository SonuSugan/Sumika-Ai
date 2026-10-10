const statusEl = document.getElementById('status');
const detailEl = document.getElementById('detail');
const forgetBtn = document.getElementById('forget');

const LINES = {
  connected: ['ok', 'Connected', 'Sumika can control your tabs while its page is open.'],
  connecting: ['wait', 'Connecting...', 'A sleeping cloud backend can take up to a minute to wake.'],
  unauthorized: ['', 'Access code rejected', 'Enter the right code in the Browser control box on the Sumika page.'],
  unreachable: ['', 'Backend not reachable', 'It will keep retrying while a Sumika page is open.'],
  idle: ['', 'Waiting', 'Open the Sumika page in Chrome - the extension connects while it is open.']
};

function render(res) {
  if (!res?.ok) {
    statusEl.innerHTML = '<span class="dot"></span>Extension error';
    return;
  }
  if (!res.configured) {
    statusEl.innerHTML = '<span class="dot"></span>Not paired yet';
    detailEl.textContent = 'Open the Sumika page and use the Browser control box to pair.';
    forgetBtn.hidden = true;
    return;
  }
  const [cls, text, detail] = LINES[res.state] || LINES.idle;
  statusEl.innerHTML = `<span class="dot ${cls}"></span>${text}`;
  detailEl.textContent = `${detail} (${res.backendUrl})`;
  forgetBtn.hidden = false;
}

const ask = (type) => chrome.runtime.sendMessage({ type }).then(render, () => render(null));

forgetBtn.addEventListener('click', () => ask('unpair'));
ask('status');
