# pagescrub

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

One click, and the article page calms down. A bookmarklet that strips popups,
cookie walls, sticky headers and floating junk off any article page — then
unlocks scrolling. Click again (or press Esc) to put everything back.

## Why I built this

I read a lot of docs and blog posts, and every page felt like the same fight:
close the newsletter modal, dismiss the cookie wall, scroll past a sticky
video player — on the *same page*. Reader modes exist but they're buried in
browser menus and they mangle half the layouts I care about. I wanted one
button that just removes the stuff that was never the article. So I wrote it.

## Try it in 10 seconds

Open `demo/index.html` in your browser — it's a deliberately annoying fake
article (sticky header, cookie wall, newsletter popup, locked scrolling).
Hit the **Scrub this page** button and watch it clean up. Click again to undo.

## Install

No extensions, no accounts, no build step:

1. Copy the entire contents of [`bookmarklet.js`](bookmarklet.js).
2. Create a new bookmark in your browser, paste the copied text into the
   **URL** field, name it `pagescrub`.
3. Open any cluttered article page and click the bookmark.

That's it. It runs entirely on the page — no network calls, nothing leaves
your browser.

## Usage

- **Click the bookmarklet** on any article page. A little toast tells you
  what got removed.
- **Click again, press Esc, or click the toast** to undo and restore the page
  exactly as it was.
- **Keep your sticky nav?** Before clicking, open the console and run:
  `window.__pagescrub = { keepHeaders: true }`. It sticks for the session.

## What it removes

- Fixed/absolute overlays matching the usual suspects: popups, modals,
  lightboxes, cookie/consent walls, newsletter and subscribe boxes, paywall
  nag screens, interstitials, promo takeovers.
- Big unnamed fixed elements covering a third or more of the viewport
  (the "mystery overlay" case).
- Sticky/floating chrome: site headers, nav bars, share button rails,
  back-to-top pills — anything pinned that isn't the content.
- Scroll locks: `overflow: hidden` on the page, `no-scroll`-style classes,
  body-freezing tricks.

## What it never touches

The element holding the most text on the page is treated as the article and
is never removed — nor is anything above it. Small unnamed fixed elements
(like a pinned video player) are left alone too; I'd rather miss one ad than
nuke something you wanted.

## Limitations (honest ones)

- **Real paywalls win.** If the server never sent the text, no client-side
  trick can bring it back. pagescrub only removes what was already there.
- Sites that re-inject popups as you scroll need a second click. It doesn't
  watch the DOM continuously — that would be heavier than a bookmarklet
  should be.
- It can't reach inside cross-origin iframes. Embedded junk stays embedded.
- Class-name matching is heuristic. A site with truly bizarre markup might
  need `keepHeaders` or just won't scrub perfectly. Undo is always one click
  away, so it's safe to try.

## Project structure

```
pagescrub/
├── bookmarklet.js   # the built one-liner — copy this into a bookmark
├── src/scrub.js     # the actual logic (works in browser + node)
├── build.js         # zero-dep build: src -> bookmarklet.js
├── demo/index.html  # deliberately annoying article to try it on
└── test/
    ├── fake-dom.js  # tiny DOM stub, no dependencies
    └── scrub.test.js
```

Rebuild after editing the source: `node build.js`, then `node test/scrub.test.js`
(12 tests, all green).

## License

MIT — see [LICENSE](LICENSE).

## Author

Krrish — [github.com/codewithkrrish](https://github.com/codewithkrrish)
