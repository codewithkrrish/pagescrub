/*
 * build.js — turns src/scrub.js into the one-line bookmarklet.js.
 * Zero dependencies. Run: node build.js
 *
 * The minifier is deliberately simple: it strips comments and collapses
 * whitespace. It understands strings (' and ") and treats '/' as a regex
 * opener only after characters that can precede a regex in this codebase
 * (= ( , [ ! & | ? { } ;). Keep that in mind if you edit src/scrub.js —
 * e.g. don't start a line with a regex literal after `return`.
 */
'use strict';

var fs = require('fs');
var path = require('path');

var SRC = path.join(__dirname, 'src', 'scrub.js');
var OUT = path.join(__dirname, 'bookmarklet.js');

function minify(src) {
  var out = '';
  var i = 0;
  var n = src.length;
  var quote = null; // inside '...' or "..."
  var lineComment = false;
  var blockComment = false;

  function prevSig() {
    for (var k = out.length - 1; k >= 0; k--) {
      var c = out[k];
      if (c !== ' ' && c !== '\t' && c !== '\n' && c !== '\r') return c;
    }
    return '';
  }

  while (i < n) {
    var c = src[i];
    var next = src[i + 1];

    if (lineComment) {
      if (c === '\n') lineComment = false;
      i++;
      continue;
    }
    if (blockComment) {
      if (c === '*' && next === '/') { blockComment = false; i += 2; continue; }
      i++;
      continue;
    }
    if (quote) {
      out += c;
      if (c === '\\') { out += next || ''; i += 2; continue; }
      if (c === quote) quote = null;
      i++;
      continue;
    }
    if (c === '/' && next === '/') { lineComment = true; i += 2; continue; }
    if (c === '/' && next === '*') { blockComment = true; i += 2; continue; }
    if (c === '"' || c === "'") { quote = c; out += c; i++; continue; }
    if (c === '/' && '=(:,[!&|?{};'.indexOf(prevSig()) !== -1) {
      // regex literal — copy through to the closing unescaped /
      out += c;
      i++;
      var inClass = false;
      while (i < n) {
        var rc = src[i];
        out += rc;
        if (rc === '\\') { out += src[i + 1] || ''; i += 2; continue; }
        if (rc === '[') inClass = true;
        if (rc === ']') inClass = false;
        if (rc === '/' && !inClass) { i++; break; }
        i++;
      }
      // flags (i, g, m)
      while (i < n && /[a-z]/i.test(src[i])) { out += src[i]; i++; }
      continue;
    }
    if (c === '\n' || c === '\r' || c === '\t') c = ' ';
    // collapse runs of spaces, but never glue two identifier chars together wrongly
    if (c === ' ' && /[\s]/.test(out[out.length - 1] || '')) { i++; continue; }
    out += c;
    i++;
  }
  return out.trim();
}

function main() {
  var src = fs.readFileSync(SRC, 'utf8');
  var min = minify(src);
  if (/\n/.test(min)) {
    throw new Error('minify failed: output still contains newlines');
  }
  var bookmarklet =
    'javascript:(function(){' + min +
    ';try{PageScrub.toggle(document);}catch(e){' +
    "if(typeof console!=='undefined'&&console.error){console.error('pagescrub: '+(e&&e.message||e));}" +
    '}})()';
  // atomic write: temp file + rename, so a crash can't leave a half-written file
  var tmp = OUT + '.tmp';
  fs.writeFileSync(tmp, bookmarklet, 'utf8');
  fs.renameSync(tmp, OUT);
  console.log('wrote ' + OUT + ' (' + bookmarklet.length + ' chars)');
}

main();
