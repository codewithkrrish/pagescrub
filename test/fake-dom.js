/*
 * A deliberately tiny DOM stub — just enough for pagescrub's core to run
 * under node with zero dependencies. It is NOT a real DOM; it only
 * implements the handful of APIs src/scrub.js touches.
 */
'use strict';

function FakeElement(tag, opts) {
  opts = opts || {};
  var self = this;
  this.tagName = String(tag).toUpperCase();
  this.id = opts.id || '';
  this.className = opts.className || '';
  this.style = opts.style ? Object.assign({}, opts.style) : {};
  this.children = [];
  this.parentNode = null;
  this.textContent = opts.text || '';
  this._rect = opts.rect || { width: 0, height: 0, top: 0, left: 0 };
  this._attrs = opts.attrs || {};
  this._listeners = {};
  this.classList = {
    contains: function (c) {
      return (' ' + self.className + ' ').indexOf(' ' + c + ' ') !== -1;
    },
    add: function (c) {
      if (!this.contains(c)) self.className = (self.className + ' ' + c).trim();
    },
    remove: function (c) {
      var padded = (' ' + self.className + ' ').split(' ' + c + ' ').join(' ');
      self.className = padded.replace(/\s+/g, ' ').trim();
    }
  };
}

Object.defineProperty(FakeElement.prototype, 'nextSibling', {
  get: function () {
    if (!this.parentNode) return null;
    var sibs = this.parentNode.children;
    var i = sibs.indexOf(this);
    return i === -1 ? null : (sibs[i + 1] || null);
  }
});

FakeElement.prototype.appendChild = function (child) {
  child.parentNode = this;
  this.children.push(child);
  return child;
};

FakeElement.prototype.removeChild = function (child) {
  var i = this.children.indexOf(child);
  if (i === -1) throw new Error('removeChild: not a child');
  this.children.splice(i, 1);
  child.parentNode = null;
  return child;
};

FakeElement.prototype.insertBefore = function (child, ref) {
  if (!ref) return this.appendChild(child);
  var i = this.children.indexOf(ref);
  if (i === -1) throw new Error('insertBefore: reference not a child');
  if (child.parentNode) child.parentNode.removeChild(child);
  child.parentNode = this;
  this.children.splice(i, 0, child);
  return child;
};

FakeElement.prototype.getAttribute = function (name) {
  if (name === 'id') return this.id || null;
  if (name === 'class') return this.className || null;
  return Object.prototype.hasOwnProperty.call(this._attrs, name) ? this._attrs[name] : null;
};

FakeElement.prototype.setAttribute = function (name, value) {
  if (name === 'id') { this.id = String(value); return; }
  if (name === 'class') { this.className = String(value); return; }
  this._attrs[name] = String(value);
};

FakeElement.prototype.getBoundingClientRect = function () {
  var r = this._rect;
  return {
    width: r.width, height: r.height, top: r.top, left: r.left,
    right: r.left + r.width, bottom: r.top + r.height
  };
};

FakeElement.prototype.addEventListener = function (type, fn) {
  this._listeners[type] = this._listeners[type] || [];
  this._listeners[type].push(fn);
};

FakeElement.prototype.removeEventListener = function (type, fn) {
  var list = this._listeners[type] || [];
  var i = list.indexOf(fn);
  if (i !== -1) list.splice(i, 1);
};

/* FakeDocument ------------------------------------------------------- */

function FakeDocument() {
  this.documentElement = new FakeElement('html');
  this.body = new FakeElement('body');
  this.documentElement.appendChild(this.body);
  var self = this;
  this.defaultView = {
    innerWidth: 1280,
    innerHeight: 800,
    getComputedStyle: function (el) { return el.style; },
    setTimeout: function () { return 0; },
    __pagescrub: {}
  };
  this._listeners = {};
}

FakeDocument.prototype.createElement = function (tag) {
  return new FakeElement(tag);
};

FakeDocument.prototype.addEventListener = function (type, fn) {
  this._listeners[type] = this._listeners[type] || [];
  this._listeners[type].push(fn);
};

FakeDocument.prototype.removeEventListener = function () {};

function walk(el, fn) {
  fn(el);
  for (var i = 0; i < el.children.length; i++) walk(el.children[i], fn);
}

function matchesSimple(el, group) {
  if (group === '*') return true;
  if (group.charAt(0) === '#') return (el.id || '').toLowerCase() === group.slice(1);
  if (group.charAt(0) === '.') return el.classList.contains(group.slice(1));
  return (el.tagName || '').toLowerCase() === group;
}

FakeDocument.prototype.querySelectorAll = function (selector) {
  var groups = String(selector).split(',').map(function (s) { return s.trim().toLowerCase(); });
  var out = [];
  walk(this.documentElement, function (el) {
    for (var i = 0; i < groups.length; i++) {
      if (matchesSimple(el, groups[i])) { out.push(el); break; }
    }
  });
  return out;
};

module.exports = { FakeDocument: FakeDocument, FakeElement: FakeElement };
