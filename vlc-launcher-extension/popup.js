// let currentTabId = null;
// let alwaysOnTop = false, fullscreen = false, loop = false;
// let speed = '';
// let pollTimer = null, streamsFound = false, focusIdx = -1;
// const selectedFormats = new Map();

// document.addEventListener('DOMContentLoaded', async () => {
//   const tab = await getCurrentTab();
//   currentTabId = tab.id;

//   chrome.storage.local.get({ alwaysOnTop: false, fullscreen: false, loop: false, speed: '' }, (items) => {
//     alwaysOnTop = items.alwaysOnTop; fullscreen = items.fullscreen; loop = items.loop;
//     speed = items.speed;
//     document.getElementById('alwaysOnTop').checked = alwaysOnTop;
//     document.getElementById('fullscreen').checked = fullscreen;
//     document.getElementById('loop').checked = loop;
//     document.getElementById('speed').value = speed;
//   });

//   for (const id of ['alwaysOnTop','fullscreen','loop']) {
//     document.getElementById(id).addEventListener('change', (e) => {
//       if (id === 'alwaysOnTop') alwaysOnTop = e.target.checked;
//       if (id === 'fullscreen') fullscreen = e.target.checked;
//       if (id === 'loop') loop = e.target.checked;
//       chrome.storage.local.set({ alwaysOnTop, fullscreen, loop });
//     });
//   }
//   document.getElementById('speed').addEventListener('change', (e) => {
//     speed = e.target.value;
//     chrome.storage.local.set({ speed });
//   });

//   // Keyboard nav
//   document.addEventListener('keydown', (e) => {
//     const btns = document.querySelectorAll('#streamList .btn:not(.copy)');
//     if (e.key === 'ArrowDown') { e.preventDefault(); focusIdx = Math.min(focusIdx + 1, btns.length - 1); btns[focusIdx]?.focus(); }
//     if (e.key === 'ArrowUp') { e.preventDefault(); focusIdx = Math.max(focusIdx - 1, 0); btns[focusIdx]?.focus(); }
//     if (e.key === 'Enter' && document.activeElement?.classList.contains('btn')) document.activeElement.click();
//     if (e.key === 'Escape') window.close();
//   });

//   loadHistory();
//   startPolling();

//   document.getElementById('refreshBtn').addEventListener('click', () => {
//     chrome.runtime.sendMessage({ action: "clearStreams", tabId: currentTabId }, () => {
//       streamsFound = false; startPolling();
//     });
//   });
// });

// // Stop polling when popup closes
// window.addEventListener('unload', () => {
//   if (pollTimer) clearTimeout(pollTimer);
// });

// function startPolling() {
//   if (pollTimer) clearTimeout(pollTimer);
//   streamsFound = false;

//   // Show "listening" placeholder
//   const container = document.getElementById('streamList');
//   if (!streamsFound) {
//     container.innerHTML = '<p style="color:#888">Listening for streams…</p>';
//   }

//   // Polling schedule: 500ms, 1.5s, 3s, 6s, then every 8s
//   const delays = [500, 1500, 3000, 6000];
//   let attempt = 0;

//   function poll() {
//     if (!chrome.runtime?.id) return;

//     // Scan content script each time
//     chrome.tabs.sendMessage(currentTabId, { action: "scanMedia" }, () => {
//       void chrome.runtime.lastError;
//     });

//     setTimeout(() => {
//       chrome.runtime.sendMessage({ action: "getStreams", tabId: currentTabId }, (response) => {
//         if (chrome.runtime.lastError) {
//           // Service worker may be waking up — retry with next delay
//           if (attempt < delays.length) {
//             pollTimer = setTimeout(poll, delays[attempt]);
//             attempt++;
//           } else {
//             pollTimer = setTimeout(poll, 3000);
//           }
//           return;
//         }
//         const streams = response?.streams || [];
//         if (streams.length > 0) {
//           renderStreams(streams);
//           streamsFound = true;
//           attempt = 0; // reset retry counter
//           pollTimer = setTimeout(poll, 8000);
//         } else if (attempt < delays.length) {
//           pollTimer = setTimeout(poll, delays[attempt]);
//           attempt++;
//         } else {
//           if (!streamsFound) {
//             renderStreams([]);
//           }
//           pollTimer = setTimeout(poll, 8000);
//         }
//       });
//     }, 400);
//   }

//   poll();
// }

// function getCurrentTab() {
//   return new Promise((resolve) => {
//     chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
//       resolve(tabs[0]);
//     });
//   });
// }

