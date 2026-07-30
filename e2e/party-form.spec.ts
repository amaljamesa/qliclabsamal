import { test, expect } from '@playwright/test';

const API_BASE = 'http://127.0.0.1:8000/api';

test('saving the party form persists the party through the Django API', async ({ page, request }) => {
  const partyName = `Playwright Test Party ${Date.now()}`;

  await page.goto('/parties/new');

  await page.locator('input[name="name"]').fill(partyName);
  await page.locator('input[name="email"]').fill('playwright.test@example.com');
  await page.locator('input[name="cellphone"]').fill('9999999999');

  const [response] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes('/api/parties/') && res.request().method() === 'POST'
    ),
    page.getByRole('button', { name: 'Save' }).click()
  ]);

  // 1. The Django API accepted the POST and created the row.
  expect(response.status()).toBe(201);
  const created = await response.json();
  expect(created.name).toBe(partyName);

  // 2. The UI reflects the successful save.
  await expect(page.getByText(`"${partyName}" saved.`)).toBeVisible();

  // 3. The row is really in the database — fetched back via a fresh API call.
  const listResponse = await request.get(`${API_BASE}/parties/`);
  expect(listResponse.ok()).toBeTruthy();
  const parties = await listResponse.json();
  const saved = parties.find((p: { id: string }) => p.id === created.id);

  expect(saved).toBeTruthy();
  expect(saved.name).toBe(partyName);
  expect(saved.email).toBe('playwright.test@example.com');
});
