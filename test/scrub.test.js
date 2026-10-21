/* pagescrub tests — node, zero dependencies. Run: node test/scrub.test.js */
'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var dom = require('./fake-dom.js');

var LONG_TEXT = (
  'I have been baking sourdough for about three years now, and the single ' +
  'biggest lesson is that the recipe matters far less than watching the ' +
  'dough itself. Every kitchen has its own temperature, every flour behaves ' +
  'a little differently, and the starter you keep in your fridge has its own ' +
  'personality. Once you stop chasing exact timings and start reading the ' +
  'signs — the jiggle of a well-fermented dough, the smell turning from ' +
  'floury to faintly yoghurty — everything gets easier. This post walks ' +
  'through my actual weekend routine, the mistakes I kept making, and the ' +
  'small adjustments that finally gave me a consistently open crumb.'
);

function freshScrub() {
  var p = require.resolve('../src/scrub.js');
  delete require.cache[p];
  return require('../src/scrub.js');
}

/* A realistically annoying article page. */
function clutteredDoc() {
  var FakeElement = dom.FakeElement;
  var doc = new dom.FakeDocument();
  var body = doc.body;
  body.style.overflow = 'hidden';
  body.className = 'no-scroll article-page';

  var article = new FakeElement('article', { className: 'post-content' });
  var para = new FakeElement('p', { text: LONG_TEXT });
  article.appendChild(para);
  body.appendChild(article);

  var cookie = new FakeElement('div', {
    id: 'cookie-wall', className: 'cookie-consent',
    style: { position: 'fixed' }, rect: { width: 1280, height: 300, top: 500, left: 0 }
  });
  body.appendChild(cookie);

  var newsletter = new FakeElement('div', {
    className: 'newsletter-popup',
    style: { position: 'fixed' }, rect: { width: 400, height: 300, top: 200, left: 440 }
  });
  body.appendChild(newsletter);

  var header = new FakeElement('header', {
    className: 'site-header',
    style: { position: 'sticky' }, rect: { width: 1280, height: 64, top: 0, left: 0 }
  });
  body.appendChild(header);

  // small unnamed fixed video player — not ours to remove
  var player = new FakeElement('div', {
    id: 'player',
    style: { position: 'fixed' }, rect: { width: 320, height: 180, top: 620, left: 960 }
  });
  body.appendChild(player);

  return { doc: doc, cookie: cookie, newsletter: newsletter, header: header, player: player, article: article };
}

var passed = 0;
var failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok - ' + name);
  } catch (e) {
    failed++;
    console.log('  FAIL - ' + name);
    console.log('         ' + (e && e.message));
  }
}

console.log('pagescrub tests');

test('removes cookie wall, newsletter popup and sticky header', function () {
  var PageScrub = freshScrub();
  var d = clutteredDoc();
  PageScrub.scrub(d.doc);
  assert.strictEqual(d.cookie.parentNode, null, 'cookie wall removed');
  assert.strictEqual(d.newsletter.parentNode, null, 'newsletter removed');
  assert.strictEqual(d.header.parentNode, null, 'sticky header removed');
});

test('keeps the article and the unnamed fixed player', function () {
  var PageScrub = freshScrub();
  var d = clutteredDoc();
  PageScrub.scrub(d.doc);
  assert.strictEqual(d.article.parentNode, d.doc.body, 'article kept');
  assert.strictEqual(d.player.parentNode, d.doc.body, 'small unnamed fixed element kept');
});

test('unlocks scrolling on body', function () {
  var PageScrub = freshScrub();
  var d = clutteredDoc();
  PageScrub.scrub(d.doc);
  assert.strictEqual(d.doc.body.style.overflow, '', 'overflow cleared');
  assert.ok(!d.doc.body.classList.contains('no-scroll'), 'scroll-lock class removed');
  assert.ok(d.doc.body.classList.contains('article-page'), 'unrelated classes kept');
});

