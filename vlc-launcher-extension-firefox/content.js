// content.js – finds active media elements and reports their src

// Guard: bail out if extension context was invalidated (e.g. after reload)
if (!chrome.runtime?.id) {
  console.debug('VLC Launcher: extension context invalidated, skipping injection.');
} else {

  function isVisible(el) {
    if (!el.offsetParent && el.offsetWidth === 0 && el.offsetHeight === 0) return false;
    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }

  function safeSend(msg) {
    try {
      if (chrome.runtime?.id) chrome.runtime.sendMessage(msg);
    } catch { /* context gone */ }
  }

  function isValidUrl(url) {
    // Filter out blob URLs (can't be played outside the browser)
    if (!url || url.startsWith('blob:')) return false;
    return true;
  }

  function scanMediaSources() {
    const mediaElements = document.querySelectorAll('video, audio');
    const sources = new Set();
    mediaElements.forEach(el => {
      if (!isVisible(el) && el.paused && !el.src) return;
      if (el.src && isValidUrl(el.src)) sources.add(el.src);
      el.querySelectorAll('source').forEach(src => {
        if (src.src && isValidUrl(src.src)) sources.add(src.src);
      });
    });

    // On YouTube, also report the page URL with the video title
    const titles = {};
    if (location.hostname.includes('youtube.com') && location.pathname === '/watch') {
      sources.add(location.href);
      titles[location.href] = document.title.replace(' - YouTube', '').trim();
    }

    if (sources.size > 0) {
      safeSend({ action: "addStreams", urls: Array.from(sources), titles });
    }
  }

  // Run on page load
  scanMediaSources();

  // Watch for dynamically added media elements (debounced)
  if (document.body) {
    let debounceTimer = null;
    const observer = new MutationObserver(() => {
      if (!chrome.runtime?.id) { observer.disconnect(); return; }
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => scanMediaSources(), 500);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Listen for messages from background/popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (!chrome.runtime?.id) return;

    if (request.action === "scanMedia") {
      scanMediaSources();
      sendResponse({ done: true });
    }

    if (request.action === "pauseMedia") {
      const targetUrl = request.url;
      if (targetUrl) {
        document.querySelectorAll('video, audio').forEach(el => {
          if (el.src === targetUrl) el.pause();
          el.querySelectorAll('source').forEach(src => {
            if (src.src === targetUrl) el.pause();
          });
        });
      }
      sendResponse({ paused: true });
    }
    return true; // keep channel open for async
  });

} // end context guard

