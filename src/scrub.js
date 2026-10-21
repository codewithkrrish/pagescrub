/*
 * pagescrub v1.0.0 — one click to declutter any article page.
 *
 * Click the bookmarklet and it pulls out cookie walls, newsletter popups,
 * sticky headers and floating junk, then unlocks scrolling. Click again
 * (or press Esc, or click the little toast) to put everything back.
 *
 * I read a lot of docs and blog posts and got tired of fighting the same
 * battle on every page: dismiss a newsletter modal, close a cookie wall,
 * scroll past a sticky video player — on the SAME page. So I wrote the
 * thing I kept wishing existed.
 *
 * Zero dependencies, no network calls, nothing leaves the page. Everything
 * it removes is kept in memory so undo is instant.
 *
 * Power users: set window.__pagescrub = { keepHeaders: true } before
 * clicking if you want sticky nav bars left alone.
 */
(function (root, factory) {
  if (typeof module === 'object' && module !== null && typeof module.exports === 'object') {
    module.exports = factory(); // node (tests)
  } else {
    root.PageScrub = factory(); // browser bookmarklet
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.0.0';

  /* Tuning knobs — plain numbers, easy to tweak. */
  var OVERLAY_COVERAGE = 0.35; // fixed element covering >= 35% of viewport counts as an overlay
  var CHROME_MAX_HEIGHT = 0.30; // sticky bars taller than 30% of viewport height are left alone
  var MIN_MAIN_TEXT = 200;      // chars needed before we trust "main content" detection

  /* Fingerprints are lowercased with separators stripped, so "cookie-consent"
     and "cookieConsent" both become "cookieconsent". */
  var CLUTTER_RE = /popup|modal|overlay|lightbox|interstitial|takeover|cookie|consent|gdpr|newsletter|subscribe|signup|paywall|adblock|stickyad|chatwidget|sharebar|promobanner|slidein|flyout/i;
  var CHROME_RE = /siteheader|navbar|navbar|topbar|toolbar|menubar|stickyheader|stickybar|stickynav|floatingshare|sharebuttons|backtotop|announcementbar/i;
  var SCROLL_LOCK_RE = /noscroll|scrolllock|modalopen|overflowhidden|lockscroll/i;

  var session = null;   // the one active scrub on this page (bookmarklet reality: one at a time)
  var activeToast = null;
  var escBinding = null;

  function viewOf(doc) {
    var view = doc && doc.defaultView;
    if (!view || typeof view.getComputedStyle !== 'function') {
      throw new Error('pagescrub: scrub() needs a document with a defaultView (got ' + typeName(doc) + ')');
    }
    return view;
  }

  function typeName(v) {
    if (v === null) return 'null';
    if (v === undefined) return 'undefined';
    return typeof v;
  }

  function attr(el, name) {
    try {
      if (name === 'id') return el.id || '';
      if (name === 'class') return el.className || '';
      return (el.getAttribute && el.getAttribute(name)) || '';
    } catch (e) {
      return '';
    }
  }

  /* One searchable string per element: id + classes + role + aria-label. */
  function fingerprint(el) {
    var raw = attr(el, 'id') + ' ' + attr(el, 'class') + ' ' + attr(el, 'role') + ' ' + attr(el, 'aria-label');
    return raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function textSize(el) {
    var t = el.textContent || '';
    return t.replace(/\s+/g, ' ').trim().length;
  }

  function cssPosition(view, el) {
    try {
      return (view.getComputedStyle(el).position || '').toLowerCase();
    } catch (e) {
      return '';
    }
  }

  function safeRect(el) {
    try {
      var r = el.getBoundingClientRect();
      return { width: r.width || 0, height: r.height || 0 };
    } catch (e) {
      return { width: 0, height: 0 };
    }
  }

  function isAncestor(maybeAncestor, el) {
    var node = el.parentNode;
    while (node) {
      if (node === maybeAncestor) return true;
      node = node.parentNode;
    }
    return false;
  }

  /* The element holding the most text is almost always the article. Never
     touch it or anything above it — that's the whole page, basically. */
  function findMainContent(doc) {
    var best = null;
    var bestSize = 0;
    var els = doc.querySelectorAll('*');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var tag = (el.tagName || '').toUpperCase();
      if (tag === 'HTML' || tag === 'BODY' || tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') continue;
      if (CLUTTER_RE.test(fingerprint(el))) continue; // a wordy popup must not win
      var size = textSize(el);
      if (size > bestSize) {
        bestSize = size;
        best = el;
      }
    }
    return bestSize >= MIN_MAIN_TEXT ? best : null;
  }

  function isChromeBar(el, pos, rect, vh) {
    var tag = (el.tagName || '').toLowerCase();
    var tagged = tag === 'header' || tag === 'nav' || tag === 'footer';
    if (!tagged && !CHROME_RE.test(fingerprint(el))) return false;
    if (pos !== 'fixed' && pos !== 'sticky') return false;
    return rect.height <= CHROME_MAX_HEIGHT * vh; // full-height drawers are not "bars"
  }

  /* If a parent and its child are both flagged, only take the parent —
     removing the child too would break undo ordering for no benefit. */
  function outermostOnly(targets) {
    return targets.filter(function (el) {
      for (var i = 0; i < targets.length; i++) {
        if (targets[i] !== el && isAncestor(targets[i], el)) return false;
      }
      return true;
    });
  }

  function collectTargets(doc, view, vw, vh, main, opts) {
    var targets = [];
    var els = doc.querySelectorAll('*');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el === doc.documentElement || el === doc.body) continue;
      if (main && (el === main || isAncestor(el, main))) continue;

      var pos = cssPosition(view, el);
      var pinned = pos === 'fixed' || pos === 'sticky' || pos === 'absolute';
      var fp = fingerprint(el);
      var rect = safeRect(el);
      var coversViewport = rect.width * rect.height >= OVERLAY_COVERAGE * vw * vh;

      var isOverlay = pinned && CLUTTER_RE.test(fp);
      var isGiantFixed = pos === 'fixed' && coversViewport; // unnamed takeover
      var isBar = isChromeBar(el, pos, rect, vh) && !opts.keepHeaders;

      if (isOverlay || isGiantFixed || isBar) targets.push(el);
    }
    return outermostOnly(targets);
  }

  /* Sites love freezing the page behind their modals. Give scrolling back. */
  function unlockScroll(doc, view) {
    var changed = false;
    var roots = [doc.documentElement, doc.body];
    for (var i = 0; i < roots.length; i++) {
      var el = roots[i];
      if (!el || !el.style) continue;
      var cs = view.getComputedStyle(el);
      if ((cs.overflow || '') === 'hidden' || (cs.overflowY || '') === 'hidden') {
        el.style.overflow = '';
        changed = true;
      }
      if ((cs.position || '') === 'fixed') {
        el.style.position = '';
        changed = true;
      }
      // Scroll-lock classes come hyphenated, camelCased, all sorts — normalize
      // the same way fingerprint() does before matching.
      var kept = (' ' + (el.className || '') + ' ')
        .split(/\s+/)
        .filter(function (c) {
          return c && !SCROLL_LOCK_RE.test(c.toLowerCase().replace(/[^a-z0-9]/g, ''));
        });
      var before = (el.className || '').split(/\s+/).filter(Boolean).length;
      if (kept.length !== before) {
        el.className = kept.join(' ');
        changed = true;
      }
    }
    return changed;
  }

  function describe(el) {
    var s = (el.tagName || 'el').toLowerCase();
    if (el.id) return s + '#' + el.id;
    var first = (el.className || '').split(/\s+/).filter(Boolean)[0];
    return first ? s + '.' + first : s;
  }

  function removeToast() {
    if (activeToast && activeToast.parentNode) {
      activeToast.parentNode.removeChild(activeToast);
    }
    activeToast = null;
  }

  function unbindEsc() {
    if (escBinding) {
      try {
        escBinding.doc.removeEventListener('keydown', escBinding.fn);
      } catch (e) { /* older stub DOMs may not have it */ }
      escBinding = null;
    }
  }

  function showToast(doc, view, message, undoable) {
    removeToast();
    var div = doc.createElement('div');
    div.setAttribute('data-pagescrub', 'toast');
    div.textContent = undoable ? message + ' — click to undo' : message;
    var s = div.style;
    s.position = 'fixed';
    s.bottom = '18px';
    s.left = '50%';
    s.transform = 'translateX(-50%)';
    s.background = '#111111';
    s.color = '#ffffff';
    s.padding = '10px 18px';
    s.borderRadius = '999px';
    s.font = '14px/1.4 system-ui, -apple-system, sans-serif';
    s.zIndex = '2147483647';
    s.boxShadow = '0 4px 24px rgba(0,0,0,0.35)';
    if (undoable) {
      s.cursor = 'pointer';
      div.addEventListener('click', function () { restore(doc); });
    }
    doc.body.appendChild(div);
    activeToast = div;
    if (typeof view.setTimeout === 'function') {
      view.setTimeout(removeToast, 6000);
    }
  }

  function scrub(doc, opts) {
    var view = viewOf(doc);
    opts = opts || {};
    var pageCfg = view.__pagescrub || {};
    var keepHeaders = opts.keepHeaders !== undefined ? opts.keepHeaders : !!pageCfg.keepHeaders;

    var vw = view.innerWidth || 1280;
    var vh = view.innerHeight || 800;

    var main = findMainContent(doc);
    var targets = collectTargets(doc, view, vw, vh, main, { keepHeaders: keepHeaders });

    var removed = [];
    for (var i = 0; i < targets.length; i++) {
      var el = targets[i];
      var parent = el.parentNode;
      if (!parent) continue;
      removed.push({ el: el, parent: parent, next: el.nextSibling, label: describe(el) });
      parent.removeChild(el);
    }

    var unlocked = unlockScroll(doc, view);

    session = {
      active: true,
      removed: removed,
      unlockedScroll: unlocked
    };

    // Esc puts everything back — bound once per scrub, released on restore.
    unbindEsc();
    var onKey = function (e) {
      if (e && e.key === 'Escape') restore(doc);
    };
    if (typeof doc.addEventListener === 'function') {
      doc.addEventListener('keydown', onKey);
      escBinding = { doc: doc, fn: onKey };
    }

    var report = {
      removed: removed.length,
      labels: removed.map(function (r) { return r.label; }),
      unlockedScroll: unlocked,
      mainContentKept: !!main
    };

    var msg;
    if (removed.length === 0 && !unlocked) {
      msg = 'PageScrub: already clean, nothing to remove';
    } else {
      msg = 'PageScrub cleared ' + removed.length + ' thing' + (removed.length === 1 ? '' : 's');
      if (unlocked) msg += ' and unlocked scrolling';
    }
    showToast(doc, view, msg, removed.length > 0);
    return report;
  }

  function restore(doc) {
    if (!session || !session.active) return { restored: 0 };
    var removed = session.removed;
    // Re-insert in reverse so siblings land back in their original spots.
    for (var i = removed.length - 1; i >= 0; i--) {
      var r = removed[i];
      try {
        if (r.next && r.next.parentNode === r.parent) {
          r.parent.insertBefore(r.el, r.next);
        } else {
          r.parent.appendChild(r.el);
        }
      } catch (e) { /* a site script may have eaten the parent; skip it */ }
    }
    session.active = false;
    unbindEsc();
    removeToast();
    return { restored: removed.length };
  }

  function toggle(doc, opts) {
    if (session && session.active) return restore(doc);
    return scrub(doc, opts);
  }

  return {
    scrub: scrub,
    restore: restore,
    toggle: toggle,
    version: VERSION
  };
});
