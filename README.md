# فہم / Feham

A hover-to-read Urdu dictionary for Chrome, in the spirit of [rikaikun](https://github.com/melink14/rikaikun)
for Japanese. Point at an Urdu word on any page and a tooltip shows its
transliteration, English meaning, and dictionary entry.

![](https://img.shields.io/badge/manifest-v3-blue)

## Install

1. Go to `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. **Load unpacked** → select this folder

## Use

| Action | |
| --- | --- |
| Hover an Urdu word | tooltip with transliteration + meaning |
| <kbd>C</kbd> | copy the Urdu word |
| <kbd>K</kbd> | full dictionary entry (all senses, Urdu back-translations) |
| <kbd>Esc</kbd> | dismiss |

The toolbar popup has an on/off switch and a **Hold Shift to look up** mode, for
when you want to read without tooltips constantly appearing.

## How it works

Urdu is space-separated, so unlike Japanese there's no segmentation problem —
the word under the cursor is found with `caretRangeFromPoint`, then expanded to
the surrounding run of Arabic-script characters.

There's no good scrapeable Urdu↔English dictionary online, so lookups go to
Google's public `translate_a/single` endpoint. It's undocumented and returns a
positional array, but it carries more than a plain translation:

| field | used for |
| --- | --- |
| `dt=t` | the machine translation |
| `dt=bd` | dictionary entries grouped by part of speech, with Urdu back-translations |
| `dt=rm` | romanization (`محبت` → *muhabbat*) |
| `dt=at` | alternative translations |

The dictionary and alternatives matter more than the raw translation. Bare nouns
come back with a spurious article (`کتاب` → "The book") and particles come back
transliterated rather than translated (`کے` → "K"), so `pickPrimary()` in
`background.js` prefers the cleaner source: `کتاب` → *book*, `کے` → *of the*.

### Layout

| file | |
| --- | --- |
| `content.js` | word detection, tooltip, highlight — all UI in a shadow root |
| `background.js` | lookups, response parsing, caching |
| `popup.html/js` | settings |
| `fonts/` | Noto Nastaliq Urdu, bundled so tooltips render without a network fetch |

Two things worth knowing if you edit this:

**Network calls live in the service worker.** In MV3 a content script's `fetch`
is subject to the *host page's* CSP, so looking a word up directly from
`content.js` fails on any site with a strict `connect-src`. The service worker
has the extension's own host permissions, so it always works.

**The highlight never touches the page DOM.** It's drawn as overlay rectangles
positioned over the word's client rects. Wrapping the word in a `<span>` (what
the first version did) mutates the page, which breaks React/Vue re-renders and
clobbers the user's own text selection.

Lookups are cached in `chrome.storage.local` for 30 days, capped at 1000 words,
and in-flight requests are de-duplicated — without that, hovering across a
paragraph will get you rate-limited by Google.

## Permissions

`storage` only, plus host access to `translate.googleapis.com`. Nothing is sent
anywhere except the single word you hover.
