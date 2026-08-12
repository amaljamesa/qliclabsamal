// Resolves the JSON payload a print layout renders, once, and hands every later re-render the
// already-parsed object.
//
// Shared by every layout in public/print/ rather than living in each of them, for the same
// reason report-zoom.js is: there are fifteen of them, and a resolution order that has to stay
// identical across all fifteen survives in one place and rots in fifteen.
//
// TWO THINGS THIS FIXES
//
// 1. The ~5MB ceiling. The payload used to arrive base64-encoded in sessionStorage or
//    localStorage, which is capped per origin across the whole app - bulk print blew through it
//    and rendered blank. The primary route below reads a live object off the parent window
//    instead: no encode, no copy, no quota, and nothing that grows with the payload's size.
//
// 2. Re-decoding on every render - and, in the report layouts, once per page. Those layouts read
//    storage inside topdiv(), which runs for every page element created, so a zoom change on a
//    six-page register performed six storage reads, six base64 decodes and six JSON.parses of
//    the entire payload. report-zoom.js polls devicePixelRatio every 400ms and re-runs that;
//    beforeprint runs it again. Resolving once and caching is what makes the re-render free.
//
// WHY THE SPLIT INTO loadReportPayload / getReportPayload
//
// The IndexedDB fallback is async, but the layouts re-render *synchronously* - deliberately, and
// they say why: an async rebuild risks the print capturing the document mid-reset and printing a
// blank page. So resolution (async, once, at startup) is separated from access (synchronous,
// every render, free). Only loadReportPayload can await; getReportPayload never does.
(function (global) {
  'use strict';

  var DB_NAME = 'qliclabs-store';
  var STORE_NAME = 'kv';
  // Namespace applied by the host when it mirrors a payload here - see
  // src/app/services/preview-payload.ts, which must agree with this prefix.
  var DB_KEY_PREFIX = 'preview:';

  var cachedPayload = null;

  // The one base64 decoder for all fifteen layouts, which used to carry a copy each (in three
  // slightly different states of repair). Everything it tolerates is here because one of those
  // copies needed it:
  //
  //  - ' ' -> '+': a space is never valid base64, but a payload read out of a query string has
  //    had every '+' turned into one, because that is what '+' means in a query string.
  //  - '-' and '_': the URL-safe base64 alphabet, which a hand-built /print/ URL may use.
  //  - '=' padding, which URL-safe encoders usually strip.
  //
  // Plain atob() then yields one byte per code unit, and those bytes are UTF-8 that still needs
  // decoding - without this last step every '₹' comes out as mojibake.
  function decodeBase64(value) {
    var base64 = String(value).replace(/ /g, '+').replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  }

  function parseEncoded(value) {
    if (!value) {
      return null;
    }
    try {
      return JSON.parse(decodeBase64(value));
    } catch (error) {
      console.error('Could not decode a stored report payload:', error);
      return null;
    }
  }

  // 1. The parent bridge. The normal in-app case, and the only branch that is O(1) rather than
  //    O(payload): what comes back is the very object the app already holds, not a copy of it.
  //    Reading window.parent throws if these layouts are ever embedded cross-origin, so a
  //    failure here has to fall through to the next branch rather than take the page down.
  function fromParent(storageKey) {
    try {
      if (global.parent === global || !global.parent) {
        return null;
      }
      var bridge = global.parent.__qlPreviewPayload;
      return typeof bridge === 'function' ? bridge(storageKey) || null : null;
    } catch (error) {
      return null;
    }
  }

  // 3. Web Storage, still read so that anything already working today keeps working - a preview
  //    opened by an older build, or a tab left open across the deploy. Both stores are tried
  //    because the key alone doesn't say which one a given layout used.
  function fromWebStorage(storageKey) {
    try {
      var stored = global.sessionStorage.getItem(storageKey) || global.localStorage.getItem(storageKey);
      return parseEncoded(stored);
    } catch (error) {
      return null;
    }
  }

  // 4. The original query-string payload. Vestigial - the app now sends the literal '?message=1'
  //    sentinel purely to satisfy each layout's "is there a message?" guard - but a hand-built
  //    URL carrying a real base64 payload still renders.
  function fromQueryString() {
    try {
      var message = new URLSearchParams(global.location.search).get('message');
      // '1' is the sentinel, not data; decoding it would only log a useless parse error.
      return !message || message === '1' ? null : parseEncoded(message);
    } catch (error) {
      return null;
    }
  }

  // 2. IndexedDB, written by the host alongside the in-memory handoff. This is what makes a
  //    reloaded preview (F5) or a directly-opened /print/... URL work: there is no parent window
  //    to read in either case, and unlike Web Storage the quota here is disk-based rather than
  //    ~5MB. Opened without a version so this reader always attaches to whatever the app created
  //    instead of racing its schema.
  function fromIndexedDb(storageKey, done) {
    var request;
    try {
      if (!('indexedDB' in global)) {
        done(null);
        return;
      }
      request = global.indexedDB.open(DB_NAME);
    } catch (error) {
      done(null);
      return;
    }

    request.onerror = function () {
      done(null);
    };
    request.onsuccess = function () {
      var db = request.result;
      try {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          done(null);
          return;
        }
        var req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(DB_KEY_PREFIX + storageKey);
        // Stored as a structured clone, so it comes back as an object - no decode, no parse.
        req.onsuccess = function () {
          done(req.result || null);
        };
        req.onerror = function () {
          done(null);
        };
      } catch (error) {
        done(null);
      }
    };
  }

  /**
   * Resolves this layout's payload and then calls `onReady(payload)` - which is where the
   * layout does its FIRST render. Called once, at startup.
   *
   * `onReady` receives null when nothing could be resolved; the layouts' existing "no data"
   * guards handle that, same as when the storage read came back empty before.
   */
  global.loadReportPayload = function (storageKey, onReady) {
    function finish(payload) {
      cachedPayload = payload || null;
      onReady(cachedPayload);
    }

    // Tried cheapest-first, and all three synchronous branches are exhausted before falling to
    // the async one - so the in-app case never waits on IndexedDB.
    var immediate = fromParent(storageKey) || fromWebStorage(storageKey) || fromQueryString();
    if (immediate) {
      finish(immediate);
      return;
    }
    fromIndexedDb(storageKey, finish);
  };

  /**
   * The payload, already resolved and already parsed. Synchronous and free, which is what lets
   * the resize / zoom / beforeprint re-renders stay synchronous.
   *
   * Returns the same object every time rather than a defensive copy - copying a bulk-print
   * payload on every re-render would reintroduce exactly the cost this file exists to remove.
   * The layouts only ever fill in missing defaults on it (jsonData.copies), which is
   * idempotent, and the paper-size switch mutates it on purpose.
   */
  global.getReportPayload = function () {
    return cachedPayload;
  };
})(window);
