// Re-paginates a print layout when the browser's zoom level changes.
//
// Why any of this is needed: these layouts paginate by measuring rendered row heights against a
// page height budget, and a line box's height rounds to whole device pixels. Those fractions
// differ per zoom level and accumulate - over thirty-odd rows a report generated at 75% and then
// viewed at 100% pushes its last rows through the footer underneath. A fixed safety gap was the
// first attempt and could not hold, because the drift has no bounded size to reserve against.
// Measuring again under the new zoom is the only thing that does.
//
// A zoom change is detected by POLLING devicePixelRatio, which is not the obvious choice, so:
// a change in device pixel ratio emits nothing on its own. Not resize, and not a
// `(resolution: Ndppx)` media query change either - both were measured, and both stay silent
// unless the viewport's CSS dimensions also change. They normally do change under browser zoom,
// which is what makes the event route look like it works; but these reports render inside an
// iframe whose CSS width the host preview fixes, so zooming leaves the iframe's viewport exactly
// the same number of CSS pixels wide and no event is ever raised. Polling one float a few times a
// second is cheap and is the only signal that holds here.
//
// The resize listeners are kept as well, so a genuine size change is picked up immediately
// instead of waiting out the poll interval. They cost nothing when the ratio has not moved: the
// check below returns without doing any work, so an ordinary window resize never triggers a
// re-pagination it did not need.
//
// Shared by every layout in public/print/ (each one passes its own render function) rather than
// living in each of them: there are fifteen, and the reasoning above is the sort of thing that
// survives in one place and rots in fifteen.
(function (global) {
  'use strict';

  var POLL_MS = 400;
  // Deliberately shorter than the 200ms debounce the preview wrapper uses to re-fit this
  // iframe (report-preview.component.ts): re-pagination has to finish first, or the wrapper
  // measures a page count that is about to change.
  var DEBOUNCE_MS = 100;
  // The host preview page resizes THIS iframe's own box right before printing and back again
  // after, so 'afterprint' arrives before the box has settled.
  var PRINT_SETTLE_MS = 300;

  /**
   * Calls `regenerate` whenever the zoom level changes. The function must be safe to call
   * repeatedly - every layout's entry point clears its previously generated pages first (see
   * their resetGeneratedContent), which is what makes that true.
   */
  global.watchZoomAndRepaginate = function (regenerate) {
    var lastPixelRatio = global.devicePixelRatio;
    var isPrinting = false;
    var timer;

    function rerender() {
      try {
        var result = regenerate();
        // Some layouts' entry points are async (loading-list), so a rejection would otherwise
        // surface as an unhandled promise rather than something anyone can read.
        if (result && typeof result.catch === 'function') {
          result.catch(function (error) {
            console.error('Could not re-render after a zoom change:', error);
          });
        }
      } catch (error) {
        console.error('Could not re-render after a zoom change:', error);
      }
    }

    function checkZoom() {
      // Re-paginating mid-print would change the page count the print job is built from.
      if (isPrinting || global.devicePixelRatio === lastPixelRatio) {
        return;
      }
      lastPixelRatio = global.devicePixelRatio;
      clearTimeout(timer);
      timer = setTimeout(rerender, DEBOUNCE_MS);
    }

    global.addEventListener('resize', checkZoom);
    if (global.visualViewport) {
      global.visualViewport.addEventListener('resize', checkZoom);
    }
    setInterval(checkZoom, POLL_MS);

    global.addEventListener('beforeprint', function () {
      isPrinting = true;
    });
    global.addEventListener('afterprint', function () {
      setTimeout(function () {
        isPrinting = false;
      }, PRINT_SETTLE_MS);
    });
  };
})(window);
