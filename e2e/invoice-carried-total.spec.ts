import { test, expect } from '@playwright/test';
import fs from 'fs';

// When the total row does not fit under the last item it is carried onto a page of its own, and
// that page used to print as a stub: the total at the top, the footer stranded a third of the way
// down the sheet, and everything below it blank (Priyanka, 2026-09-03 - "footer has to be fixed at
// the bottom with blank space in the middle").
//
// Two separate things were wrong. The footer asks to be pushed down with margin-top:auto, but
// generateFooterSection sets that on .footer-wrapper while addSectionToPage drops every section
// inside an anonymous div - so the auto margin sat on a child of the flex item instead of the flex
// item itself. And nothing padded the table out, because the filler that does that on a normal
// page targets .tax-split-section, which is back on the previous page.
//
// What it should look like is what a short invoice already looks like: the table running the
// height of the sheet with the blank in the middle, and the total sitting on the footer.

const DIR = 'C:/Users/DELLLA~1/AppData/Local/Temp/claude/d--Qliclabs/fdeac636-5356-4e46-97af-283e1a94365e/scratchpad';
const INVOICE = JSON.parse(fs.readFileSync(`${DIR}/invoice.json`, 'utf8'));

// 33 items is the count that pushes the total, and nothing else, onto a second page.
const ITEMS_THAT_CARRY_THE_TOTAL = 33;

function payload(itemCount: number) {
  return {
    invoices: [{
      ...INVOICE,
      items: Array.from({ length: itemCount }, (_, i) => ({
        ...INVOICE.items[i % INVOICE.items.length], sl_no: i + 1
      })),
      config: { ...INVOICE.config, print_hsn_summary: false },
      others: { ...INVOICE.others, page_size: 'a4' }
    }]
  };
}

async function render(page: import('@playwright/test').Page, itemCount: number) {
  await page.addInitScript((json: string) => {
    localStorage.setItem('temp_inv_data', btoa(unescape(encodeURIComponent(json))));
  }, JSON.stringify(payload(itemCount)));
  await page.goto('/print/invoice/view/invoice.html?message=1');
  await page.locator('.page').first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(600);
}

const readLastPage = () => {
  const r = (v: number) => Math.round(v * 10) / 10;
  const pages = Array.from(document.querySelectorAll('.page'));
  const last = pages[pages.length - 1] as HTMLElement;
  const box = last.getBoundingClientRect();
  const table = last.querySelector('.body-table') as HTMLElement | null;
  const footer = last.querySelector('.footer-wrapper') as HTMLElement | null;
  const rows = Array.from(last.querySelectorAll('.body-table tbody tr')) as HTMLElement[];
  const totalRow = rows.find((tr) => /Total/.test(tr.textContent || ''));
  // The blank is a row of bordered cells, one per column, so the table's rules run through it.
  const spacer = rows.find((tr) => tr.classList.contains('empty-row') && tr.getBoundingClientRect().height > 100);
  return {
    pageCount: pages.length,
    pageHeight: r(box.height),
    // Distance from the foot of the sheet, which is what "at the bottom" means.
    footerBottomGap: footer ? r(box.bottom - footer.getBoundingClientRect().bottom) : null,
    totalToFooterGap: totalRow && footer
      ? r(footer.getBoundingClientRect().top - totalRow.getBoundingClientRect().bottom)
      : null,
    tableHeight: table ? r(table.getBoundingClientRect().height) : null,
    spacerCells: spacer ? spacer.children.length : 0,
    // A scaled page means the fill overflowed the sheet and the shrink-to-fit pass took over.
    scaled: !!last.querySelector('div[style*="scale("]')
  };
};

test('the carried total sits on the footer with the blank above it', async ({ page }) => {
  await render(page, ITEMS_THAT_CARRY_THE_TOTAL);
  const last = await page.evaluate(readLastPage);

  expect(last.pageCount, 'the fixture should carry the total onto a second page').toBe(2);

  // The footer belongs at the foot of the sheet. It used to sit ~845px above it.
  expect(last.footerBottomGap, 'the footer must print at the bottom of the sheet')
    .toBeLessThanOrEqual(12);

  // And the total immediately above the footer rather than at the top of the page.
  expect(last.totalToFooterGap, 'the total must end up against the footer')
    .toBeLessThanOrEqual(80);

  // The blank is inside the table, spanning every column, so the rules run down the sheet.
  expect(last.spacerCells, 'the blank must be a full row of cells, not one merged cell')
    .toBeGreaterThan(1);
  expect(last.tableHeight, 'the table should run most of the height of the sheet')
    .toBeGreaterThan(last.pageHeight * 0.6);

  // Filling too much would push the page over and trigger the shrink-to-fit scaling.
  expect(last.scaled, 'the page must not have been scaled down to fit').toBe(false);
});

test('a page that ends normally is left alone', async ({ page }) => {
  // Few enough items to fit on one page, where the existing filler already does this job.
  await render(page, 6);
  const last = await page.evaluate(readLastPage);

  expect(last.pageCount).toBe(1);
  expect(last.footerBottomGap, 'the footer still prints at the bottom').toBeLessThanOrEqual(12);
  expect(last.scaled, 'a page that already fits must not be scaled').toBe(false);
});
