// Feham — hover-to-translate Urdu content script.
//
// Design notes:
//  * All UI lives inside a shadow root so page CSS can't restyle it and our CSS
//    can't leak into the page.
//  * The word highlight is drawn as overlay rectangles, never by wrapping the
//    text in a <span>. The old version called range.surroundContents() on every
//    hover, which mutates the page DOM — that breaks React/Vue re-renders, kills
//    the user's own selection, and can loop on mousemove.
//  * Network calls go through the service worker (see background.js).

(() => {
  if (window.__fehamInjected) return;
  window.__fehamInjected = true;

  const HOVER_DELAY_MS = 130;
  const MAX_WORD_LEN = 40;

  const settings = { enabled: true, requireShift: false };

  let host = null;
  let shadow = null;
  let tooltip = null;
  let highlightLayer = null;
  let detailLayer = null;

  let listening = false;
  let hoverTimer = null;
  let requestId = 0;
  let currentWord = '';
  let currentEntry = null;
  let lastPointer = { x: 0, y: 0 };

  // -------------------------------------------------------------------------
  // Urdu text helpers
  // -------------------------------------------------------------------------

  // Arabic-script blocks used by Urdu. ZWNJ/ZWJ (200C/200D) are word characters
  // here because they appear *inside* Urdu words, not between them.
  const ARABIC_SCRIPT =
    /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿‌‍]/;
  // Punctuation that should terminate a word: ، ؛ ؟ ۔ ٪ etc.
  const ARABIC_PUNCT =
    /[؀-؅،-؏؛؞؟٪-٭۔۝۞۩۽۾]/;
  // Letters only — used to decide "is this actually a word worth looking up",
  // so bare digits or stray diacritics don't trigger a lookup.
  const ARABIC_LETTER =
    /[ؠ-يٮ-ۓەۥۦۮۯۺ-ۼۿݐ-ݿࢠ-ࢿﭐ-﷿ﹰ-﻿]/;

  const isWordChar = (ch) => ARABIC_SCRIPT.test(ch) && !ARABIC_PUNCT.test(ch);
  const hasUrduLetter = (text) => ARABIC_LETTER.test(text);

  function isEditable(node) {
    if (!node) return false;
    const tag = node.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    return typeof node.closest === 'function' && !!node.closest('[contenteditable=""], [contenteditable="true"]');
  }

  // -------------------------------------------------------------------------
  // Finding the word under the cursor
  // -------------------------------------------------------------------------

  function caretAt(x, y) {
    if (document.caretRangeFromPoint) {
      const range = document.caretRangeFromPoint(x, y);
      if (range) return { node: range.startContainer, offset: range.startOffset };
    }
    if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(x, y);
      if (pos) return { node: pos.offsetNode, offset: pos.offset };
    }
    return null;
  }

  function wordAtPoint(x, y) {
    const caret = caretAt(x, y);
    if (!caret || !caret.node || caret.node.nodeType !== Node.TEXT_NODE) return null;

    const textNode = caret.node;
    const text = textNode.textContent || '';
    if (!text.trim()) return null;

    // The caret snaps to the nearest position, so it can land just past the end
    // of a word. Prefer the character under the cursor, then the one before it.
    let index = Math.min(caret.offset, text.length - 1);
    if (!isWordChar(text.charAt(index)) && caret.offset > 0 && isWordChar(text.charAt(caret.offset - 1))) {
      index = caret.offset - 1;
    }
    if (index < 0 || !isWordChar(text.charAt(index))) return null;

    let start = index;
    while (start > 0 && isWordChar(text.charAt(start - 1))) start--;
    let end = index + 1;
    while (end < text.length && isWordChar(text.charAt(end))) end++;

    const word = text.slice(start, end).trim();
    if (!word || word.length > MAX_WORD_LEN || !hasUrduLetter(word)) return null;

    const range = document.createRange();
    range.setStart(textNode, start);
    range.setEnd(textNode, end);

    // caretRangeFromPoint returns a position even when the pointer is in the
    // page margin next to the text, so confirm we're really over the glyphs.
    const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
    const over = rects.some((r) => x >= r.left - 2 && x <= r.right + 2 && y >= r.top - 2 && y <= r.bottom + 2);
    if (!over) return null;

    return { word, rects };
  }

  // -------------------------------------------------------------------------
  // Shadow-root UI
  // -------------------------------------------------------------------------

  function ensureUI() {
    if (host && host.isConnected) return;

    host = document.createElement('feham-root');
    host.style.cssText = 'all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647;';
    shadow = host.attachShadow({ mode: 'open' });

    let fontUrl = '';
    try {
      fontUrl = chrome.runtime.getURL('fonts/NotoNastaliqUrdu.woff2');
    } catch (_) {
      /* extension context gone; fall back to system fonts */
    }

    const style = document.createElement('style');
    style.textContent = `
      ${fontUrl ? `@font-face {
        font-family: 'Feham Nastaliq';
        src: url('${fontUrl}') format('woff2');
        font-display: swap;
      }` : ''}

      :host { all: initial; }
      * { box-sizing: border-box; margin: 0; padding: 0; }

      .layer { position: fixed; inset: 0; pointer-events: none; }

      .rect {
        position: fixed;
        background: rgba(251, 191, 36, 0.28);
        border-bottom: 2px solid rgba(217, 119, 6, 0.85);
        border-radius: 3px;
        pointer-events: none;
      }

      .card {
        position: fixed;
        max-width: 340px;
        min-width: 190px;
        background: #ffffff;
        color: #1e293b;
        border: 1px solid #e2e8f0;
        border-top: 3px solid #f59e0b;
        border-radius: 10px;
        padding: 12px 14px;
        font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
        box-shadow: 0 10px 30px rgba(15, 23, 42, 0.18);
        pointer-events: none;
        opacity: 0;
        transition: opacity .12s ease;
      }
      .card.visible { opacity: 1; }

      .urdu {
        font-family: 'Feham Nastaliq', 'Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', serif;
        direction: rtl;
        text-align: right;
        line-height: 2.1;
      }

      .head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
      .word { font-size: 21px; color: #b45309; font-weight: 600; }
      .roman { font-size: 11px; color: #64748b; font-style: italic; white-space: nowrap; }

      .main { font-size: 15px; font-weight: 600; color: #0f172a; margin-top: 4px; }
      .status { font-size: 12px; color: #64748b; margin-top: 4px; }
      .error { font-size: 12px; color: #b91c1c; margin-top: 4px; }

      .senses { margin-top: 8px; display: grid; gap: 4px; }
      .sense { font-size: 12px; color: #334155; }
      .pos {
        display: inline-block;
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: .5px;
        color: #92400e;
        background: #fef3c7;
        border-radius: 4px;
        padding: 1px 5px;
        margin-inline-end: 6px;
      }
      .alts { margin-top: 8px; font-size: 12px; color: #475569; }
      .alts b { color: #64748b; font-weight: 600; }

      .foot {
        margin-top: 10px;
        padding-top: 7px;
        border-top: 1px solid #f1f5f9;
        font-size: 10px;
        color: #94a3b8;
        text-align: center;
      }
      .foot.ok { color: #059669; font-weight: 600; }

      .backdrop {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.45);
        pointer-events: auto;
      }
      .detail {
        position: fixed;
        top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        width: min(420px, calc(100vw - 40px));
        max-height: calc(100vh - 60px);
        overflow-y: auto;
        background: #ffffff;
        color: #1e293b;
        border-radius: 14px;
        border-top: 4px solid #f59e0b;
        padding: 22px;
        font: 14px/1.6 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
        box-shadow: 0 24px 60px rgba(15, 23, 42, .35);
        pointer-events: auto;
      }
      .detail .word { font-size: 30px; display: block; text-align: center; }
      .detail .roman { display: block; text-align: center; margin-top: 2px; }
      .detail .main { text-align: center; font-size: 17px; margin-top: 6px; }
      .group { margin-top: 16px; padding-top: 14px; border-top: 1px solid #f1f5f9; }
      .group h4 { font-size: 11px; text-transform: uppercase; letter-spacing: .6px; color: #92400e; margin-bottom: 6px; }
      .row { display: flex; justify-content: space-between; gap: 12px; padding: 3px 0; font-size: 13px; }
      .row .back { color: #059669; font-size: 15px; }
      .close {
        margin-top: 18px;
        width: 100%;
        padding: 9px;
        border: 0;
        border-radius: 8px;
        background: #f59e0b;
        color: #fff;
        font: 600 13px/1 inherit;
        cursor: pointer;
      }
      .close:hover { background: #d97706; }

      @media (prefers-reduced-motion: reduce) {
        .card { transition: none; }
      }
    `;

    highlightLayer = document.createElement('div');
    highlightLayer.className = 'layer';

    detailLayer = document.createElement('div');
    detailLayer.className = 'layer';
    detailLayer.style.display = 'none';

    tooltip = document.createElement('div');
    tooltip.className = 'card';
    tooltip.style.display = 'none';

    shadow.append(style, highlightLayer, tooltip, detailLayer);
    (document.body || document.documentElement).appendChild(host);
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text; // never innerHTML: this is page-controlled text
    return node;
  }

  // -------------------------------------------------------------------------
  // Highlight
  // -------------------------------------------------------------------------

  function drawHighlight(rects) {
    clearHighlight();
    for (const r of rects) {
      const box = el('div', 'rect');
      box.style.left = `${r.left}px`;
      box.style.top = `${r.top}px`;
      box.style.width = `${r.width}px`;
      box.style.height = `${r.height}px`;
      highlightLayer.appendChild(box);
    }
  }

  function clearHighlight() {
    if (highlightLayer) highlightLayer.replaceChildren();
  }

  // -------------------------------------------------------------------------
  // Tooltip
  // -------------------------------------------------------------------------

  function renderTooltip(word, entry, state) {
    if (!tooltip) return; // a late response after teardown
    tooltip.replaceChildren();

    const head = el('div', 'head');
    head.append(el('span', 'word urdu', word));
    if (entry?.roman) head.append(el('span', 'roman', entry.roman));
    tooltip.append(head);

    if (state === 'loading') {
      tooltip.append(el('div', 'status', 'Looking up…'));
    } else if (state === 'error') {
      tooltip.append(el('div', 'error', entry));
    } else if (entry) {
      const primary = entry.primary || entry.translation;
      if (primary) tooltip.append(el('div', 'main', primary));

      if (entry.empty) tooltip.append(el('div', 'status', 'No translation found'));

      if (entry.dict.length) {
        const senses = el('div', 'senses');
        for (const group of entry.dict.slice(0, 4)) {
          const line = el('div', 'sense');
          if (group.pos) line.append(el('span', 'pos', group.pos));
          line.append(document.createTextNode(group.terms.slice(0, 5).join(', ')));
          senses.append(line);
        }
        tooltip.append(senses);
      }

      if (entry.alts.length) {
        const alts = el('div', 'alts');
        alts.append(el('b', null, 'also: '));
        alts.append(document.createTextNode(entry.alts.slice(0, 4).join(' · ')));
        tooltip.append(alts);
      }
    }

    const foot = el('div', 'foot', "C copy · K details · Esc close");
    tooltip.append(foot);
  }

  function positionTooltip() {
    if (!tooltip) return;
    const margin = 12;
    tooltip.style.left = '0px';
    tooltip.style.top = '0px';
    tooltip.style.display = 'block';

    const rect = tooltip.getBoundingClientRect();
    let left = lastPointer.x + 16;
    let top = lastPointer.y + 20;

    if (left + rect.width > window.innerWidth - margin) left = lastPointer.x - rect.width - 16;
    if (left < margin) left = margin;
    if (top + rect.height > window.innerHeight - margin) top = lastPointer.y - rect.height - 16;
    if (top < margin) top = margin;

    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(top)}px`;
    tooltip.classList.add('visible');
  }

  function hideTooltip() {
    if (tooltip) {
      tooltip.style.display = 'none';
      tooltip.classList.remove('visible');
    }
    clearHighlight();
    currentWord = '';
    currentEntry = null;
    requestId++; // invalidate any in-flight response
  }

  // -------------------------------------------------------------------------
  // Detail panel
  // -------------------------------------------------------------------------

  function showDetail() {
    if (!currentEntry || !currentWord) return;

    detailLayer.replaceChildren();
    detailLayer.style.display = 'block';

    const backdrop = el('div', 'backdrop');
    backdrop.addEventListener('click', hideDetail);

    const panel = el('div', 'detail');
    panel.append(el('span', 'word urdu', currentWord));
    if (currentEntry.roman) panel.append(el('span', 'roman', currentEntry.roman));
    const headline = currentEntry.primary || currentEntry.translation;
    if (headline) panel.append(el('div', 'main', headline));

    for (const group of currentEntry.dict) {
      const section = el('div', 'group');
      section.append(el('h4', null, group.pos || 'meanings'));
      const senses = group.senses.length
        ? group.senses
        : group.terms.map((term) => ({ gloss: term, back: [] }));
      for (const sense of senses) {
        const row = el('div', 'row');
        row.append(el('span', null, sense.gloss));
        if (sense.back.length) row.append(el('span', 'back urdu', sense.back.join('، ')));
        section.append(row);
      }
      panel.append(section);
    }

    if (currentEntry.alts.length) {
      const section = el('div', 'group');
      section.append(el('h4', null, 'other renderings'));
      for (const alt of currentEntry.alts) section.append(el('div', 'row', alt));
      panel.append(section);
    }

    if (currentEntry.suggestion) {
      const section = el('div', 'group');
      section.append(el('h4', null, 'did you mean'));
      section.append(el('div', 'row urdu', currentEntry.suggestion));
      panel.append(section);
    }

    const close = el('button', 'close', 'Close');
    close.addEventListener('click', hideDetail);
    panel.append(close);

    detailLayer.append(backdrop, panel);
  }

  function hideDetail() {
    if (!detailLayer) return;
    detailLayer.replaceChildren();
    detailLayer.style.display = 'none';
  }

  const detailOpen = () => detailLayer && detailLayer.style.display === 'block';

  // -------------------------------------------------------------------------
  // Lookup
  // -------------------------------------------------------------------------

  function lookup(word) {
    const id = ++requestId;
    let response;
    try {
      response = chrome.runtime.sendMessage({ type: 'feham:lookup', word });
    } catch (err) {
      teardownIfOrphaned(err);
      return;
    }

    Promise.resolve(response)
      .then((result) => {
        if (id !== requestId || currentWord !== word) return; // user moved on
        if (!result) {
          renderTooltip(word, 'No response from the extension — try reloading it', 'error');
          positionTooltip();
          return;
        }
        if (result.ok) {
          currentEntry = result.entry;
          renderTooltip(word, result.entry, 'ready');
        } else {
          currentEntry = null;
          renderTooltip(word, result.error || 'Lookup failed', 'error');
        }
        positionTooltip();
      })
      .catch((err) => {
        if (teardownIfOrphaned(err)) return;
        if (id !== requestId) return;
        renderTooltip(word, 'Lookup failed', 'error');
        positionTooltip();
      });
  }

  // A reloaded/updated extension leaves this script running with a dead port.
  // Detect that and remove ourselves instead of throwing on every hover.
  function teardownIfOrphaned(err) {
    const message = String(err?.message || err || '');
    if (message.includes('Extension context invalidated') || !chrome.runtime?.id) {
      disable();
      host?.remove();
      host = null;
      return true;
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------

  function onMouseMove(event) {
    lastPointer = { x: event.clientX, y: event.clientY };
    if (detailOpen()) return;

    // Don't fight the user while they're dragging out a selection.
    if (event.buttons !== 0) return;
    if (settings.requireShift && !event.shiftKey) {
      if (currentWord) hideTooltip();
      return;
    }

    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => processHover(event.clientX, event.clientY), HOVER_DELAY_MS);
  }

  function processHover(x, y) {
    let found = null;
    try {
      found = wordAtPoint(x, y);
    } catch (_) {
      found = null;
    }

    if (!found) {
      if (currentWord) hideTooltip();
      return;
    }

    // Re-create the UI if the page tore it out (SPA route changes wipe body).
    ensureUI();

    if (found.word === currentWord) {
      drawHighlight(found.rects);
      positionTooltip();
      return;
    }

    currentWord = found.word;
    currentEntry = null;
    drawHighlight(found.rects);
    renderTooltip(found.word, null, 'loading');
    positionTooltip();
    lookup(found.word);
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      if (detailOpen()) hideDetail();
      else hideTooltip();
      return;
    }

    if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
    // Never swallow keystrokes the page is expecting.
    if (isEditable(event.target) || isEditable(document.activeElement)) return;
    if (!currentWord || tooltip?.style.display === 'none') return;

    const key = event.key.toLowerCase();
    if (key === 'c') {
      event.preventDefault();
      copyWord(currentWord);
    } else if (key === 'k') {
      event.preventDefault();
      if (currentEntry) showDetail();
    }
  }

  function onScroll() {
    if (!detailOpen() && currentWord) hideTooltip();
  }

  function copyWord(text) {
    const done = () => {
      const foot = tooltip?.querySelector('.foot');
      if (!foot) return;
      const original = foot.textContent;
      foot.textContent = '✓ Copied';
      foot.classList.add('ok');
      setTimeout(() => {
        if (foot.isConnected) {
          foot.textContent = original;
          foot.classList.remove('ok');
        }
      }, 1200);
    };

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text) && done());
    } else if (fallbackCopy(text)) {
      done();
    }
  }

  function fallbackCopy(text) {
    if (!document.body) return false;
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.cssText = 'position:fixed;top:-9999px;opacity:0;';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch (_) {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Enable / disable
  // -------------------------------------------------------------------------

  function enable() {
    if (listening) return;
    listening = true;
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('blur', onScroll);
  }

  function disable() {
    if (!listening) return;
    listening = false;
    clearTimeout(hoverTimer);
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('blur', onScroll);
    hideDetail();
    hideTooltip();
  }

  function applySettings() {
    if (settings.enabled) enable();
    else disable();
  }

  chrome.storage.sync.get(['enabled', 'requireShift'], (stored) => {
    if (chrome.runtime.lastError) return;
    settings.enabled = stored.enabled !== false;
    settings.requireShift = stored.requireShift === true;
    applySettings();
  });

  // The popup writes to storage rather than messaging tabs: storage events reach
  // every tab and every frame with no tabs permission and no dead-port errors.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (changes.enabled) settings.enabled = changes.enabled.newValue !== false;
    if (changes.requireShift) settings.requireShift = changes.requireShift.newValue === true;
    applySettings();
  });
})();