// function isYoutubeUrl(url) {
//   return /youtube\.com\/watch|youtu\.be\//i.test(url);
// }

// function renderStreams(streams) {
//   const container = document.getElementById('streamList');
//   container.innerHTML = '';

//   if (!streams || streams.length === 0) {
//     container.innerHTML = '<p>No streams detected. Navigate to a page with audio/video.</p>';
//     return;
//   }

//   const ul = document.createElement('ul');
//   streams.forEach(s => {
//     const url = typeof s === 'string' ? s : s.url;
//     const quality = typeof s === 'string' ? null : s.quality;

//     const li = document.createElement('li');

//     const div = document.createElement('div');
//     div.style.cssText = 'display:flex;align-items:center;gap:4px;flex:1;min-width:0;';

//     const displayTitle = s.title || null;
//     const displayText = displayTitle || midTruncate(url, 26, 24);

//     const span = document.createElement('span');
//     span.className = 'url';
//     span.textContent = displayText;
//     span.title = url;
//     if (displayTitle) span.style.fontWeight = 'bold';
//     div.appendChild(span);

//     if (quality) {
//       const qLabel = document.createElement('span');
//       qLabel.className = 'quality';
//       qLabel.textContent = quality;
//       qLabel.title = quality;
//       div.appendChild(qLabel);
//     }

//     // ── Quality dropdown for YouTube ──────────────────────
//     let selectedFormat = null;
//     if (isYoutubeUrl(url)) {
//       const sel = document.createElement('select');
//       sel.className = 'fmtSelect';
//       sel.title = 'Select quality';
//       sel.innerHTML = '<option value="">Loading qualities...</option>';
//       sel.addEventListener('change', () => {
//         selectedFormat = sel.value || null;
//         selectedFormats.set(url, sel.value);
//       });
//       div.appendChild(sel);

//       // Fetch formats asynchronously
//       chrome.runtime.sendMessage({ action: "getFormats", url }, (resp) => {
//         if (chrome.runtime.lastError || !resp?.formats?.length) return;
//         sel.innerHTML = '<option value="">Best quality</option>';
//         let seenAudio = false;
//         resp.formats.forEach(f => {
//           if (f.type === 'audio') {
//             if (!seenAudio) { seenAudio = true; sel.innerHTML += '<option disabled>── Audio ──</option>'; }
//             const kbps = Math.round((f.tbr || 128) / 1000);
//             sel.innerHTML += `<option value="${f.id}">${kbps}kbps ${f.ext}</option>`;
//           } else {
//             sel.innerHTML += `<option value="${f.id}">${f.height || '?'}p ${f.ext}</option>`;
//           }
//         });        // Restore previously selected format
//         if (selectedFormats.has(url)) {
//           sel.value = selectedFormats.get(url);
//           selectedFormat = sel.value || null;
//         }      });
//     }

//     const btn = document.createElement('button');
//     btn.className = 'btn';
//     btn.textContent = 'Launch';
//     btn.addEventListener('click', function() {
//       if (this.disabled) return;
//       const origText = this.textContent;
//       this.textContent = '⏳';
//       this.disabled = true;
//       launchUrl(url, selectedFormat, () => {
//         this.textContent = origText;
//         this.disabled = false;
//       });
//     });

//     const copyBtn = document.createElement('button');
//     copyBtn.className = 'btn copy';
//     copyBtn.textContent = '📋';
//     copyBtn.title = 'Copy URL';
//     copyBtn.addEventListener('click', (e) => {
//       e.stopPropagation();
//       navigator.clipboard.writeText(url).then(() => {
//         copyBtn.textContent = '✓'; setTimeout(() => { copyBtn.textContent = '📋'; }, 1000);
//       });
//     });

//     li.appendChild(div);
//     li.appendChild(copyBtn);
//     li.appendChild(btn);
//     ul.appendChild(li);
//   });
//   container.appendChild(ul);
// }

// function launchUrl(url, format = null, onDone = null) {
//   const status = document.getElementById('status');
//   status.textContent = 'Launching...';
//   status.style.color = '#555';

//   saveToHistory(url);

//   chrome.runtime.sendMessage({ action: "launch", url, tabId: currentTabId, alwaysOnTop, fullscreen, loop, speed, format }, (response) => {
//     if (onDone) onDone();
//     if (chrome.runtime.lastError) {
//       status.textContent = '❌ Extension error: ' + chrome.runtime.lastError.message;
//       status.style.color = 'red';
//       return;
//     }
//     if (response.success) {
//       status.textContent = '✅ ' + response.message;
//       status.style.color = 'green';
//     } else {
//       status.textContent = '❌ ' + response.error;
//       status.style.color = 'red';
//     }
//   });
// }

