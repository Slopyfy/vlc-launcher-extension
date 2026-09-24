// background.js — VLC Launcher service worker

// ── In-memory state (loaded from session storage on startup) ───
const state = { netUrls: new Map(), domUrls: new Map(), qualities: new Map(), titles: new Map(), formats: new Map(), referers: new Map(), userAgent: null, seenAt: new Map() };

(async function init() {
  try {
    const all = await chrome.storage.session.get(['netUrls', 'domUrls', 'qualities', 'titles', 'formats', 'referers', 'userAgent', 'seenAt']);
    if (all.netUrls) state.netUrls = new Map(JSON.parse(all.netUrls));
    if (all.domUrls) state.domUrls = new Map(JSON.parse(all.domUrls));
    if (all.qualities) state.qualities = new Map(JSON.parse(all.qualities));
    if (all.titles) state.titles = new Map(JSON.parse(all.titles));
    if (all.formats) state.formats = new Map(JSON.parse(all.formats));
    if (all.referers) state.referers = new Map(JSON.parse(all.referers));
    if (all.userAgent) state.userAgent = all.userAgent;
    if (all.seenAt) state.seenAt = new Map(JSON.parse(all.seenAt));
  } catch {}
})();

function persist() {
  chrome.storage.session.set({
    netUrls: JSON.stringify([...state.netUrls].map(([k,v]) => [k, [...v]])),
    domUrls: JSON.stringify([...state.domUrls].map(([k,v]) => [k, [...v]])),
    qualities: JSON.stringify([...state.qualities]),
    titles: JSON.stringify([...state.titles]),
    formats: JSON.stringify([...state.formats]),
    referers: JSON.stringify([...state.referers]),
    userAgent: state.userAgent,
    seenAt: JSON.stringify([...state.seenAt])
  }).catch(() => {});
}

let _persistTimer;
function schedulePersist() {
  clearTimeout(_persistTimer);
  _persistTimer = setTimeout(persist, 600);
}

// ── Quality probe: try to parse m3u8 manifest for resolution/bandwidth ──
async function probeQuality(url) {
  if (state.qualities.has(url)) return;
  const lower = url.toLowerCase();
  const isHls = lower.includes('.m3u8') || lower.includes('.mpegurl');
  if (!isHls) return;

  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(8000),
      headers: { 'Accept': 'application/vnd.apple.mpegurl,*/*' }
    });
    if (!res.ok) return;
    const text = await res.text();

    // Parse EXT-X-STREAM-INF for BANDWIDTH and RESOLUTION (master playlist)
    const lines = text.split('\n');
    let bestRes = '', bestBw = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#EXT-X-STREAM-INF')) {
        const bwMatch = trimmed.match(/BANDWIDTH=(\d+)/);
        const resMatch = trimmed.match(/RESOLUTION=(\d+x\d+)/);
        const bw = bwMatch ? parseInt(bwMatch[1]) : 0;
        if (bw > bestBw) {
          bestBw = bw;
          if (resMatch) bestRes = resMatch[1];
        }
      }
    }

    if (bestRes) {
      const parts = bestRes.split('x');
      if (parts.length === 2) { state.qualities.set(url, parts[1] + 'p'); schedulePersist(); }
    } else if (bestBw > 0) {
      if (bestBw >= 5000000) { state.qualities.set(url, Math.round(bestBw / 1000000) + ' Mbps'); schedulePersist(); }
      else { state.qualities.set(url, Math.round(bestBw / 1000) + ' kbps'); schedulePersist(); }
    }
    // If no STREAM-INF found, it's a direct playlist — quality stays null (extension shown as fallback)
  } catch {
    // Silently fail — quality is optional, CORS may block the fetch
  }
}

// ── Context menu: right-click any link/video → Play in VLC ────
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'playInVlc',
    title: 'Play in VLC',
    contexts: ['link', 'video', 'audio', 'page']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  let url = info.linkUrl || info.srcUrl || info.pageUrl;
  if (url && tab?.id) {
    const referer = state.referers.get(url) || info.pageUrl || null;
    fetch('http://localhost:8765/launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, alwaysOnTop: false, fullscreen: false, loop: false, referer, userAgent: state.userAgent })
    }).catch(() => {});
  }
});

