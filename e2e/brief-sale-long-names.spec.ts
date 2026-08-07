import { test, expect } from '@playwright/test';

// Priyanka's report (Slack, 2026-08-07): long names overlap in the brief sale layout.
//
// The layout used to paginate by a hard-coded 48 rows per page while its content area was
// pinned at height:87%. That assumes every row is exactly one line tall - so a name long
// enough to wrap pushed the table past its box and the rows painted straight over the footer
// sitting underneath it. Pagination now measures what actually rendered.
//
// These assertions are geometric on purpose. Checking rendered rectangles is the only way to
// catch an overlap; asserting on row counts or page counts would have passed happily while
// the report looked broken.

const LONG_NAME = 'MANJUSHREE CHICKEN AND FRESH MUTTON SUPPLIERS - MAVINAKATTE MAIN ROAD BRANCH, MANGALORE DAKSHINA KANNADA';
const UNBROKEN_NAME = 'SUPERCALIFRAGILISTICEXPIALIDOCIOUSTRADINGCOMPANYPRIVATELIMITEDMANGALOREBRANCHNUMBERFOURTEEN';

function buildPayload(rowCount: number) {
  const rows = [];
  for (let i = 1; i <= rowCount; i++) {
    // Every third row wraps, so the break points can never line up with a fixed rows-per-page
    // number - which is what the old pagination assumed.
    let name = `D P STORE MAIRKOME - ${i}`;
    if (i % 3 === 0) {
      name = `${LONG_NAME} ${i}`;
    }
    if (i % 17 === 0) {
      name = UNBROKEN_NAME;
    }
    rows.push({
      row_sl: i,
      reference: `HO/S/26/${String(i).padStart(5, '0')}`,
      date: '01-Aug-26',
      paid_topay: i % 2 ? 'Credit' : 'Cash',
      'Account Name': name,
      value: (100 + i * 7).toFixed(2)
    });
  }
  return {
    other: {
      transaction_type: 'Sale', from_date: '01-Aug-2026', to_date: '07-Aug-2026',
      from_ref_no: '0', to_ref_no: '0'
    },
    company_details: {
      be_name: 'Eprise Activity - Bejai', be_addline1: 'PVS Building', be_addline2: 'Kodialbail',
      be_addline3: '', be_state: 'Karnataka', be_pin: '575003',
      be_phone: '0824-2205235', be_gstin: '29AABCU9603R1ZM'
    },
    loading_list_details: rows
  };
}

async function renderReport(page: import('@playwright/test').Page, rowCount: number) {
  await page.addInitScript((json: string) => {
    localStorage.setItem('temp_sale_report', btoa(unescape(encodeURIComponent(json))));
  }, JSON.stringify(buildPayload(rowCount)));
  await page.goto('/print/brief-sale/view/brief-sale.html?message=1');
  await page.locator('.page').first().waitFor();
}

// Reads the rendered geometry of every page back out of the browser.
async function measure(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    // How many lines a cell's text actually occupies. A Range over the text yields one rect
    // per line box; getClientRects() on the td itself returns a single rect for the whole
    // block box however many lines are inside it, so it can never detect wrapping.
    const lineCount = (el: Element) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return range.getClientRects().length;
    };

    return Array.from(document.querySelectorAll('.page')).map((pg) => {
      const pageDiv = pg.querySelector('.pageDiv') as HTMLElement;
      const table = pg.querySelector('#maintable') as HTMLElement;
      const footer = pg.querySelector('.Dfoot') as HTMLElement;
      const rows = Array.from(pg.querySelectorAll('#maintable tr'));
      return {
        pageBottom: pg.getBoundingClientRect().bottom,
        boxBottom: pageDiv.getBoundingClientRect().bottom,
        tableBottom: table.getBoundingClientRect().bottom,
        tableRight: table.getBoundingClientRect().right,
        pageRight: pg.getBoundingClientRect().right,
        footerTop: footer.getBoundingClientRect().top,
        footerCount: pg.querySelectorAll('.Dfoot').length,
        footerText: (footer.querySelectorAll('p')[1] as HTMLElement)?.innerText ?? '',
        lastRowBottom: rows.length ? rows[rows.length - 1].getBoundingClientRect().bottom : 0,
        dataRowCount: rows.length - 1, // minus the column-header row
        // Bill numbers must stay on one line. The first attempt at the wrap fix applied
        // word-break to every cell, which split them ("HO/S/26/000" / "01") - a regression
        // the geometric overlap checks above were perfectly happy with.
        wrappedReferences: Array.from(pg.querySelectorAll('#maintable td.no-wrap'))
          .filter((td) => lineCount(td) > 1).length,
        // Proves the fixture is actually exercising wrapping - without this the overlap
        // assertions could pass against one-line rows and prove nothing.
        wrappedNames: Array.from(pg.querySelectorAll('#maintable td.buyer-name'))
          .filter((td) => lineCount(td) > 1).length
      };
    });
  });
}

