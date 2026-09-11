import { test, expect, chromium } from '@playwright/test';

// How many item rows the invoice puts on a sheet must not depend on the zoom the preview happened
// to be at. It did: the cells were left on `line-height: normal`, which Chrome derives from the
// font's metrics and rounds to device pixels, so the same row measured 16.5px at 100% zoom and
// 15.87px at 90%. The rows are budgeted against a fixed page, so a 90% preview put 51 lines on the
// first sheet where 100% puts 48 - and the sheet then held more than the budget had allowed for,
// pushing the footer off the bottom and taking the date and page number with it (Priyanka,
// 2026-09-08, "while zoom changes 2nd time footer date time cut").
//
// The zoom has to be a launch flag: --force-device-scale-factor drives the same glyph rounding a
// real Ctrl+- does, which the deviceScaleFactor context option does not.
//
// One row of slack is deliberate. Pinning the line box takes the spread from three rows to one;
// closing it completely means paginating from measurements the renderer is not involved in at all,
// the way brief-sale now does (report-textwrap.js), which is a much larger change to this layout.
// A single row of drift does not overfill a sheet, which is what the fault was.
const ZOOMS = [0.75, 0.8, 0.9, 1];
const DEMO_INVOICE = 'S-26-00142';

interface Measurement {
  perPage: number[];
  worstFooterPastSheet: number;
  pagesMissingDateRow: number;
  columnWidths: number[];
}

async function measureAtZoom(zoom: number): Promise<Measurement> {
  const browser = await chromium.launch({ args: [`--force-device-scale-factor=${zoom}`] });
  try {
    const page = await browser.newPage();
    await page.goto('http://localhost:4200/invoices');
    await page.waitForTimeout(1500);
    await page.locator('tr.invoice-row').filter({ hasText: DEMO_INVOICE })
      .locator('button[title="View A4/A5 invoice layout"]').click({ timeout: 15000 });
    await page.waitForFunction(() => {
      const frame = document.querySelector('iframe') as HTMLIFrameElement | null;
      return !!frame?.contentDocument?.querySelector('.page');
    }, undefined, { timeout: 25000 });
    await page.waitForTimeout(1500);

    return await page.evaluate(() => {
      const doc = (document.querySelector('iframe') as HTMLIFrameElement).contentDocument!;
      const pages = Array.from(doc.querySelectorAll('.page'));
      let worst = -Infinity;
      let missing = 0;
      for (const pg of pages) {
        const footer = pg.querySelector('.footer-wrapper') as HTMLElement | null;
        // The date and page number sit on the bottom line of the footer, so they are the first
        // thing lost when a sheet holds more than it should.
        if (!pg.querySelector('.additionalFooterRow')) missing++;
        if (!footer) continue;
        worst = Math.max(worst, footer.getBoundingClientRect().bottom - pg.getBoundingClientRect().bottom);
      }
      const table = pages[0].querySelector('.body-table') as HTMLElement;
      return {
        perPage: pages.map((pg) => pg.querySelectorAll('.body-table tbody tr').length),
        worstFooterPastSheet: Math.round(worst * 10) / 10,
        pagesMissingDateRow: missing,
        columnWidths: Array.from(table.rows[0].cells).map(
          (cell) => Math.round((cell as HTMLElement).getBoundingClientRect().width * 100) / 100
        )
      };
    });
  } finally {
    await browser.close();
  }
}

test.describe.configure({ timeout: 180_000 });

test('the invoice puts the same rows on a sheet at every zoom', async () => {
  const results = new Map<number, Measurement>();
  for (const zoom of ZOOMS) {
    results.set(zoom, await measureAtZoom(zoom));
  }

  for (const [zoom, result] of results) {
    expect(result.perPage.length, `${zoom * 100}%: the fixture should span several sheets`)
      .toBeGreaterThan(1);
    expect(result.pagesMissingDateRow, `${zoom * 100}%: every sheet must carry its footer date row`)
      .toBe(0);
    expect(result.worstFooterPastSheet, `${zoom * 100}%: the footer must stay on the sheet`)
      .toBeLessThanOrEqual(0);
  }

  // The first sheet is where the overfill showed: 48 rows at 100%, 51 at 90%.
  const firstSheetCounts = ZOOMS.map((z) => results.get(z)!.perPage[0]);
  const spread = Math.max(...firstSheetCounts) - Math.min(...firstSheetCounts);
  expect(
    spread,
    `rows on the first sheet varied too much across zooms: ${JSON.stringify(
      Object.fromEntries(ZOOMS.map((z, i) => [`${z * 100}%`, firstSheetCounts[i]]))
    )}`
  ).toBeLessThanOrEqual(1);
});

// The columns have to come out the same width at every zoom too. They were declared as
// percentages, which are resolved against the table's used width and rounded to device pixels, so
// they shifted as the zoom moved - the description column measured 494.91px at 100% and 493.96px
// at 75%. Under a tenth of a percent, but a figure that only just fits its column is decided by
// exactly that: a quantity broke into "1157" and "6", and the amount column lost the end of
// "232387.00" (Priyanka, 2026-09-09). They are computed in pixels from the page's own width now.
test('the invoice columns are the same width at every zoom', async () => {
  const widths = new Map<number, number[]>();
  for (const zoom of ZOOMS) {
    widths.set(zoom, (await measureAtZoom(zoom)).columnWidths);
  }

  const reference = widths.get(1)!;
  expect(reference.length, 'the fixture should have several columns').toBeGreaterThan(1);

  for (const [zoom, columns] of widths) {
    expect(columns.length, `${zoom * 100}%: same number of columns`).toBe(reference.length);
    columns.forEach((width, index) => {
      // A hundredth of a pixel is measurement noise; a tenth is enough to move a wrap.
      expect(
        Math.abs(width - reference[index]),
        `${zoom * 100}%: column ${index} was ${width}px against ${reference[index]}px at 100%`
      ).toBeLessThanOrEqual(0.1);
    });
  }
});