// ── Badge: update icon counter when streams change ────────────
function updateBadge(tabId) {
  const net = state.netUrls.has(tabId) ? state.netUrls.get(tabId).size : 0;
  const dom = state.domUrls.has(tabId) ? state.domUrls.get(tabId).size : 0;
  const total = Math.min(net + dom, 99);
  if (total > 0) {
    chrome.action.setBadgeText({ text: String(total), tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#4CAF50', tabId });
  } else {
    chrome.action.setBadgeText({ text: '', tabId });
  }
}

// ── Network detection: catch streaming URLs via webRequest ─────
const STREAM_URL_PATTERNS = [
  // Video streaming manifests
  "*://*/*.m3u8",
  "*://*/*.mpd",
  "*://*/*.m3u",
  "*://*/*.ism/Manifest",
  "*://*/*.mpegurl",
  // Video manifests with a query string (e.g. ?token=...)
  "*://*/*.m3u8?*",
  "*://*/*.mpd?*",
  "*://*/*.m3u?*",
  "*://*/*.ism/Manifest?*",
  "*://*/*.mpegurl?*",
  // Audio files
  "*://*/*.mp3",
  "*://*/*.wav",
  "*://*/*.flac",
  "*://*/*.aac",
  "*://*/*.ogg",
  "*://*/*.m4a",
  "*://*/*.opus",
  "*://*/*.wma",
  "*://*/*.aiff",
  // With query params
  "*://*/*.mp3?*",
  "*://*/*.wav?*",
  "*://*/*.flac?*",
  "*://*/*.aac?*",
  "*://*/*.ogg?*",
  "*://*/*.m4a?*",
  "*://*/*.opus?*",
  "*://*/*.wma?*"
];

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    const url = details.url;
    const tabId = details.tabId;
    if (tabId > 0) {
      // Skip blob URLs — they only work inside the browser
      if (url.startsWith('blob:')) return;
      if (!state.netUrls.has(tabId)) {
        state.netUrls.set(tabId, new Set());
      }
      const set = state.netUrls.get(tabId);
      if (!set.has(url)) {
        set.add(url);
        state.seenAt.set(url, Date.now()); // first-seen time (newest first in list)
      }
      updateBadge(tabId);
      schedulePersist();
      probeQuality(url);
    }
  },
  // No "types" filter: catch every request whose URL looks like a stream,
  // including sub_frame/object requests from iframes or embedded players.
  { urls: STREAM_URL_PATTERNS }
);

// Capture the Referer + User-Agent the browser sends with each stream request
// so we can replay them in VLC. Many CDNs reject VLC's default User-Agent
// and/or require a Referer — which is why IDM can grab the same URL but VLC fails.
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    const tabId = details.tabId;
    if (tabId <= 0) return;
    const headers = details.requestHeaders || [];
    let referer = null;
    for (const h of headers) {
      const name = (h.name || '').toLowerCase();
      if (name === 'referer' && h.value) referer = h.value;
      else if (name === 'user-agent' && h.value) state.userAgent = h.value;
    }
    if (referer) {
      state.referers.set(details.url, referer);
      schedulePersist();
    }
  },
  { urls: STREAM_URL_PATTERNS },
  ["requestHeaders", "extraHeaders"]
);

// ── Pre-probe YouTube etc. via C# service (yt-dlp) ─────────────
function isVideoPlatformUrl(url) {
  const platforms = ['youtube.com', 'youtu.be', 'vimeo.com', 'dailymotion.com',
                     'twitch.tv', 'soundcloud.com', 'bilibili.com'];
  const lower = url.toLowerCase();
  return platforms.some(p => lower.includes(p));
}

