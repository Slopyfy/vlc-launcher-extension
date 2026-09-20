

let currentTabId = null;
let alwaysOnTop = false, fullscreen = false, loop = false;
let speed = '';
let pollTimer = null;
let isPollingActive = false;
const selectedFormats = new Map();

const SERVICE_SETUP_URL = 'https://github.com/Slopyfy/vlc-launcher-extension/releases/';

function isServiceMissing(err) {
  return /failed to fetch|networkerror|fetch failed|connection refused|load failed|ERR_CONNECTION/i.test(String(err));
}

function showServiceBanner() {
  if (document.getElementById('serviceBanner')) return;
  const banner = document.createElement('div');
  banner.id = 'serviceBanner';
  banner.style.cssText = 'background:#3a1d00;color:#ffb877;border:1px solid #ff9800;border-radius:6px;padding:8px 10px;margin-bottom:10px;font-size:12px;line-height:1.5;';
  banner.innerHTML = '⚠️ <b>VLC Launcher Service</b> isn\'t running.<br>Download & install it from the ' +
    '<a href="' + SERVICE_SETUP_URL + '" target="_blank" style="color:#ffb877;font-weight:700;">releases page</a>';
  const ref = document.getElementById('refreshBtn');
  if (ref) ref.parentNode.insertBefore(banner, ref);
}

function checkService() {
  fetch('http://localhost:8765/health', { signal: AbortSignal.timeout(3000) })
    .then(r => { if (r.ok) { const b = document.getElementById('serviceBanner'); if (b) b.remove(); } })
    .catch(() => showServiceBanner());
}

document.addEventListener('DOMContentLoaded', async () => {
  const tab = await getCurrentTab();
  if (!tab) return;
  currentTabId = tab.id;

  chrome.storage.local.get({ alwaysOnTop: false, fullscreen: false, loop: false, speed: '' }, (items) => {
    alwaysOnTop = items.alwaysOnTop;
    fullscreen = items.fullscreen;
    loop = items.loop;
    speed = items.speed;
    document.getElementById('alwaysOnTop').checked = alwaysOnTop;
    document.getElementById('fullscreen').checked = fullscreen;
    document.getElementById('loop').checked = loop;
    document.getElementById('speed').value = speed;
  });

  for (const id of ['alwaysOnTop', 'fullscreen', 'loop']) {
    document.getElementById(id).addEventListener('change', (e) => {
      if (id === 'alwaysOnTop') alwaysOnTop = e.target.checked;
      if (id === 'fullscreen') fullscreen = e.target.checked;
      if (id === 'loop') loop = e.target.checked;
      chrome.storage.local.set({ alwaysOnTop, fullscreen, loop });
    });
  }

  document.getElementById('speed').addEventListener('change', (e) => {
    speed = e.target.value;
    chrome.storage.local.set({ speed });
  });

  loadHistory();
  checkService();
  startPolling();

  document.getElementById('refreshBtn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: "clearStreams", tabId: currentTabId }, () => {
      stopPolling();
      startPolling();
    });
  });
});

window.addEventListener('unload', () => {
  stopPolling();
});

function stopPolling() {
  isPollingActive = false;
  if (pollTimer) clearTimeout(pollTimer);
}

function startPolling() {
  stopPolling();
  isPollingActive = true;

  const container = document.getElementById('streamList');
  container.innerHTML = '<p style="color:#888">Listening for streams…</p>';

  let attempt = 0;
  const delays = [500, 1500, 3000, 6000];

  function tick() {
    if (!isPollingActive || !chrome.runtime?.id) return;

    chrome.tabs.sendMessage(currentTabId, { action: "scanMedia" }, () => {
      void chrome.runtime.lastError;
    });

    chrome.runtime.sendMessage({ action: "getStreams", tabId: currentTabId }, (response) => {
      if (!isPollingActive) return;

      const streams = response?.streams || [];
      if (streams.length > 0) {
        renderStreams(streams);
        pollTimer = setTimeout(tick, 8000);
      } else if (attempt < delays.length) {
        pollTimer = setTimeout(tick, delays[attempt++]);
      } else {
        renderStreams([]);
        pollTimer = setTimeout(tick, 8000);
      }
    });
  }

  tick();
}

function getCurrentTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs ? tabs[0] : null);
    });
  });
}

function isYoutubeUrl(url) {
  return /youtube\.com\/watch|youtu\.be\//i.test(url);
}

