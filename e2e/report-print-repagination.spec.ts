import { test, expect, Page } from '@playwright/test';

// The print job was built from a pagination nobody had re-measured.
//
// These layouts choose their page breaks by measuring rendered rows against a fixed page box,
// and .page is overflow:hidden - so a row past the budget is clipped away rather than merely
// overlapping, and the row is gone from the sheet with nothing to show it existed. That is the
// shape of Sabhya's report (2026-09-02): "the previous page displays 50 rows ... the next page
// starts from 53", with the rows between them nowhere in the output.
//
// Pagination held on screen and then went wrong on paper because printing is the one moment the
// report is guaranteed to be laid out for something other than the screen it was measured on:
// the preview resizes the frame from its fixed 1200px to the page's own 794px width, and the
// print engine renders at its own scale rather than the browser's current zoom. Both previously
// happened AFTER the last pagination, and report-zoom.js explicitly refused to re-paginate once
// a print had started - the guard meant to keep the zoom poller out was keeping out the one
// re-measurement the print job needed.
//
// So these tests assert that a re-pagination actually happens on the print path, by tagging the
// pages that exist beforehand and requiring that none of them survive. Geometry alone would not
// catch it: the unfixed code produces clean geometry here too, because this harness cannot drive
// real browser zoom (see the note in report-layout-overlap.spec.ts) - what it can prove is that
// the report re-measures when the print path asks it to, which is what was missing.

const COMPANY = {
  be_name: 'Lakshmi Home Industries', be_addline1: 'Abhiruchi Masala, NH-66, Thallur',
  be_addline2: 'Kundapura Udupi District', be_addline3: '', be_state: 'Karnataka',
  be_pin: '576230', be_phone: '9481977634', be_gstin: '29BOTPS8264Q1ZD'
};

const LONG_NAME = 'MANJUSHREE CHICKEN AND FRESH MUTTON SUPPLIERS - MAVINAKATTE MAIN ROAD BRANCH, MANGALORE DAKSHINA KANNADA';

function briefSalePayload(count: number) {
  return {
    other: {
      from_ref_no: '0', to_ref_no: '0', from_date: '01-Apr-2026', to_date: '07-Aug-2026',
      transaction_type: 'Sales'
    },
    company_details: COMPANY,
    loading_list_details: Array.from({ length: count }, (_, i) => ({
      row_sl: i + 1,
      reference: `HO/S/26/${String(i + 1).padStart(5, '0')}`,
      date: '01-Aug-26',
      paid_topay: 'Credit',
      // Every third row wraps to more than one line, which is what makes the row budget
      // depend on measurement in the first place.
      'Account Name': i % 3 === 0 ? `${LONG_NAME} ${i + 1}` : `D P STORE MAIRKOME - ${i + 1}`,
      value: (100 + i * 7).toFixed(2)
    }))
  };
}

async function seedBriefSale(page: Page, rows: number): Promise<void> {
  await page.addInitScript((json: string) => {
    localStorage.setItem('temp_sale_report', btoa(unescape(encodeURIComponent(json))));
  }, JSON.stringify(briefSalePayload(rows)));
}

test('the layout re-paginates for its own print job', async ({ page }) => {
  await seedBriefSale(page, 140);
  await page.goto('/print/brief-sale/view/brief-sale.html?message=1');
  await page.locator('.page').first().waitFor();

  // A re-render replaces the pages wholesale, so a surviving tag means pagination never re-ran.
  const before = await page.evaluate(() => {
    const pages = Array.from(document.querySelectorAll('.page'));
    pages.forEach((pg) => pg.setAttribute('data-generation', 'first'));
    return pages.length;
  });

  await page.emulateMedia({ media: 'print' });
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));

  const after = await page.evaluate(() => ({
    total: document.querySelectorAll('.page').length,
    stale: document.querySelectorAll('.page[data-generation="first"]').length,
    pagesWithWrongTableCount: Array.from(document.querySelectorAll('.page'))
      .filter((pg) => pg.querySelectorAll('#maintable').length !== 1).length
  }));

  expect(before).toBeGreaterThan(1);
  expect(after.stale, 'printing must trigger a fresh pagination').toBe(0);
  expect(after.total, 'the rebuilt report should still have pages').toBeGreaterThan(1);
  expect(after.pagesWithWrongTableCount, 'one table per page after the rebuild').toBe(0);
});

test('the preview re-paginates the frame it just resized for printing', async ({ page }) => {
  await seedBriefSale(page, 140);
  await page.goto('/print/report/brief-sale');
  await page.waitForFunction(() => {
    const frame = document.querySelector('iframe') as HTMLIFrameElement | null;
    return !!frame?.contentDocument?.querySelector('.page');
  }, undefined, { timeout: 20_000 });

  const before = await page.evaluate(() => {
    const frame = document.querySelector('iframe') as HTMLIFrameElement;
    const pages = Array.from(frame.contentDocument!.querySelectorAll('.page'));
    pages.forEach((pg) => pg.setAttribute('data-generation', 'first'));
    return { pages: pages.length, innerWidth: frame.contentWindow!.innerWidth };
  });

  await page.emulateMedia({ media: 'print' });
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));

  const after = await page.evaluate(() => {
    const frame = document.querySelector('iframe') as HTMLIFrameElement;
    const doc = frame.contentDocument!;
    const pages = Array.from(doc.querySelectorAll('.page'));
    const worst = (pick: (table: DOMRect, other: DOMRect) => number, otherSel: string) =>
      Math.max(...pages.map((pg) => pick(
        pg.querySelector('#maintable')!.getBoundingClientRect(),
        pg.querySelector(otherSel)!.getBoundingClientRect()
      )));
    return {
      pages: pages.length,
      stale: doc.querySelectorAll('.page[data-generation="first"]').length,
      innerWidth: frame.contentWindow!.innerWidth,
      // The frame has to be tall enough for the pages that exist AFTER re-pagination, or the
      // ones past its box are cropped out of the printed document.
      framePx: Math.round(parseFloat(frame.style.height)),
      pagesPx: Math.round(pages.length * 29 * (96 / 2.54)),
      worstOverlap: worst((table, footer) => table.bottom - footer.top, '.Dfoot'),
      worstClip: Math.max(...pages.map((pg) =>
        pg.querySelector('#maintable')!.getBoundingClientRect().bottom - pg.getBoundingClientRect().bottom))
    };
  });

  expect(before.pages).toBeGreaterThan(1);
  // The resize this pagination has to account for: the frame is a fixed 1200px on screen and
  // becomes the page's own natural width for printing.
  expect(before.innerWidth).toBe(1200);
  expect(after.innerWidth, 'the frame is resized to the page width for printing').toBeLessThan(900);
  expect(after.stale, 'the resized frame must be re-paginated before printing').toBe(0);
  expect(after.framePx, 'the frame must fit the pages it now has').toBe(after.pagesPx);
  expect(after.worstOverlap, 'rows must clear the footer on every printed page').toBeLessThanOrEqual(0);
  expect(after.worstClip, 'rows must stay inside the sheet on every printed page').toBeLessThanOrEqual(0);
});
