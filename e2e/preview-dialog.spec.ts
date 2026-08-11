import { test, expect, Page } from '@playwright/test';

// Guards that every preview opens as a dialog in the tab the user is already in, rather than in
// a new browser tab (Vignesh, Slack "Task set of 10-08-2026": "Open preview in same tab using
// modal or dialog").
//
// Each test asserts the same three things, because any one of them failing would put the old
// behaviour back in a way nobody would notice from a screenshot: no second tab is opened, the
// dialog is really on the page the action was triggered from (the list underneath is still in
// the DOM), and the report inside it actually rendered - a dialog around a blank iframe would
// look like a working feature until someone tried to print it.
//
// The PDF export the previews carry is covered in preview-pdf.spec.ts, not here.

// Generous: each preview loads a full print layout, which is slow on a cold dev server.
test.describe.configure({ timeout: 120_000 });

// The report inside the dialog, once its pages exist. Proves the payload handoff through
// storage still works from a dialog - it is the one part of the old new-tab flow that could
// plausibly have depended on a fresh document.
async function expectRenderedReport(page: Page, frameSelector: string): Promise<void> {
  const frame = page.frameLocator(`app-preview-dialog ${frameSelector}`);
  await expect(frame.locator('.page').first()).toBeVisible();
}

test('an invoice row opens its layout as a dialog on the invoice list', async ({ page, context }) => {
  await page.goto('/invoices');

  const previewButton = page.locator('button[title="View A4/A5 invoice layout"]').first();
  await previewButton.waitFor();
  await previewButton.click();

  const dialog = page.locator('app-preview-dialog');
  await expect(dialog).toBeVisible();
  // Names what was opened, so a dialog covering the list is never ambiguous about its contents.
  await expect(dialog.locator('.dialog-title')).toContainText('Invoice');

  // The point of the whole task: same tab, and the list is still there behind the dialog.
  expect(context.pages()).toHaveLength(1);
  await expect(page.locator('app-invoice-list')).toBeAttached();

  await expectRenderedReport(page, 'iframe.invoice-frame');
  // The preview's own toolbar comes with it, rather than the dialog re-implementing it.
  await expect(dialog.locator('#printButton')).toBeVisible();
  await expect(dialog.locator('#pdfButton')).toBeVisible();
  await expect(dialog.locator('#excelButton')).toBeVisible();

  await dialog.locator('.dialog-close').click();
  await expect(dialog).toHaveCount(0);
});

test('the dialog closes on Escape and on a click outside it', async ({ page }) => {
  await page.goto('/invoices');
  const previewButton = page.locator('button[title="View A4/A5 invoice layout"]').first();
  await previewButton.waitFor();

  await previewButton.click();
  await expect(page.locator('app-preview-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('app-preview-dialog')).toHaveCount(0);

  await previewButton.click();
  await expect(page.locator('app-preview-dialog')).toBeVisible();
  await page.locator('app-preview-dialog .dialog-backdrop').click({ position: { x: 5, y: 5 } });
  await expect(page.locator('app-preview-dialog')).toHaveCount(0);
});

test('bulk print opens one dialog covering the whole selection', async ({ page, context }) => {
  await page.goto('/invoices');
  const firstRowCheckbox = page.locator('td.checkbox-td input[type="checkbox"]').first();
  await firstRowCheckbox.waitFor();
  await firstRowCheckbox.check();
  await page.locator('td.checkbox-td input[type="checkbox"]').nth(1).check();

  await page.locator('.bulk-print-btn').click();

  const dialog = page.locator('app-preview-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.dialog-title')).toContainText('2 invoices');
  expect(context.pages()).toHaveLength(1);

  // One continuous run of pages for the batch, not one dialog per invoice.
  const frame = page.frameLocator('app-preview-dialog iframe.invoice-frame');
  await expect(frame.locator('.page').first()).toBeVisible();
  expect(await frame.locator('.page').count()).toBeGreaterThan(1);
});

test('a party ledger opens as a dialog', async ({ page, context }) => {
  await page.goto('/invoices');

  const ledgerButton = page.locator('button[title="View party ledger"]').first();
  await ledgerButton.waitFor();
  await ledgerButton.click();

  const dialog = page.locator('app-preview-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.dialog-title')).toContainText('Ledger - ');
  expect(context.pages()).toHaveLength(1);

  await expectRenderedReport(page, 'iframe.ledger-frame');
});

test('a report layout card opens as a dialog', async ({ page, context }) => {
  await page.goto('/reports');

  await page.locator('.report-card', { hasText: 'Brief Sale Report' }).click();

  const dialog = page.locator('app-preview-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.dialog-title')).toHaveText('Brief Sale Report');
  expect(context.pages()).toHaveLength(1);
  await expect(page.locator('app-report-list')).toBeAttached();

  await expectRenderedReport(page, 'iframe.report-frame');
});