function renderStreams(streams) {
  const container = document.getElementById('streamList');
  container.innerHTML = '';

  if (!streams || streams.length === 0) {
    container.innerHTML = '<p>No streams detected. Navigate to a page with audio/video.</p>';
    return;
  }

  // Newest-detected first, so a freshly loaded video's links appear on top
  // even when the page reuses nearly identical signed URLs.
  const ordered = [...streams].sort((a, b) => {
    const sa = (typeof a === 'object' && a.seenAt) ? a.seenAt : 0;
    const sb = (typeof b === 'object' && b.seenAt) ? b.seenAt : 0;
    return sb - sa;
  });

  const now = Date.now();
  const ul = document.createElement('ul');
  ordered.forEach(s => {
    const url = typeof s === 'string' ? s : s.url;
    const quality = typeof s === 'string' ? null : s.quality;
    const seenAt = (typeof s === 'object' && s.seenAt) ? s.seenAt : 0;

    const li = document.createElement('li');
    const div = document.createElement('div');
    div.style.cssText = 'display:flex;align-items:center;gap:6px;flex:1;min-width:0;';

    const isMaster = url.toLowerCase().includes('master.m3u8');
    const snippet = tokenSnippet(url);
    let displayText;
    if (s.title) {
      displayText = s.title;
    } else if (isMaster) {
      displayText = 'Master — auto quality' + (snippet ? ' · ' + snippet : '');
    } else {
      displayText = smartTruncate(url);
    }

    const span = document.createElement('span');
    span.className = 'url';
    span.textContent = displayText;
    span.title = url;
    if (s.title || isMaster) span.style.fontWeight = 'bold';
    div.appendChild(span);

    // Recency marker so old vs new links are easy to tell apart.
    const age = ageLabel(seenAt, now);
    if (age) {
      const ageSpan = document.createElement('span');
      ageSpan.textContent = age;
      ageSpan.style.cssText = (age === 'NEW')
        ? 'background:#ff9800;color:#111;font-size:9px;font-weight:700;padding:1px 5px;border-radius:8px;flex:0 0 auto;'
        : 'color:#888;font-size:10px;flex:0 0 auto;';
      div.appendChild(ageSpan);
    }

    if (quality) {
      const qLabel = document.createElement('span');
      qLabel.className = 'quality';
      qLabel.textContent = quality;
      div.appendChild(qLabel);
    }

    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = 'Launch';

    let selectedFormat = null;

    // Handle YouTube formats safely
    if (isYoutubeUrl(url)) {
      btn.disabled = true; // Disable Launch until formats load
      btn.textContent = 'Loading...';

      const sel = document.createElement('select');
      sel.className = 'fmtSelect';
      sel.title = 'Select quality';
      sel.innerHTML = '<option value="" disabled selected>Loading...</option>';
      
      sel.addEventListener('change', () => {
        selectedFormat = sel.value || null;
        selectedFormats.set(url, sel.value);
      });
      div.appendChild(sel);

      chrome.runtime.sendMessage({ action: "getFormats", url }, (resp) => {
        btn.disabled = false;
        btn.textContent = 'Launch';

        if (chrome.runtime.lastError || !resp?.formats?.length) {
          sel.innerHTML = '<option value="">Best quality</option>';
          return;
        }

        sel.innerHTML = '<option value="">Best quality</option>';
        let seenAudio = false;

        resp.formats.forEach(f => {
          if (f.type === 'audio') {
            if (!seenAudio) {
              seenAudio = true;
              const optGroup = document.createElement('option');
              optGroup.disabled = true;
              optGroup.textContent = '── Audio ──';
              sel.appendChild(optGroup);
            }
            const opt = document.createElement('option');
            opt.value = f.id;
            opt.textContent = `${Math.round(f.tbr || 128)}kbps (${f.ext})`;
            sel.appendChild(opt);
          } else {
            const opt = document.createElement('option');
            opt.value = f.id;
            opt.textContent = `${f.height || '?'}p (${f.ext})`;
            sel.appendChild(opt);
          }
        });

        if (selectedFormats.has(url)) {
          sel.value = selectedFormats.get(url);
          selectedFormat = sel.value || null;
        }
      });
    }

    btn.addEventListener('click', function() {
      if (this.disabled) return;
      const origText = this.textContent;
      this.textContent = '⏳';
      this.disabled = true;
      launchUrl(url, selectedFormat, () => {
        this.textContent = origText;
        this.disabled = false;
      });
    });

    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn copy';
    copyBtn.textContent = '📋';
    copyBtn.title = 'Copy URL';
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(url).then(() => {
        copyBtn.textContent = '✓';
        setTimeout(() => { copyBtn.textContent = '📋'; }, 1000);
      });
    });

    li.appendChild(div);
    li.appendChild(copyBtn);
    li.appendChild(btn);
    ul.appendChild(li);
  });
  container.appendChild(ul);
}

