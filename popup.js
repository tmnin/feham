// Feham — popup.
//
// The popup only writes settings to chrome.storage.sync. Content scripts pick
// the change up via chrome.storage.onChanged, which reaches every open tab and
// every frame — no "tabs" permission, and no errors when a tab has no content
// script (chrome:// pages, the Web Store, PDFs).

const switches = {
  enabled: { node: document.getElementById('enabled'), fallback: true },
  requireShift: { node: document.getElementById('requireShift'), fallback: false },
};

function paint(key, value) {
  switches[key].node.setAttribute('aria-checked', String(value));
}

chrome.storage.sync.get(['enabled', 'requireShift'], (stored) => {
  for (const [key, { fallback }] of Object.entries(switches)) {
    const value = typeof stored[key] === 'boolean' ? stored[key] : fallback;
    paint(key, value);
  }
});

for (const [key, { node }] of Object.entries(switches)) {
  node.addEventListener('click', () => {
    const next = node.getAttribute('aria-checked') !== 'true';
    paint(key, next);
    chrome.storage.sync.set({ [key]: next });
  });
}

// --- font picker -----------------------------------------------------------

const fontOptions = [...document.querySelectorAll('.font-opt')];

function paintFont(font) {
  for (const option of fontOptions) {
    option.setAttribute('aria-checked', String(option.dataset.font === font));
  }
}

chrome.storage.sync.get('font', ({ font }) => {
  paintFont(font === 'naskh' ? 'naskh' : 'nastaliq');
});

for (const option of fontOptions) {
  option.addEventListener('click', () => {
    paintFont(option.dataset.font);
    chrome.storage.sync.set({ font: option.dataset.font });
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  for (const key of Object.keys(switches)) {
    if (changes[key]) paint(key, changes[key].newValue !== false);
  }
  if (changes.font) paintFont(changes.font.newValue === 'naskh' ? 'naskh' : 'nastaliq');
});

const clearButton = document.getElementById('clearCache');
clearButton.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'feham:clearCache' }, () => {
    void chrome.runtime.lastError; // the worker may have been asleep; harmless
    clearButton.textContent = 'Cache cleared';
    setTimeout(() => {
      clearButton.textContent = 'Clear cached translations';
    }, 1400);
  });
});
