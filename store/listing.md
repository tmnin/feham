# Chrome Web Store submission — Feham

Everything below is ready to paste into the developer dashboard. Screenshots are
in this folder, all exactly 1280×800 as the store requires.

Dashboard: <https://chrome.google.com/webstore/devconsole> · one-time $5 registration fee.

---

## Store listing tab

**Name**
```
Feham — Urdu Reader
```

**Summary** (max 132 characters — this is 113)
```
Hover any Urdu word to see its English meaning, transliteration and dictionary entry. No clicking, no copy-paste.
```

**Category** — `Education`
(Reasonable alternates if you prefer: `Productivity`, or `Accessibility`.)

**Language** — English

**Detailed description**
```
Feham is built to help Urdu learners and speakers read text from any webpage. Point at a word and a small card shows what it means in English — no clicking, no copying into a translation tab, no losing your place in the sentence.

WHAT YOU GET FOR EVERY WORD

• The English meaning
• Roman transliteration, so you know how it is pronounced — محبت → muhabbat
• A proper dictionary entry: part of speech and every listed sense
• Urdu back-translations for each sense, to help you tell close meanings apart

Press K for the full entry, C to copy the Urdu word, Esc to dismiss.

BUILT FOR ACTUALLY READING URDU

• Nastaliq or Naskh — pick the script you are comfortable reading. Both fonts are
  bundled with the extension, so nothing is downloaded and nothing breaks offline.
• "Hold Shift to look up" — if constant tooltips distract you, switch to Shift
  mode and they only appear when you ask.
• Works everywhere: news sites, Wikipedia, blogs, forums, poetry. Including
  headlines and links, which most hover dictionaries miss.
• Looked-up words are cached locally, so words you meet again appear instantly.

PRIVACY

Feham sends one thing anywhere: the single word you hover, to Google Translate, to look up its meaning. It never sends the page, its address, or your browsing history. There is no analytics, no tracking, no accounts, and no server behind the extension. Your settings and the word cache stay on your machine, and you can clear the cache from the popup at any time.

Full source code: https://github.com/tmnin/feham
Privacy policy: https://github.com/tmnin/feham/blob/main/PRIVACY.md
```

**Screenshots** (1280×800, upload in this order)

| File | Shows |
| --- | --- |
| `01-hover.png` | The core interaction — hovering محبت, tooltip with transliteration and gloss |
| `03-real-site.png` | Working on a real page (BBC Urdu article) |
| `02-details.png` | The full dictionary entry panel (K) |
| `04-settings.png` | Popup: on/off, Shift mode, Nastaliq/Naskh picker |

**Graphic assets**

| Field | File |
| --- | --- |
| Store icon (128×128) | `store-icon-128.png` |
| Small promo tile (440×280) | `promo-small-440x280.png` |
| Marquee promo tile (1400×560) | `promo-marquee-1400x560.png` |
| Global promo video | leave blank |

All are RGB with no alpha, as the store requires. The mark is sized from a
measured ink bounding box rather than by eye — Nastaliq's cascade overshoots its
em box badly, so a font-size picked by guesswork clips the top dot and the
descender.

**Additional fields**

| Field | Value |
| --- | --- |
| Official URL | `None` — that dropdown only lists domains verified in Google Search Console |
| Homepage URL | `https://github.com/tmnin/feham` |
| Support URL | `https://github.com/tmnin/feham/issues` |
| Mature content | off |

---

## Privacy tab

**Single purpose description**
```
Feham has one purpose: to show the English meaning of an Urdu word when the user
hovers over it on a webpage. Every feature — the tooltip, the dictionary panel,
the font choice, the copy shortcut — serves that single reading-aid purpose.
```

**Permission justifications**

`storage`
```
Used to save the user's own settings (extension on/off, "Hold Shift to look up"
mode, and Nastaliq/Naskh font choice) and to keep a local cache of previously
looked-up words. The cache avoids sending the same word to the translation
service repeatedly, which keeps the extension responsive and reduces requests.
Nothing in storage leaves the user's machine.
```

Host permission — `https://translate.googleapis.com/*`
```
This is the translation service the extension queries. When the user hovers an
Urdu word, that single word is sent to this endpoint and the returned meaning,
transliteration and dictionary entry are displayed in the tooltip. This request
is made from the service worker so it is not blocked by strict site policies.
```

Host permission — content script on all sites
```
Urdu text can appear on any website — news, Wikipedia, blogs, forums, poetry —
so the extension cannot know in advance which sites the user will read. The
content script detects the Urdu word under the cursor and draws the tooltip. It
reads only the single word being hovered, never the wider page, and sends
nothing anywhere until the user hovers an Urdu word. It is inert when the
extension is switched off.
```

**Remote code** — select **No, I am not using remote code**.
All JavaScript, both fonts, and all icons are packaged in the extension. The only
network request is a data (JSON) request for a translation.

**Data usage** — tick **Website content**, and nothing else.
Disclosure text if asked:
```
The single word the user hovers over is sent to Google Translate in order to
return its meaning. No other page content, no URLs, and no browsing history are
transmitted. The word is not stored on any server operated by the developer —
there is no such server — and results are cached only in the user's own browser.
```

Then certify all three:
- Not being sold to third parties ✓
- Not being used or transferred for purposes unrelated to the item's single purpose ✓
- Not being used or transferred to determine creditworthiness or for lending ✓

**Privacy policy URL**
```
https://github.com/tmnin/feham/blob/main/PRIVACY.md
```
This must be publicly reachable before you submit, so push the repo first.

---

## Before you hit publish

- [ ] Push the repo — the privacy policy URL must resolve, or review will reject.
- [ ] Upload `feham-1.1.0.zip` (built at the repo root, gitignored).
- [ ] Set visibility: **Unlisted** first if you want to test the install flow
      yourself before going Public. You can flip it to Public later without
      resubmitting for review.

Review usually takes a few days. Extensions requesting broad host permissions
often take longer, so the wait is expected rather than a sign of trouble.
