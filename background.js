// Feham — background service worker.
//
// All network access lives here on purpose. In MV3 a content script's fetch is
// subject to the *host page's* CORS/CSP rules, so looking up a word directly
// from content.js fails on any site with a strict connect-src (GitHub, Twitter,
// most news sites). The service worker gets the extension's host_permissions
// instead, so requests always go through.

const API = 'https://translate.googleapis.com/translate_a/single';
const REQUEST_TIMEOUT_MS = 8000;

const CACHE_KEY = 'lookupCache';
const CACHE_MAX_ENTRIES = 1000;
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // translations don't go stale fast

let cache = null; // Map<word, { entry, ts }>
let cacheReady = null;
let saveTimer = null;
const inflight = new Map(); // word -> Promise, so N hovers of one word = 1 request

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

function loadCache() {
  if (cacheReady) return cacheReady;
  cacheReady = chrome.storage.local
    .get(CACHE_KEY)
    .then((stored) => {
      cache = new Map();
      const raw = stored && stored[CACHE_KEY];
      if (raw && typeof raw === 'object') {
        const now = Date.now();
        for (const [word, value] of Object.entries(raw)) {
          if (value && value.entry && now - value.ts < CACHE_TTL_MS) {
            cache.set(word, value);
          }
        }
      }
      return cache;
    })
    .catch(() => (cache = new Map()));
  return cacheReady;
}

function scheduleSave() {
  if (saveTimer) return;
  // Short debounce: the worker can be torn down ~30s after going idle, and
  // anything not yet written is lost.
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (!cache) return;

    let entries = [...cache.entries()];
    if (entries.length > CACHE_MAX_ENTRIES) {
      entries.sort((a, b) => b[1].ts - a[1].ts);
      entries = entries.slice(0, CACHE_MAX_ENTRIES);
      cache = new Map(entries);
    }

    chrome.storage.local
      .set({ [CACHE_KEY]: Object.fromEntries(entries) })
      .catch(() => {});
  }, 1500);
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

// The endpoint returns a positional array, roughly:
//   [0] sentence chunks + a trailing [null,null,null,"romanization"] entry
//   [1] dictionary: [[pos, [glosses], [[gloss, [urdu back-translations], _, score]], ...]]
//   [2] detected source language
//   [5] alternative translations (dt=at)
//   [7] spelling suggestion
function parseResponse(data, word) {
  const entry = {
    word,
    translation: '',
    roman: '',
    dict: [],
    alts: [],
    suggestion: '',
    srcLang: typeof data?.[2] === 'string' ? data[2] : '',
  };

  const sentences = Array.isArray(data?.[0]) ? data[0] : [];
  entry.translation = sentences
    .filter((s) => Array.isArray(s) && typeof s[0] === 'string')
    .map((s) => s[0])
    .join('')
    .trim();

  for (const s of sentences) {
    // The romanization chunk has no translated text, only index 3.
    if (Array.isArray(s) && !s[0] && typeof s[3] === 'string' && s[3].trim()) {
      entry.roman = s[3].trim();
      break;
    }
  }

  const dict = Array.isArray(data?.[1]) ? data[1] : [];
  for (const group of dict) {
    const pos = typeof group?.[0] === 'string' ? group[0] : '';
    const terms = Array.isArray(group?.[1])
      ? group[1].filter((t) => typeof t === 'string' && t.trim())
      : [];
    const senses = (Array.isArray(group?.[2]) ? group[2] : [])
      .map((sense) => ({
        gloss: typeof sense?.[0] === 'string' ? sense[0].trim() : '',
        back: Array.isArray(sense?.[1])
          ? sense[1].filter((b) => typeof b === 'string' && b.trim())
          : [],
        score: typeof sense?.[3] === 'number' ? sense[3] : 0,
      }))
      .filter((sense) => sense.gloss);

    if (terms.length || senses.length) entry.dict.push({ pos, terms, senses });
  }

  // Alternatives are where short function words (کے, سے, میں) actually get a
  // usable reading — the top machine translation for those is often nonsense.
  const seen = new Set();
  for (const group of entry.dict) {
    for (const term of group.terms) seen.add(term.toLowerCase());
  }
  if (entry.translation) seen.add(entry.translation.toLowerCase());

  for (const chunk of Array.isArray(data?.[5]) ? data[5] : []) {
    for (const cand of Array.isArray(chunk?.[2]) ? chunk[2] : []) {
      const text = typeof cand?.[0] === 'string' ? cand[0].trim() : '';
      const key = text.toLowerCase();
      if (text && !seen.has(key)) {
        seen.add(key);
        entry.alts.push(text);
      }
    }
  }
  entry.alts = entry.alts.slice(0, 6);

  if (Array.isArray(data?.[7]) && typeof data[7][1] === 'string') {
    entry.suggestion = data[7][1].trim();
  }

  entry.empty = !entry.translation && !entry.dict.length && !entry.alts.length;
  entry.primary = pickPrimary(entry);

  // Drop alternatives that only differ from something we already show by an
  // article ("love" / "the love") — they add noise, not meaning.
  const shown = new Set(
    [entry.primary, entry.translation, ...entry.dict.flatMap((g) => g.terms)].map(normalizeGloss)
  );
  entry.alts = entry.alts.filter((alt) => !shown.has(normalizeGloss(alt))).slice(0, 6);

  return entry;
}