const probedUrls = new Set();
function probeYtDlp(url) {
  // Only probe once per URL per session — the popup re-scans every few
  // seconds and without this each scan would spawn another yt-dlp process.
  if (probedUrls.has(url)) return;
  probedUrls.add(url);
  fetch('http://localhost:8765/probe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  }).catch(() => {});
}

const formatFetches = new Map();

// Single shared promise per URL so polling never spawns duplicate requests.
function fetchFormats(url) {
  if (state.formats.has(url)) return Promise.resolve(state.formats.get(url));
  if (!formatFetches.has(url)) {
    const p = fetch(`http://localhost:8765/formats?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(30000)
    })
      .then(r => r.json())
      .then(f => {
        const arr = Array.isArray(f) ? f : [];
        if (arr.length) state.formats.set(url, arr);
        return arr;
      })
      .catch(() => [])
      .finally(() => formatFetches.delete(url));
    formatFetches.set(url, p);
  }
  return formatFetches.get(url);
}

function prefetchFormats(url) {
  fetchFormats(url);
}

// ── Message handlers ──────────────────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // --- getStreams: return merged URLs for a tab (deduplicated) ---
  if (request.action === "getStreams") {
    const tabId = request.tabId;
    const net = state.netUrls.has(tabId) ? Array.from(state.netUrls.get(tabId)) : [];
    const dom = state.domUrls.has(tabId) ? Array.from(state.domUrls.get(tabId)) : [];
    // Merge and deduplicate
    const seen = new Set(net);
    dom.forEach(u => seen.add(u));
    // Return objects with quality info (fallback: show file extension)
    const streams = Array.from(seen).map(url => {
      let quality = state.qualities.get(url) || null;
      if (!quality) {
        // Fallback: extract file extension for non-HLS streams
        const m = url.match(/\.([a-z0-9]+)(?:[?#]|$)/i);
        if (m) quality = m[1].toUpperCase();
        // If it looks like HLS, kick off a probe for next time
        if (url.toLowerCase().includes('.m3u8')) probeQuality(url);
      }
      return { url, quality, title: state.titles.get(url) || null, seenAt: state.seenAt.get(url) || 0 };
    });
    // Newest-detected streams first so a freshly loaded video's links
    // (which may look nearly identical to old ones) appear on top.
    streams.sort((a, b) => (b.seenAt || 0) - (a.seenAt || 0));
    sendResponse({ streams });
    return false; // sync
  }

  // --- clearStreams: wipe stored URLs for a tab ---
  if (request.action === "clearStreams") {
    const tabId = request.tabId;
    state.netUrls.delete(tabId);
    state.domUrls.delete(tabId);
    updateBadge(tabId);
    schedulePersist();
    sendResponse({ cleared: true });
    return false; // sync
  }

  // --- addStreams: content script reports current visible media URLs ---
  // Replaces previous DOM URLs for this tab (no accumulation of hidden players)
  if (request.action === "addStreams") {
    const tabId = sender.tab?.id;
    if (tabId && request.urls) {
      state.domUrls.set(tabId, new Set(request.urls));
      updateBadge(tabId);
      // Record first-seen time so the popup can show newest links first.
      const now = Date.now();
      for (const u of request.urls) {
        if (!state.seenAt.has(u)) state.seenAt.set(u, now);
      }
      // Store display titles (e.g. YouTube video titles)
      if (request.titles) {
        for (const [u, t] of Object.entries(request.titles)) {
          if (t) state.titles.set(u, t);
        }
      }
      schedulePersist();
      // Pre-probe YouTube etc. so the stream URL is cached before user clicks Launch
      for (const u of request.urls) {
        if (isVideoPlatformUrl(u)) { probeYtDlp(u); prefetchFormats(u); }
      }
    }
    sendResponse({ received: true });
    return false; // sync
  }

  // --- getFormats: list available quality options for a video platform URL ---
  if (request.action === "getFormats") {
    const pageUrl = request.url;
    if (!pageUrl) { sendResponse({ formats: [] }); return false; }

    // Shared in-flight fetch (deduped + 30s timeout) so the popup's repeated
    // polling can't pile up yt-dlp processes or hang the Launch button forever.
    fetchFormats(pageUrl).then(formats => sendResponse({ formats }));
    return true; // async
  }

  // --- launch: send URL to local VLC service ---
  if (request.action === "launch") {
    const url = request.url;
    const tabId = request.tabId;
    const alwaysOnTop = request.alwaysOnTop || false;
    const fullscreen = request.fullscreen || false;
    const loop = request.loop || false;
    const speed = request.speed || '';
    const format = request.format || null;
    const referer = request.referer || state.referers.get(url) || null;
    const userAgent = request.userAgent || state.userAgent || null;
    if (!url) {
      sendResponse({ success: false, error: "No URL provided." });
      return false;
    }
    fetch("http://localhost:8765/launch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, alwaysOnTop, fullscreen, loop, speed, format, referer, userAgent }),
      signal: AbortSignal.timeout(60000)
    })
      .then(async (res) => {
        const body = await res.text();
        if (res.ok) {
          // Pause the matching media element in the browser
          if (tabId) {
            chrome.tabs.sendMessage(tabId, { action: "pauseMedia", url }, () => {
              void chrome.runtime.lastError; // ignore if content script not loaded
            });
          }
          // Try to parse JSON for a nicer message
          try {
            const json = JSON.parse(body);
            sendResponse({ success: true, message: json.message || body });
          } catch {
            sendResponse({ success: true, message: body });
          }
        } else {
          // Try to extract error from JSON response
          try {
            const errJson = JSON.parse(body);
            throw new Error(errJson.error || `HTTP ${res.status}`);
          } catch (e) {
            throw new Error(`Service error (${res.status}): ${body}`);
          }
        }
      })
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // async
  }
});

// ── Cleanup ───────────────────────────────────────────────────
// Clear streams when tab navigates to a new page
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    state.netUrls.delete(tabId);
    state.domUrls.delete(tabId);
    updateBadge(tabId);
    schedulePersist();
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  state.netUrls.delete(tabId);
  state.domUrls.delete(tabId);
});

// When the user switches back to a tab, re-scan its media elements so
// dynamically loaded / iframe players get picked up without a full reload.
chrome.tabs.onActivated.addListener(({ tabId }) => {
  if (tabId == null) return;
  chrome.tabs.sendMessage(tabId, { action: "scanMedia" }, () => {
    void chrome.runtime.lastError; // content script may not be injected yet
  });
});
