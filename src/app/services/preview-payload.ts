import { kvSet } from './kv-store.util';

// How a print layout gets the JSON it renders.
//
// The layouts under public/print/ are standalone HTML files hosted in a same-origin iframe by
// the preview components, so they can read a live JS object straight off their parent window.
// That is what this module exposes: `payloads` holds the very object the app already built,
// and the layout reads it through `window.parent.__qlPreviewPayload(key)` - see
// public/assets/js/report-payload.js for the layout half.
//
// Why not the two routes this replaces:
//
//  - Base64 in the query string froze the app. `encodeURIComponent` can triple a payload's
//    length (every '₹' becomes '%E2%82%B9') before base64 adds another third on top, all
//    synchronously on the main thread, and browsers cap a URL well below the result.
//  - Base64 in sessionStorage/localStorage fixed the freeze but inherited Web Storage's ~5MB
//    *per-origin* ceiling, shared with every other feature in the app. A single invoice is
//    tens of KB, so it was never hit there - but bulk print repeats a full payload per
//    selected invoice, and somewhere around 250 of them the write throws QuotaExceededError
//    and the preview renders blank.
//
// Handing over an object reference costs nothing: no JSON.stringify, no encodeURIComponent, no
// btoa, no structured clone, no quota. It is the only handoff here that is O(1) in the size of
// the payload rather than O(n), which is what removes the ceiling rather than just raising it.
//
// Lifetime is deliberately the same as the sessionStorage it replaces: a payload stays until
// the next preview overwrites it under the same key. Clearing on dialog close was considered
// and left out - AppComponent closes the dialog on every NavigationEnd, so a close-clears rule
// would race the frame that is still loading.
const payloads = new Map<string, unknown>();

// The layouts reach this through window.parent, so it has to be on the window rather than a
// module export. Installed once at load: a layout that boots before any preview has been
// opened then gets a clean null instead of a TypeError on an undefined function.
(window as unknown as Record<string, unknown>)['__qlPreviewPayload'] = (key: string): unknown =>
  payloads.get(key) ?? null;

/**
 * Makes `data` the payload for `key` - the key being whichever storage key that layout already
 * looks itself up by (see REPORT_TARGETS in report-print.service). Must be called *before* the
 * iframe's src is set, which is what every caller does by opening the preview dialog after.
 *
 * Also mirrored into IndexedDB, fire-and-forget, so a reloaded or directly-opened /print/ URL
 * still finds it - there is no parent window to read in that case. Not awaited: it is a backup
 * path, and nothing about opening a preview should wait on a disk write.
 */
export function setPreviewPayload(key: string, data: unknown): void {
  payloads.set(key, data);
  void kvSet(dbKey(key), data);
}

/** The payload currently held for `key`, or null. Synchronous - it is just a map read. */
export function getPreviewPayload<T = unknown>(key: string): T | null {
  return (payloads.get(key) as T) ?? null;
}

/**
 * Takes the payload back off a layout that has already resolved one, if this window has none
 * for that key.
 *
 * Covers the case where the app itself was reloaded (F5 on /print/invoice-preview, say): the
 * map starts empty, but the iframe resolves its own payload from IndexedDB and holds the
 * parsed object. Reading it back keeps the host-side consumers - the Excel export and the PDF
 * filename, both of which read the payload rather than the rendered DOM - working across a
 * reload exactly as they did when sessionStorage survived it.
 *
 * Same-origin, so `contentWindow` is readable; wrapped anyway because a frame that failed to
 * load has no usable document and must not take the caller down with it.
 */
export function adoptPayloadFromFrame(key: string, frame: HTMLIFrameElement | null): void {
  if (!frame || payloads.has(key)) {
    return;
  }
  try {
    const getter = (frame.contentWindow as unknown as Record<string, unknown> | null)?.[
      'getReportPayload'
    ];
    const data = typeof getter === 'function' ? (getter as () => unknown)() : null;
    if (data) {
      payloads.set(key, data);
    }
  } catch {
    // Cross-origin or a frame that never loaded - the consumers already handle a null payload.
  }
}

// Namespaced so preview payloads can't collide with the branding/promotion config that also
// lives in this IndexedDB store (see kv-store.util).
function dbKey(key: string): string {
  return `preview:${key}`;
}
