import { test, expect } from '@playwright/test';
import fs from 'fs';

// The HSN tax summary was printing underneath the footer, and being clipped away by the overflow
// cap that guards it - "HSN summary hidden under footer" (Urgent, 2026-09-03). The footer's height
// is measured into a hidden probe, and everything the body may occupy is the page minus that
// number, so a footer that measures short hands the body space it does not have.
//
// What measured short was the payment QR. Its container took its size entirely from whatever the
// QR library had put inside it, and the real qrcodejs build finishes asynchronously - it draws to
// a canvas, then sets an <img> from canvas.toDataURL(), and that image has no height until the
// data URL loads. Anything measuring before then sees a footer up to 90px shorter than the one
// that prints.
//
// This repo ships a placeholder QR library that renders a grey box synchronously, which is why
// the fault never appeared here. The route override below stands in for the real one by rendering
// NOTHING, which is the same thing the real library looks like at probe time.

const INVOICE = JSON.parse(fs.readFileSync(
  'C:/Users/DELLLA~1/AppData/Local/Temp/claude/d--Qliclabs/fdeac636-5356-4e46-97af-283e1a94365e/scratchpad/invoice.json',
  'utf8'
));

const UPI = 'upi://pay?pa=sunshine@hdfcbank&pn=Sunshine%20Limited';

// `fill` pads the summary out so it ends near the foot of the page, which is where a short
// reserve turns into a collision rather than just wasted space.
function payload(pageSize: 'a4' | 'a5', withUpi: boolean, fill = 0) {
  const tax_details = fill
    ? Array.from({ length: fill }, (_, i) => ({ ...INVOICE.tax_details[i % INVOICE.tax_details.length] }))
    : INVOICE.tax_details;
  return {
    invoices: [{
      ...INVOICE,
      tax_details,
      others: { ...INVOICE.others, page_size: pageSize, upi_id: withUpi ? UPI : '' }
    }]
  };
}

async function seed(page: import('@playwright/test').Page, pageSize: 'a4' | 'a5', withUpi: boolean, fill = 0) {
  await page.addInitScript((json: string) => {
    localStorage.setItem('temp_inv_data', btoa(unescape(encodeURIComponent(json))));
  }, JSON.stringify(payload(pageSize, withUpi, fill)));
}

// Stands in for a QR library that has not finished rendering when the footer is measured.
async function stubSlowQrLibrary(page: import('@playwright/test').Page) {
  await page.route('**/assets/js/qrcode.min.js', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: 'function QRCode() { /* renders later */ }' })
  );
}

const readFooter = () => {
  const footer = document.querySelector('.footer-wrapper') as HTMLElement;
  const qr = footer.querySelector('div[id^="qrcode-"]') as HTMLElement | null;
  return {
    footerHeight: Math.round(footer.getBoundingClientRect().height * 10) / 10,
    qrHeight: qr ? Math.round(qr.getBoundingClientRect().height * 10) / 10 : null
  };
};

for (const [pageSize, qrSize] of [['a4', 90], ['a5', 70]] as const) {
  test(`${pageSize}: the footer reserves the QR square even before it renders`, async ({ page }) => {
    await stubSlowQrLibrary(page);
    await seed(page, pageSize, true);
    await page.goto('/print/invoice/view/invoice.html?message=1');
    await page.locator('.page').first().waitFor({ timeout: 20000 });
    await page.waitForTimeout(600);

    const withQr = await page.evaluate(readFooter);
    expect(withQr.qrHeight, 'the QR box must hold its square with nothing inside it')
      .toBeGreaterThanOrEqual(qrSize);
  });

  // A guard rather than a reproduction, and worth being clear about which: it passes against the
  // unfixed layout too, because with this fixture the summary's own row-level pagination carries
  // the overflow onto the next page before it can reach the footer. The reserve test above is the
  // one that fails without the fix (14px measured where 90 is needed). This one holds the outcome
  // the customer actually cares about - a summary that is on the paper and clear of the footer -
  // for the data where the two are not so forgiving.
  test(`${pageSize}: the HSN summary stays clear of the footer`, async ({ page }) => {
    await stubSlowQrLibrary(page);
    await seed(page, pageSize, true, 9);
    await page.goto('/print/invoice/view/invoice.html?message=1');
    await page.locator('.page').first().waitFor({ timeout: 20000 });
    await page.waitForTimeout(600);

    const pages = await page.evaluate(() => {
      const r = (v: number) => Math.round(v * 10) / 10;
      return Array.from(document.querySelectorAll('.page')).map((pg, index) => {
        const hsn = pg.querySelector('.hsn-table') as HTMLElement | null;
        const footer = pg.querySelector('.footer-wrapper') as HTMLElement | null;
        const body = pg.querySelector('.body') as HTMLElement | null;
        return {
          page: index + 1,
          hasHsn: !!hsn,
          // Positive means the summary has run into the footer.
          pastFooter: hsn && footer
            ? r(hsn.getBoundingClientRect().bottom - footer.getBoundingClientRect().top)
            : null,
          // The cap that hides the overflow rather than moving it. If it ever fires on a page
          // carrying the summary, rows have been dropped from the printout.
          clipped: !!(body && body.style.overflow === 'hidden' && hsn)
        };
      });
    });

    const carrying = pages.filter((p) => p.hasHsn);
    expect(carrying.length, 'the fixture should print an HSN summary').toBeGreaterThan(0);
    for (const p of carrying) {
      expect(p.pastFooter, `page ${p.page}: the HSN summary must not run into the footer`)
        .toBeLessThanOrEqual(0);
      expect(p.clipped, `page ${p.page}: the summary must never be clipped away`).toBe(false);
    }
  });
}
