// Counts how many lines a cell's text will occupy, WITHOUT asking the renderer.
//
// Why this exists: these reports paginate by row height, and a row's height is decided by how
// many lines its longest cell wraps to. Measuring that from the rendered DOM makes pagination
// depend on the zoom level the report happened to be generated at - Chrome computes glyph
// advance widths against the device scale, so the same name measures 313.39px at 70% zoom and
// 313.73px at 100%. A name sitting near the column edge therefore wraps at one zoom and not at
// another, which moves a page break by a row. Printing always renders at 100% whatever the
// browser is zoomed to, so a report paginated at 80% printed different page breaks than the ones
// on screen (Amal, Slack 2026-09-03).
//
// canvas measureText is the way out: it reports the font's own advance widths and returns the
// same number at every zoom level - verified identical to three decimals at 70%, 80%, 90%, 100%
// and 125%. Pagination built on it gives the same answer everywhere, which is the whole point.
//
// The simulation is deliberately PESSIMISTIC where it cannot be exact. Undercounting lines is
// the dangerous direction: it puts a row on a page that cannot hold it, and .page is
// overflow:hidden, so the row is not pushed to the next sheet - it silently disappears. The
// safety margin below biases every borderline case towards one more line.
(function (global) {
  'use strict';

  // Shaves a hair off the usable width so a string that measures a whisker under the column
  // edge is treated as wrapping. Canvas advance widths and the layout engine's own line
  // breaking agree closely but not to the last sub-pixel, and this covers the difference in the
  // safe direction: an extra line costs a row of space, a missing one costs the row itself.
  var WIDTH_SAFETY_PX = 1;

  /**
   * Builds a line counter for one column.
   *
   * @param font   a CSS font shorthand, e.g. "13px Arial, Helvetica, sans-serif". Read off a
   *               rendered cell rather than written by hand, so it cannot drift from the CSS.
   * @param width  the column's usable text width in CSS px.
   * @param breakAnywhere  true when the cell may break mid-word (the layouts set
   *                       overflow-wrap:anywhere on their name columns so a single unbroken
   *                       name cannot widen the column).
   */
  global.createLineCounter = function (font, width, breakAnywhere) {
    var context = document.createElement('canvas').getContext('2d');
    context.font = font;

    var usable = Math.max(1, width - WIDTH_SAFETY_PX);
    var cache = {};

    function measure(text) {
      var cached = cache[text];
      if (cached === undefined) {
        cached = context.measureText(text).width;
        cache[text] = cached;
      }
      return cached;
    }

    // How many lines one unbreakable run takes when it is wider than the column. Only reachable
    // with breakAnywhere - without it CSS lets the run overflow rather than splitting it.
    function linesForOverlongWord(word) {
      var lines = 1;
      var current = '';
      for (var i = 0; i < word.length; i++) {
        var next = current + word[i];
        if (measure(next) > usable && current !== '') {
          lines++;
          current = word[i];
        } else {
          current = next;
        }
      }
      return lines;
    }

    return function countLines(value) {
      var text = (value === null || value === undefined) ? '' : String(value).trim();
      if (text === '') {
        return 1;
      }
      if (measure(text) <= usable) {
        return 1;
      }

      // Break opportunities as CSS sees them: after a space, and after a hyphen. The account
      // names in these reports are full of both ("... STORE - SHIROOR VILLAGE, ...").
      var tokens = text.split(/(?<=[\s-])/);
      var lines = 1;
      var current = '';

      for (var i = 0; i < tokens.length; i++) {
        var token = tokens[i];
        var candidate = current + token;
        if (measure(candidate.replace(/\s+$/, '')) <= usable) {
          current = candidate;
          continue;
        }

        var word = token.replace(/^\s+/, '');
        if (breakAnywhere && measure(word.replace(/\s+$/, '')) > usable) {
          // The token alone overflows the column, so it is split across lines of its own.
          if (current !== '') {
            lines++;
          }
          lines += linesForOverlongWord(word.replace(/\s+$/, '')) - 1;
          current = '';
          continue;
        }

        lines++;
        current = word;
      }

      return lines;
    };
  };
})(window);