// Printing is the part hosting the preview in a dialog could most easily have broken, and the
// part a screenshot cannot show: the report now shares its document with the ERP shell and the
// dialog's own chrome, all of which have to disappear from a printout, and the iframe has to be
// expanded to its full natural height or only the first screenful reaches the paper.
//
// A print dialog can't be opened in a test, so this drives the same two things a real print
// does - print media, and the beforeprint event the preview listens for - and then measures the
// result in the page.
async function preparePrint(page: Page): Promise<void> {
  await page.emulateMedia({ media: 'print' });
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
}

test('printing from the dialog lays out the whole report and nothing else', async ({ page }) => {
  await page.goto('/invoices');
  const previewButton = page.locator('button[title="View A4/A5 invoice layout"]').first();
  await previewButton.waitFor();
  await previewButton.click();
  await expectRenderedReport(page, 'iframe.invoice-frame');

  await preparePrint(page);

  // The list screen, the sidebar and the header are all still in this document - they must not
  // be on the paper.
  await expect(page.locator('.app-layout-grid')).toBeHidden();
  // Nor should the dialog's own title bar, or the preview's toolbar.
  await expect(page.locator('app-preview-dialog .dialog-header')).toBeHidden();
  await expect(page.locator('app-preview-dialog .preview-toolbar')).toBeHidden();

  // The iframe is expanded to the report's true height (page count x page height) and nothing
  // between it and the page root clips it back down - that clipping is what would otherwise
  // reduce a print to its first screenful.
  const measurements = await page.locator('app-preview-dialog iframe.invoice-frame').evaluate((iframe: HTMLIFrameElement) => {
    const pageCount = iframe.contentDocument!.querySelectorAll('.page').length;
    const height = iframe.getBoundingClientRect().height;
    let clipped = false;
    for (let el: HTMLElement | null = iframe.parentElement; el; el = el.parentElement) {
      const overflow = getComputedStyle(el).overflow;
      if (overflow !== 'visible' && el.getBoundingClientRect().height + 1 < height) {
        clipped = true;
      }
    }
    return { pageCount, height, clipped };
  });

  // 29.7cm per A4 sheet, at the CSS specification's fixed 96px/2.54cm.
  expect(measurements.height).toBeCloseTo(measurements.pageCount * 29.7 * (96 / 2.54), 0);
  expect(measurements.clipped, 'nothing above the iframe may clip its printed height').toBe(false);

  // And the paper size the printout asks for is the report's own, not the browser's default.
  const pageRule = await page.locator('#preview-page-size-style').textContent();
  expect(pageRule).toContain('size: 21cm 29.7cm');
});

// The @page rule above is document-wide, and previews now come and go inside one long-lived
// document instead of each getting a fresh tab - so a rule left behind by the last preview would
// silently print the next one at the wrong paper size. This is the sequence that would catch it:
// an always-A4 ledger, then an A5 invoice.
test('a preview printed after another uses its own paper size', async ({ page }) => {
  await page.goto('/invoices');

  const ledgerButton = page.locator('button[title="View party ledger"]').first();
  await ledgerButton.waitFor();
  await ledgerButton.click();
  await expectRenderedReport(page, 'iframe.ledger-frame');
  await preparePrint(page);
  expect(await page.locator('#preview-page-size-style').textContent()).toContain('size: 21cm 29.7cm');

  await page.emulateMedia({ media: 'screen' });
  await page.keyboard.press('Escape');
  await expect(page.locator('app-preview-dialog')).toHaveCount(0);

  const previewButton = page.locator('button[title="View A4/A5 invoice layout"]').first();
  await previewButton.click();
  await expectRenderedReport(page, 'iframe.invoice-frame');
  await page.locator('app-preview-dialog .switch-button', { hasText: 'A5' }).click();
  await expect(page.locator('app-preview-dialog .switch-button.active')).toHaveText('A5');
  await preparePrint(page);

  // One rule, saying A5 - not two rules with the ledger's A4 still in the document.
  await expect(page.locator('#preview-page-size-style')).toHaveCount(1);
  expect(await page.locator('#preview-page-size-style').textContent()).toContain('size: 14.8cm 21cm');
});

// The scaling is measured from the dialog rather than the viewport, which is the one piece of
// preview behaviour the dialog genuinely changed. Getting it wrong is invisible in a
// screenshot of the top of the report and obvious at its right edge: the report is scaled to a
// width its container doesn't have, and the last column sits outside the dialog.
test('scales the report to fit inside the dialog, not the window', async ({ page }) => {
  await page.goto('/reports');
  await page.locator('.report-card', { hasText: 'Loading List' }).click();

  const dialog = page.locator('app-preview-dialog');
  await expect(dialog).toBeVisible();
  await expectRenderedReport(page, 'iframe.report-frame');

  const panel = await page.locator('app-preview-dialog .dialog-panel').boundingBox();
  const wrapper = await page.locator('app-preview-dialog .frame-wrapper').boundingBox();
  expect(panel).not.toBeNull();
  expect(wrapper).not.toBeNull();
  expect(wrapper!.width).toBeLessThanOrEqual(panel!.width);
  expect(wrapper!.x).toBeGreaterThanOrEqual(panel!.x - 1);
  expect(wrapper!.x + wrapper!.width).toBeLessThanOrEqual(panel!.x + panel!.width + 1);
});