const normalizeGloss = (text) =>
  String(text || '')
    .toLowerCase()
    .replace(/^(the|an|a)\s+/, '')
    .trim();

// The headline gloss. Raw machine translation of a bare noun tends to come back
// with an article ("The book", "The water"), and for particles like کے it comes
// back transliterated ("K") rather than translated — in both cases the
// dictionary or the alternatives list has the better answer.
function pickPrimary(entry) {
  const mt = (entry.translation || '').replace(/^(the|an|a)\s+/i, '').trim();
  const dictTerm = entry.dict[0]?.terms?.[0] || '';
  const weak = !mt || mt.length <= 2 || !/[a-z]/i.test(mt);
  if (weak) return dictTerm || entry.alts[0] || mt;
  return mt;
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

async function fetchWord(word) {
  const params = new URLSearchParams({ client: 'gtx', sl: 'ur', tl: 'en', q: word });
  // t = translation, bd = dictionary, rm = romanization, at = alternatives
  const url = `${API}?${params}&dt=t&dt=bd&dt=rm&dt=at`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, { signal: controller.signal, credentials: 'omit' });
  } catch (err) {
    if (err && err.name === 'AbortError') throw new Error('Lookup timed out');
    throw new Error('Network error — check your connection');
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 429) {
    throw new Error('Too many lookups — Google is rate limiting, wait a moment');
  }
  if (!response.ok) {
    throw new Error(`Translation service error (${response.status})`);
  }

  return parseResponse(await response.json(), word);
}

async function lookup(rawWord) {
  const word = String(rawWord || '').normalize('NFC').trim();
  if (!word) return { ok: false, error: 'No word given' };
  if (word.length > 60) return { ok: false, error: 'Selection too long' };

  await loadCache();

  const hit = cache.get(word);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
    return { ok: true, entry: hit.entry, cached: true };
  }

  if (inflight.has(word)) return inflight.get(word);

  const pending = fetchWord(word)
    .then((entry) => {
      cache.set(word, { entry, ts: Date.now() });
      scheduleSave();
      return { ok: true, entry, cached: false };
    })
    .catch((err) => ({ ok: false, error: err?.message || 'Lookup failed' }))
    .finally(() => inflight.delete(word));

  inflight.set(word, pending);
  return pending;
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'feham:lookup') {
    lookup(message.word).then(sendResponse);
    return true; // keep the channel open for the async response
  }
  if (message?.type === 'feham:clearCache') {
    cache = new Map();
    chrome.storage.local.remove(CACHE_KEY).then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});

async function updateBadge() {
  const { enabled } = await chrome.storage.sync.get('enabled');
  const off = enabled === false;
  await chrome.action.setBadgeText({ text: off ? 'off' : '' });
  await chrome.action.setBadgeBackgroundColor({ color: '#94a3b8' });
}

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.sync.get(['enabled', 'requireShift']);
  const defaults = {};
  if (typeof current.enabled !== 'boolean') defaults.enabled = true;
  if (typeof current.requireShift !== 'boolean') defaults.requireShift = false;
  if (Object.keys(defaults).length) await chrome.storage.sync.set(defaults);
  updateBadge();
});

chrome.runtime.onStartup.addListener(updateBadge);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.enabled) updateBadge();
});