// function showError(msg) {
//   const container = document.getElementById('streamList');
//   container.innerHTML = `<p style="color:red">${msg}</p>`;
// }

// // ── Middle-truncate URL, keeping extension visible ─────────────
// function midTruncate(url, headLen = 32, tailLen = 28) {
//   // Remove query string and hash for measuring tail (extension part)
//   const clean = url.split('?')[0].split('#')[0];
//   // Find the last segment (filename + extension)
//   const lastSlash = clean.lastIndexOf('/');
//   const filename = lastSlash >= 0 ? clean.slice(lastSlash + 1) : clean;
//   // Keep the filename visible in the tail if it fits
//   const effectiveTail = Math.max(tailLen, filename.length + 4);

//   if (url.length <= headLen + effectiveTail + 3) return url;

//   const head = url.slice(0, headLen);
//   const tail = url.slice(-effectiveTail);
//   return head + '…' + tail;
// }

// // ── Stream history ────────────────────────────────────────────
// function saveToHistory(url) {
//   chrome.storage.local.get({ history: [] }, (items) => {
//     const h = items.history.filter(u => u !== url);
//     h.unshift(url);
//     if (h.length > 20) h.pop();
//     chrome.storage.local.set({ history: h });
//     loadHistory();
//   });
// }
// function loadHistory() {
//   chrome.storage.local.get({ history: [] }, (items) => {
//     const container = document.getElementById('historyList');
//     const h = items.history || [];
//     if (!h.length) { container.innerHTML = '<p style="color:#888">No history yet</p>'; return; }
//     const ul = document.createElement('ul');
//     h.forEach(url => {
//       const li = document.createElement('li');
//       li.style.cssText = 'display:flex;gap:4px;align-items:center;';
//       const span = document.createElement('span'); span.className = 'url'; span.textContent = midTruncate(url, 30, 20); span.title = url;
//       const btn = document.createElement('button'); btn.className = 'btn small'; btn.textContent = 'Play';
//       btn.addEventListener('click', () => launchUrl(url));
//       const cp = document.createElement('button'); cp.className = 'btn copy small'; cp.textContent = '📋';
//       cp.addEventListener('click', () => { navigator.clipboard.writeText(url); cp.textContent = '✓'; setTimeout(() => cp.textContent = '📋', 1000); });
//       li.appendChild(span); li.appendChild(cp); li.appendChild(btn);
//       ul.appendChild(li);
//     });
//     container.innerHTML = ''; container.appendChild(ul);
//   });
// }
// const manualInput = document.getElementById('manualUrl');
// const manualBtn = document.getElementById('manualLaunch');
// if (manualBtn && manualInput) {
//   manualBtn.addEventListener('click', () => {
//     const url = manualInput.value.trim();
//     if (url) launchUrl(url);
//   });
//   manualInput.addEventListener('keydown', (e) => {
//     if (e.key === 'Enter') {
//       const url = manualInput.value.trim();
//       if (url) launchUrl(url);
//     }
//   });
// }



let currentTabId = null;
let alwaysOnTop = false, fullscreen = false, loop = false;
let speed = '';
let pollTimer = null;
let isPollingActive = false;
const selectedFormats = new Map();

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

  const ul = document.createElement('ul');
  streams.forEach(s => {
    const url = typeof s === 'string' ? s : s.url;
    const quality = typeof s === 'string' ? null : s.quality;

    const li = document.createElement('li');
    const div = document.createElement('div');
    div.style.cssText = 'display:flex;align-items:center;gap:6px;flex:1;min-width:0;';

    const displayTitle = s.title || null;
    const displayText = displayTitle || midTruncate(url, 24, 20);

    const span = document.createElement('span');
    span.className = 'url';
    span.textContent = displayText;
    span.title = url;
    if (displayTitle) span.style.fontWeight = 'bold';
    div.appendChild(span);

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
      status.textContent = '❌ ' + (response?.error || 'Failed to launch');
      status.style.color = 'red';
    }
  });
}

function midTruncate(url, headLen = 24, tailLen = 20) {
  if (url.length <= headLen + tailLen + 3) return url;
  return url.slice(0, headLen) + '…' + url.slice(-tailLen);
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
