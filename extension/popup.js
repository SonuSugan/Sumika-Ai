fetch('http://localhost:5175/api/extension-status')
  .then((r) => r.json())
  .then(({ connected }) => {
    const el = document.getElementById('status');
    el.innerHTML = connected
      ? '<span class="dot ok"></span>Connected to Sumika'
      : '<span class="dot bad"></span>Backend running, not connected yet';
  })
  .catch(() => {
    document.getElementById('status').innerHTML = '<span class="dot bad"></span>Backend not reachable';
  });
