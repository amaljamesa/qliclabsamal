import { test, expect } from '@playwright/test';
const DIR = 'C:/Users/DELLLA~1/AppData/Local/Temp/claude/d--Qliclabs/fdeac636-5356-4e46-97af-283e1a94365e/scratchpad';

test('all-fields demo renders every column, and the HSN toggle works', async ({ page }) => {
  await page.goto('/reports');
  await page.locator('.report-card').filter({ hasText: 'Invoice - all fields' }).click({ timeout: 15000 });
  await page.waitForFunction(() => {
    const f = document.querySelector('iframe') as HTMLIFrameElement | null;
    return !!f?.contentDocument?.querySelector('.page');
  }, undefined, { timeout: 25000 });
  await page.waitForTimeout(1200);

  const read = () => {
    const doc = (document.querySelector('iframe') as HTMLIFrameElement).contentDocument!;
    const heads = Array.from(doc.querySelectorAll('.body-table thead th')) as HTMLElement[];
    const firstRow = Array.from(doc.querySelectorAll('.body-table tbody tr'))[0];
    return {
      columns: heads.map((th) => (th.textContent || '').trim()),
      // A header wider than the cell holding it is the collision in her screenshot.
      overflowing: heads.filter((th) => th.scrollWidth > th.clientWidth + 1).map((th) => (th.textContent || '').trim()),
      firstRowCells: firstRow ? Array.from(firstRow.children).map((td) => (td.textContent || '').trim()) : [],
      hsnTable: !!doc.querySelector('.hsn-table')
    };
  };

  const on = await page.evaluate(read);
  console.log('COLUMNS ' + JSON.stringify(on.columns));
  console.log('FIRSTROW ' + JSON.stringify(on.firstRowCells));
  console.log('OVERFLOWING ' + JSON.stringify(on.overflowing));
  console.log('HSN-ON ' + on.hsnTable);
  await page.frameLocator('iframe').locator('.page').first().screenshot({ path: `${DIR}/all-fields-hsn-on.png` });

  // Flip the toggle off.
  await page.locator('.hsn-switch input').uncheck({ timeout: 10000 });
  await page.waitForTimeout(2000);
  const off = await page.evaluate(read);
  console.log('HSN-OFF ' + off.hsnTable);

  expect(on.hsnTable).toBe(true);
  expect(off.hsnTable).toBe(false);
});