test('long names never overlap the footer in the brief sale layout', async ({ page }) => {
  await renderReport(page, 140);
  const pages = await measure(page);

  expect(pages.length).toBeGreaterThan(1);
  // The fixture has to actually produce wrapped rows, or everything below is vacuous.
  expect(pages.reduce((sum, p) => sum + p.wrappedNames, 0)).toBeGreaterThan(0);

  for (const [index, p] of pages.entries()) {
    // The actual bug: the last row's bottom edge crossing into the footer.
    expect(p.lastRowBottom, `page ${index + 1}: last row overlaps the footer`).toBeLessThanOrEqual(p.footerTop);
    // The table must stay inside the box reserved for it.
    expect(p.tableBottom, `page ${index + 1}: table overflows its content box`).toBeLessThanOrEqual(p.boxBottom + 1);
    // And inside the sheet, so nothing is silently clipped by .page's overflow:hidden.
    expect(p.tableBottom, `page ${index + 1}: table overflows the sheet`).toBeLessThanOrEqual(p.pageBottom);
    // An unbroken name must wrap rather than widen the table off the page.
    expect(p.tableRight, `page ${index + 1}: table overflows the sheet horizontally`).toBeLessThanOrEqual(p.pageRight);
    // Exactly one footer per page - body() footers each page as it opens, so a stray
    // top-level footer() call would double them up.
    expect(p.footerCount, `page ${index + 1}: should have exactly one footer`).toBe(1);
    expect(p.wrappedReferences, `page ${index + 1}: bill no / date / amount must not wrap`).toBe(0);
  }
});

test('no rows are dropped or duplicated by the new pagination', async ({ page }) => {
  const rowCount = 140;
  await renderReport(page, rowCount);
  const pages = await measure(page);

  // Every data row, plus the single grand-total row at the end.
  const rendered = pages.reduce((sum, p) => sum + p.dataRowCount, 0);
  expect(rendered).toBe(rowCount + 1);

  // Each source row appears exactly once, in order.
  const references = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#maintable tr td:nth-child(2)'))
      .map((td) => (td as HTMLElement).innerText.trim())
      .filter((value) => value.startsWith('HO/S/26/'))
  );
  expect(references.length).toBe(rowCount);
  expect(new Set(references).size).toBe(rowCount);
  expect(references[0]).toBe('HO/S/26/00001');
  expect(references[rowCount - 1]).toBe(`HO/S/26/00140`);
});

test('every footer reports the real page count', async ({ page }) => {
  await renderReport(page, 140);
  const pages = await measure(page);

  // The old fixed estimate (ceil(rows / 48)) no longer matches how many pages a report with
  // wrapping names actually needs, so every footer has to be rewritten from the real total.
  pages.forEach((p, index) => {
    expect(p.footerText.replace(/\s+/g, ' ').trim()).toBe(`Page : ${index + 1} of ${pages.length}`);
  });
});

test('a name too long for a whole page does not hang the report', async ({ page }) => {
  // A single row taller than an entire page can never fit anywhere. Moving it to a fresh page
  // would overflow that one too, and so on forever - the guard in body() has to stop that.
  await page.addInitScript(() => {
    const payload = {
      other: { transaction_type: 'Sale', from_date: '01-Aug-2026', to_date: '07-Aug-2026', from_ref_no: '0', to_ref_no: '0' },
      company_details: { be_name: 'Eprise', be_addline1: '', be_addline2: '', be_addline3: '', be_state: '', be_pin: '', be_phone: '', be_gstin: '' },
      loading_list_details: [
        { row_sl: 1, reference: 'HO/S/26/00001', date: '01-Aug-26', paid_topay: 'Cash', 'Account Name': 'SHORT NAME', value: '10.00' },
        { row_sl: 2, reference: 'HO/S/26/00002', date: '01-Aug-26', paid_topay: 'Cash', 'Account Name': 'X'.repeat(60000), value: '20.00' },
        { row_sl: 3, reference: 'HO/S/26/00003', date: '01-Aug-26', paid_topay: 'Cash', 'Account Name': 'ANOTHER SHORT NAME', value: '30.00' }
      ]
    };
    localStorage.setItem('temp_sale_report', btoa(unescape(encodeURIComponent(JSON.stringify(payload)))));
  });
  await page.goto('/print/brief-sale/view/brief-sale.html?message=1');

  // Rendering at all is the assertion: before the guard this looped until the tab died.
  await page.locator('.page').first().waitFor({ timeout: 10_000 });
  const pageCount = await page.locator('.page').count();
  expect(pageCount).toBeGreaterThan(0);
  expect(pageCount).toBeLessThan(50);

  // The rows either side of the oversized one must still be there.
  const body = await page.locator('body').innerText();
  expect(body).toContain('SHORT NAME');
  expect(body).toContain('ANOTHER SHORT NAME');
});