test('report counts what happened', function () {
  var PageScrub = freshScrub();
  var d = clutteredDoc();
  var report = PageScrub.scrub(d.doc);
  assert.strictEqual(report.removed, 3);
  assert.ok(report.labels.indexOf('div#cookie-wall') !== -1);
  assert.strictEqual(report.unlockedScroll, true);
  assert.strictEqual(report.mainContentKept, true);
});

test('second toggle restores everything in original order', function () {
  var PageScrub = freshScrub();
  var d = clutteredDoc();
  var before = d.doc.body.children.slice();
  PageScrub.toggle(d.doc); // scrub
  assert.strictEqual(d.cookie.parentNode, null);
  var res = PageScrub.toggle(d.doc); // restore
  assert.strictEqual(res.restored, 3);
  assert.deepStrictEqual(d.doc.body.children, before, 'original order restored');
});

test('restore with no active scrub is a no-op', function () {
  var PageScrub = freshScrub();
  var d = clutteredDoc();
  assert.deepStrictEqual(PageScrub.restore(d.doc), { restored: 0 });
});

test('scrub is idempotent — second run finds nothing', function () {
  var PageScrub = freshScrub();
  var d = clutteredDoc();
  PageScrub.scrub(d.doc);
  var again = PageScrub.scrub(d.doc);
  assert.strictEqual(again.removed, 0);
});

test('keepHeaders option leaves the sticky nav alone', function () {
  var PageScrub = freshScrub();
  var d = clutteredDoc();
  var report = PageScrub.scrub(d.doc, { keepHeaders: true });
  assert.strictEqual(d.header.parentNode, d.doc.body, 'header kept');
  assert.strictEqual(d.cookie.parentNode, null, 'popup still removed');
  assert.strictEqual(report.removed, 2);
});

test('static article with a suspicious class name is left alone', function () {
  var PageScrub = freshScrub();
  var d = clutteredDoc();
  d.article.className = 'content-popup-wrap'; // static, in-flow — not our business
  var report = PageScrub.scrub(d.doc);
  assert.strictEqual(d.article.parentNode, d.doc.body, 'in-flow article kept');
  // the inner paragraph still wins main-content detection, so it's protected too
  assert.strictEqual(report.mainContentKept, true, 'main content still detected via inner paragraph');
});

test('scrub(null) throws a human-readable error, not a TypeError dump', function () {
  var PageScrub = freshScrub();
  assert.throws(function () { PageScrub.scrub(null); }, /pagescrub: scrub\(\) needs a document/);
});

test('toast element is added to the page', function () {
  var PageScrub = freshScrub();
  var d = clutteredDoc();
  PageScrub.scrub(d.doc);
  var found = d.doc.body.children.some(function (el) {
    return el.getAttribute('data-pagescrub') === 'toast';
  });
  assert.ok(found, 'toast present');
});

test('shipped bookmarklet.js works end-to-end on a cluttered page', function () {
  var PageScrub = freshScrub(); // fresh so module state is clean for other tests
  void PageScrub;
  var built = fs.readFileSync(path.join(__dirname, '..', 'bookmarklet.js'), 'utf8');
  assert.ok(built.indexOf('javascript:(function(){') === 0, 'starts with javascript: wrapper');
  assert.ok(built.indexOf('\n') === -1, 'single line');

  var code = built.replace(/^javascript:/, '');
  var d = clutteredDoc();
  global.self = global;
  global.document = d.doc;
  try {
    eval(code); // runs the real artifact: defines PageScrub, calls toggle(document)
  } finally {
    delete global.self;
    delete global.document;
    delete global.PageScrub;
  }
  assert.strictEqual(d.cookie.parentNode, null, 'bookmarklet removed cookie wall');
  assert.strictEqual(d.newsletter.parentNode, null, 'bookmarklet removed newsletter');
  assert.strictEqual(d.article.parentNode, d.doc.body, 'bookmarklet kept article');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
