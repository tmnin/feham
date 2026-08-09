# Privacy Policy — Feham

_Last updated: 9 August 2026_

Feham is an Urdu-to-English reading aid. This policy describes exactly what the
extension does with data. It is short because the extension does very little.

## What is sent off your device

**One word at a time, only when you hover it.** When you point at an Urdu word on
a page and Feham is enabled, that single word is sent to Google's public
translation endpoint (`translate.googleapis.com`) to fetch its meaning. The
response is shown in the tooltip.

That is the only thing that ever leaves your computer.

Specifically, Feham does **not** send:

- the page you are on, its URL, its title, or any other text from it
- your browsing history
- any account, identity, device, or location information
- anything at all when the extension is switched off, or when "Hold Shift to
  look up" is enabled and you are not holding Shift

Words sent to Google are handled under
[Google's Privacy Policy](https://policies.google.com/privacy). Feham has no
affiliation with Google.

## What is stored on your device

- **Your settings** (enabled, Hold-Shift mode, font choice) in `chrome.storage.sync`,
  so they follow your Chrome profile.
- **A local cache** of words you have already looked up, in `chrome.storage.local`,
  so repeated words are instant and to avoid re-requesting the same word. The
  cache holds at most 1000 words, entries expire after 30 days, and it never
  leaves your machine.

You can erase the cache at any time with **Clear cached translations** in the
extension popup. Uninstalling Feham removes all stored data.

## What is not collected at all

There is no analytics, no telemetry, no crash reporting, no advertising, no
tracking, and no user accounts. No data is collected by, or transmitted to, the
developer of this extension — there is no server behind Feham. Nothing is sold
or shared with third parties, and nothing is used for creditworthiness or
lending purposes.

## Permissions and why they exist

- **`storage`** — to save your settings and the local translation cache.
- **Access to `translate.googleapis.com`** — to look words up.
- **Access to all websites** — Urdu text can appear on any site, so the extension
  cannot know in advance which pages to run on. It only ever reads the single
  word under your cursor, and only while enabled.

## Contact

Questions or concerns: open an issue at
<https://github.com/tmnin/feham/issues>. The full source code is available
there for inspection.