function launchUrl(url, format = null, onDone = null) {
  const status = document.getElementById('status');
  status.textContent = 'Launching VLC...';
  status.style.color = '#555';

  saveToHistory(url);

  chrome.runtime.sendMessage({
    action: "launch",
    url,
    tabId: currentTabId,
    alwaysOnTop,
    fullscreen,
    loop,
    speed,
    format
  }, (response) => {
    if (onDone) onDone();
    if (chrome.runtime.lastError) {
      status.textContent = '❌ Extension error: ' + chrome.runtime.lastError.message;
      status.style.color = 'red';
      return;
    }
    if (response?.success) {
      status.textContent = '✅ ' + response.message;
      status.style.color = 'green';
    } else {
      const err = response?.error || 'Failed to launch';
      status.style.color = 'red';
      if (isServiceMissing(err)) {
        status.innerHTML = '❌ ' + err + '<br>Is the VLC Launcher Service running? ' +
          '<a href="' + SERVICE_SETUP_URL + '" target="_blank">Download it from the releases page</a>';
      } else {
        status.textContent = '❌ ' + err;
      }
    }
  });
}

function midTruncate(url, headLen = 24, tailLen = 20) {
  if (url.length <= headLen + tailLen + 3) return url;
  return url.slice(0, headLen) + '…' + url.slice(-tailLen);
}

function tokenSnippet(url) {
  try {
    const u = new URL(url);
    const segs = u.pathname.split('/').filter(Boolean);
    let longest = '';
    for (const s of segs) { if (s.length > longest.length) longest = s; }
    if (longest.length >= 16) return longest.slice(0, 8);
  } catch (e) {}
  return null;
}

function smartTruncate(url) {
  // Reveal the middle of the URL (where signed tokens usually live) so links
  // that only differ by their token don't all look identical in the list.
  try {
    const u = new URL(url);
    const segs = u.pathname.split('/').filter(Boolean);
    if (segs.length >= 3) {
      let longest = '', li = -1;
      segs.forEach((s, i) => { if (s.length > longest.length) { longest = s; li = i; } });
      if (longest.length >= 20) {
        const left = segs.slice(0, li).join('/');
        const right = segs.slice(li + 1).join('/');
        return u.host + '/' + left + '/' + longest.slice(0, 12) + '…/' + right;
      }
    }
  } catch (e) {}
  return midTruncate(url, 26, 16);
}

function ageLabel(ts, now) {
  if (!ts) return '';
  const s = Math.floor((now - ts) / 1000);
  if (s < 15) return 'NEW';
  if (s < 60) return s + 's';
  if (s < 3600) return Math.floor(s / 60) + 'm';
  return Math.floor(s / 3600) + 'h';
}

function saveToHistory(url) {
  chrome.storage.local.get({ history: [] }, (items) => {
    const h = items.history.filter(u => u !== url);
    h.unshift(url);
    if (h.length > 20) h.pop();
    chrome.storage.local.set({ history: h });
    loadHistory();
  });
}

function loadHistory() {
  chrome.storage.local.get({ history: [] }, (items) => {
    const container = document.getElementById('historyList');
    const h = items.history || [];
    if (!h.length) { container.innerHTML = '<p style="color:#888">No history yet</p>'; return; }
    const ul = document.createElement('ul');
    h.forEach(url => {
      const li = document.createElement('li');
      li.style.cssText = 'display:flex;gap:4px;align-items:center;';
      const span = document.createElement('span'); 
      span.className = 'url'; 
      span.textContent = midTruncate(url, 26, 16); 
      span.title = url;

      const btn = document.createElement('button'); 
      btn.className = 'btn small'; 
      btn.textContent = 'Play';
      btn.addEventListener('click', () => launchUrl(url));

      const cp = document.createElement('button'); 
      cp.className = 'btn copy small'; 
      cp.textContent = '📋';
      cp.addEventListener('click', () => { 
        navigator.clipboard.writeText(url); 
        cp.textContent = '✓'; 
        setTimeout(() => cp.textContent = '📋', 1000); 
      });

      li.appendChild(span); 
      li.appendChild(cp); 
      li.appendChild(btn);
      ul.appendChild(li);
    });
    container.innerHTML = ''; 
    container.appendChild(ul);
  });
}

const manualInput = document.getElementById('manualUrl');
const manualBtn = document.getElementById('manualLaunch');
if (manualBtn && manualInput) {
  manualBtn.addEventListener('click', () => {
    const url = manualInput.value.trim();
    if (url) launchUrl(url);
  });
  manualInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const url = manualInput.value.trim();
      if (url) launchUrl(url);
    }
  });
}
