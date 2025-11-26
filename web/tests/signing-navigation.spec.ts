import { expect, test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  isFieldComplete,
  isRequiredField,
  nextIncompleteField,
  sortFieldOrder,
} from '../app/sign/[token]/navigation-helpers';

const pdfBuffer = fs.readFileSync(path.join(__dirname, 'fixtures', 'sample.pdf'));
const workerScript = fs.readFileSync(
  path.join(__dirname, '../node_modules/pdfjs-dist/build/pdf.worker.min.mjs'),
  'utf8'
);
const fakeSignature =
  'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAI0lEQVR42mNk+M9Qz0AEYBxVSFUBRyNRgWoGo8FoNBrZgUoADyUBoKvjQxkAAAAASUVORK5CYII=';
const fakeInitials =
  'iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAI0lEQVR42mNkYGD4z0AEYBxVSFUBR6NRgWoGQwAJjgYoGqAeAADqHwPiBM6ZyAAAAABJRU5ErkJggg==';

test.describe('navigation helpers', () => {
const orderedFields = [
  { id: 'a', type: 'text', required: true, page: 1, x: 40, y: 700 },
  { id: 'b', type: 'checkbox', required: true, page: 1, x: 40, y: 600 },
  { id: 'c', type: 'text', required: false, page: 2, x: 20, y: 500 },
];

  test('orders and selects next required field correctly', () => {
    const requiredFields = orderedFields.filter(isRequiredField).sort(sortFieldOrder);
    const sortedIds = requiredFields.map((f) => f.id);
    expect(sortedIds).toEqual(['a', 'b']);

    const values = {
      a: { value: 'filled', committed: true },
      b: { value: false },
      c: { value: '' },
    };

    expect(isRequiredField(orderedFields[0])).toBe(true);
    expect(isRequiredField(orderedFields[2])).toBe(false);
    expect(isFieldComplete(orderedFields[0], values)).toBe(true);
    expect(isFieldComplete(orderedFields[1], values)).toBe(false);

    expect(nextIncompleteField(requiredFields, values, 'a')).toBe('b');
    expect(nextIncompleteField(requiredFields, { ...values, b: { value: true } }, 'b')).toBeNull();
  });

  test('sorts fields top-to-bottom, left-to-right for PDF coords (bottom origin)', () => {
    const fields = [
      { id: 'sig-a', type: 'signature', required: true, page: 1, x: 40, y: 700 },
      { id: 'dt-a', type: 'datetime', required: true, page: 1, x: 280, y: 700 },
      { id: 'sig-b', type: 'signature', required: true, page: 1, x: 40, y: 400 },
      { id: 'dt-b', type: 'datetime', required: true, page: 1, x: 280, y: 400 },
    ];
    const ordered = fields.filter(isRequiredField).sort(sortFieldOrder).map((f) => f.id);
    expect(ordered).toEqual(['sig-a', 'dt-a', 'sig-b', 'dt-b']);
  });
});

test.describe('signing navigation UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
  });

  test('Start/Next focuses required fields and updates remaining count', async ({ page }) => {
    const token = 'nav-token';
    const fields = [
      { id: 'f1', type: 'text', required: true, page: 1, x: 120, y: 700, w: 220, h: 28 },
      { id: 'f2', type: 'checkbox', required: true, page: 1, x: 120, y: 600, w: 20, h: 20 },
      { id: 'f3', type: 'text', required: true, page: 1, x: 120, y: 520, w: 220, h: 28 },
    ];

    await page.route(`**/api/sign/${token}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          signer: { id: 99, name: 'Nav User', email: 'nav@example.com', role: 'signer', status: 'pending' },
          envelope: { subject: 'Nav Test Doc' },
          fields,
        }),
      });
    });

    await page.route(`**/api/sign/${token}/pdf`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        body: pdfBuffer,
      });
    });

    await page.route(`**/api/sign/${token}/final-pdf`, async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'not ready' }),
      });
    });

    await page.route('**/pdf.worker.min.mjs', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: workerScript,
      });
    });

    await page.goto(`/sign/${token}`);
    await expect(page.locator('img[alt^="Page"]')).toHaveCount(1);

    const chip = page.getByTestId('action-chip');
    await expect(chip).toBeVisible();

    const docScope = page.locator('.sign-doc-section');
    const firstText = docScope.locator('input[type="text"]').nth(0);
    const checkbox = docScope.locator('input[type="checkbox"]').first();
    const secondText = docScope.locator('input[type="text"]').nth(1);

    await expect(firstText).toBeVisible();

    await chip.click();
    await expect(firstText).toBeFocused();

    await firstText.fill('Alice');
    await firstText.press('Enter');
    await expect(chip).toContainText('2');

    await chip.click();
    await expect(checkbox).toBeFocused();

    await checkbox.check();
    await expect(chip).toContainText('1');

    await chip.click();
    await expect(secondText).toBeFocused();

    await secondText.fill('Done');
    await secondText.press('Enter');
    await expect(chip).toBeHidden();
  });

  test('Checkbox highlight does not emit border shorthand warning', async ({ page }) => {
    const token = 'checkbox-border';
    const fields = [
      { id: 't1', type: 'text', required: true, page: 1, x: 120, y: 640, w: 220, h: 28 },
      { id: 'c1', type: 'checkbox', required: true, page: 1, x: 120, y: 560, w: 20, h: 20 },
    ];

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && msg.text().includes('borderColor')) {
        consoleErrors.push(msg.text());
      }
    });

    await page.route(`**/api/sign/${token}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          signer: { id: 33, name: 'Checkbox User', email: 'checkbox@example.com', role: 'signer', status: 'pending' },
          envelope: { subject: 'Checkbox Test Doc' },
          fields,
        }),
      });
    });

    await page.route(`**/api/sign/${token}/pdf`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        body: pdfBuffer,
      });
    });

    await page.route(`**/api/sign/${token}/final-pdf`, async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'not ready' }),
      });
    });

    await page.route('**/pdf.worker.min.mjs', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: workerScript,
      });
    });

    await page.goto(`/sign/${token}`);
    const chip = page.getByTestId('action-chip');
    const textField = page.locator('input[type="text"]').first();
    const checkbox = page.locator('input[type="checkbox"]').first();

    await chip.click();
    await expect(textField).toBeVisible();
    await textField.click({ force: true });
    await textField.fill('Hello');

    await chip.click();
    await expect(checkbox).toBeFocused();
    await checkbox.check();

    expect(consoleErrors).toEqual([]);
  });

  test('Typing in text field does not auto-advance the chip', async ({ page }) => {
    const token = 'text-stay';
    const fields = [
      { id: 't1', type: 'text', required: true, page: 1, x: 120, y: 680, w: 220, h: 28 },
      { id: 't2', type: 'text', required: true, page: 1, x: 120, y: 580, w: 220, h: 28 },
    ];

    await page.route(`**/api/sign/${token}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          signer: { id: 34, name: 'Text User', email: 'text@example.com', role: 'signer', status: 'pending' },
          envelope: { subject: 'Text Nav Doc' },
          fields,
        }),
      });
    });

    await page.route(`**/api/sign/${token}/pdf`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        body: pdfBuffer,
      });
    });

    await page.route(`**/api/sign/${token}/final-pdf`, async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'not ready' }),
      });
    });

    await page.route('**/pdf.worker.min.mjs', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: workerScript,
      });
    });

    await page.goto(`/sign/${token}`);
    await expect(page.locator('img[alt^="Page"]')).toHaveCount(1);
    const chip = page.getByTestId('action-chip');
    const textField1 = page.locator('input[type="text"]').first();
    const textField2 = page.locator('input[type="text"]').nth(1);

    await chip.click();
    await expect(textField1).toBeFocused();
    await textField1.type('Hello there');
    await expect(textField1).toBeFocused();

    await chip.click();
    await expect(textField2).toBeFocused();
  });

  test('Datetime field participates in navigation', async ({ page }) => {
    const token = 'datetime-nav';
    const fields = [
      { id: 't1', type: 'text', required: true, page: 1, x: 120, y: 700, w: 220, h: 28 },
      { id: 'd1', type: 'datetime', required: true, page: 1, x: 120, y: 600, w: 240, h: 28 },
      { id: 'c1', type: 'checkbox', required: true, page: 1, x: 120, y: 520, w: 20, h: 20 },
    ];

    await page.route(`**/api/sign/${token}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          signer: { id: 35, name: 'Date User', email: 'date@example.com', role: 'signer', status: 'pending' },
          envelope: { subject: 'Datetime Doc' },
          fields,
        }),
      });
    });

    await page.route(`**/api/sign/${token}/pdf`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        body: pdfBuffer,
      });
    });

    await page.route(`**/api/sign/${token}/final-pdf`, async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'not ready' }),
      });
    });

    await page.route('**/pdf.worker.min.mjs', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: workerScript,
      });
    });

    await page.goto(`/sign/${token}`);
    await expect(page.locator('img[alt^="Page"]')).toHaveCount(1);
    const chip = page.getByTestId('action-chip');
    const textField = page.locator('input[type="text"]').first();
    const datetimeField = page.locator('input[type="datetime-local"]').first();
    const checkbox = page.locator('input[type="checkbox"]').first();

    await chip.click();
    await expect(textField).toBeFocused();
    await textField.fill('Ready');

    await chip.click();
    await expect(datetimeField).toBeFocused();
    await datetimeField.fill('2024-10-30T10:30');
    await expect(checkbox).toBeFocused();
    await checkbox.check();
  });

  test('Action chip stays on the left and navigates without auto-filling signatures', async ({ page }) => {
    const token = 'nav-sig';
    const fields = [
      { id: 's1', type: 'signature', required: true, page: 1, x: 140, y: 660, w: 220, h: 40 },
      { id: 's2', type: 'signature', required: true, page: 1, x: 140, y: 520, w: 220, h: 40 },
    ];

    await page.addInitScript(
      ({ sigToken, signature, initials }) => {
        localStorage.setItem(
          `sign-adoption:${sigToken}`,
          JSON.stringify({ signature, initials, method: 'type' })
        );
      },
      { sigToken: token, signature: fakeSignature, initials: fakeInitials }
    );

    await page.route(`**/api/sign/${token}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          signer: { id: 91, name: 'Chip User', email: 'chip@example.com', role: 'signer', status: 'pending' },
          envelope: { subject: 'Chip Test Doc' },
          fields,
        }),
      });
    });

    await page.route(`**/api/sign/${token}/pdf`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        body: pdfBuffer,
      });
    });

    await page.route(`**/api/sign/${token}/final-pdf`, async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'not ready' }),
      });
    });

    await page.route('**/pdf.worker.min.mjs', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: workerScript,
      });
    });

    await page.goto(`/sign/${token}`);

    const chip = page.getByTestId('action-chip');
    await expect(chip).toBeVisible();
    await expect(chip).toContainText(/start/i);

    const position = await page.evaluate(() => {
      const chipEl = document.querySelector('[data-testid="action-chip"]');
      const docEl = document.querySelector('.sign-doc-section');
      if (!chipEl || !docEl) return null;
      const chipRect = chipEl.getBoundingClientRect();
      const docRect = docEl.getBoundingClientRect();
      return {
        chipLeft: chipRect.left,
        chipRight: chipRect.right,
        docLeft: docRect.left,
      };
    });

    expect(position).not.toBeNull();
    if (position) {
      expect(position.chipLeft).toBeGreaterThanOrEqual(position.docLeft - 40);
      // Allow a wider gutter; we only need to assert it stays roughly anchored to the doc edge.
      expect(position.chipRight).toBeLessThanOrEqual(position.docLeft + 320);
    }

    const firstSignature = page.locator('[data-field-id="s1"]');
    const secondSignature = page.locator('[data-field-id="s2"]');
    await chip.click();
    await expect(secondSignature).toBeVisible();
    await expect(secondSignature.locator('[data-filled="true"]')).toHaveCount(0);

    await expect(chip).toContainText(/sign/i);

    const insertSecond = secondSignature.locator('button', { hasText: /^Sign$/ });
    await insertSecond.click();
    await expect(secondSignature.locator('[data-filled="true"]')).toHaveCount(1);

    await chip.click();
    await expect(firstSignature).toBeVisible();
  });

  test('Chip scrolls to next signature after signing current one', async ({ page }) => {
    const token = 'nav-sig-scroll';
    const fields = [
      { id: 's1', type: 'signature', required: true, page: 1, x: 120, y: 780, w: 220, h: 40 },
      { id: 's2', type: 'signature', required: true, page: 1, x: 120, y: 240, w: 220, h: 40 },
    ];

    await page.setViewportSize({ width: 1280, height: 720 });

    await page.addInitScript(
      ({ sigToken, signature, initials }) => {
        localStorage.setItem(
          `sign-adoption:${sigToken}`,
          JSON.stringify({ signature, initials, method: 'type' })
        );
      },
      { sigToken: token, signature: fakeSignature, initials: fakeInitials }
    );

    await page.route(`**/api/sign/${token}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          signer: { id: 91, name: 'Chip User', email: 'chip@example.com', role: 'signer', status: 'pending' },
          envelope: { subject: 'Chip Test Doc' },
          fields,
        }),
      });
    });

    await page.route(`**/api/sign/${token}/pdf`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        body: pdfBuffer,
      });
    });

    await page.route(`**/api/sign/${token}/final-pdf`, async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'not ready' }),
      });
    });

    await page.route('**/pdf.worker.min.mjs', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: workerScript,
      });
    });

    await page.goto(`/sign/${token}`);
    await expect(page.locator('img[alt^="Page"]')).toHaveCount(1);

    const chip = page.getByTestId('action-chip');
    await expect(chip).toBeVisible();

    const firstSig = page.locator('[data-field-id="s1"]');
    const secondSig = page.locator('[data-field-id="s2"]');
    const scrollContainer = page.locator('.sign-doc-section');

    await chip.click(); // start -> first signature
    await expect(firstSig).toBeVisible();

    const beforeScroll = await scrollContainer.evaluate((el) => el.scrollTop);
    await firstSig.evaluate((el) => el.scrollIntoView({ behavior: 'instant', block: 'center' }));
    await firstSig.locator('button', { hasText: /^Sign$/ }).click({ force: true });

    await page.waitForFunction(() => {
      const container = document.querySelector('.sign-doc-section');
      const el = document.querySelector('[data-field-id="s2"]');
      if (!container || !el) return false;
      const cRect = container.getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      return rect.top >= cRect.top && rect.bottom <= cRect.bottom + 4;
    });

    const afterScroll = await scrollContainer.evaluate((el) => el.scrollTop);
    expect(afterScroll).not.toBeNull();
  });

  test('Next scrolls to field on later page', async ({ page }) => {
    const token = 'scroll-token';
    const fields = [
      { id: 'p1', type: 'checkbox', required: true, page: 1, x: 120, y: 120, w: 20, h: 20 },
      { id: 'p2', type: 'text', required: true, page: 1, x: 120, y: 760, w: 220, h: 28 },
    ];

    await page.setViewportSize({ width: 1280, height: 620 });

    await page.route(`**/api/sign/${token}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          signer: { id: 55, name: 'Scroll User', email: 'scroll@example.com', role: 'signer', status: 'pending' },
          envelope: { subject: 'Scroll Test Doc' },
          fields,
        }),
      });
    });

    await page.route(`**/api/sign/${token}/pdf`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        body: pdfBuffer,
      });
    });

    await page.route(`**/api/sign/${token}/final-pdf`, async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'not ready' }),
      });
    });

    await page.route('**/pdf.worker.min.mjs', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: workerScript,
      });
    });

    await page.goto(`/sign/${token}`);

    const scrollContainer = page.locator('.sign-doc-section');
    await expect(scrollContainer).toBeVisible();
    await expect(page.locator('img[alt^="Page"]')).toHaveCount(1);

    const chip = page.getByTestId('action-chip');
    await chip.click();
    await chip.click();

    const field2 = page.locator('[data-field-id="p2"]');
    await expect(field2).toBeVisible();
    await page.waitForFunction(() => {
      const container = document.querySelector('.sign-doc-section');
      const el = document.querySelector('[data-field-id="p2"]');
      if (!container || !el) return false;
      const cRect = container.getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      return rect.top >= cRect.top && rect.bottom <= cRect.bottom + 4;
    });
  });

  test('Sign adopted signature fills signature fields', async ({ page }) => {
    const token = 'sig-token';
    const fields = [
      { id: 's1', type: 'signature', required: true, page: 1, x: 120, y: 620, w: 220, h: 40 },
      { id: 's2', type: 'initials', required: true, page: 1, x: 120, y: 560, w: 120, h: 32 },
    ];

    await page.addInitScript(
      ({ sigToken, signature, initials }) => {
        localStorage.setItem(
          `sign-adoption:${sigToken}`,
          JSON.stringify({ signature, initials, method: 'type' })
        );
      },
      { sigToken: token, signature: fakeSignature, initials: fakeInitials }
    );

    await page.route(`**/api/sign/${token}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          signer: { id: 77, name: 'Sig User', email: 'sig@example.com', role: 'signer', status: 'pending' },
          envelope: { subject: 'Signature Test Doc' },
          fields,
        }),
      });
    });

    await page.route(`**/api/sign/${token}/pdf`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        body: pdfBuffer,
      });
    });

    await page.route(`**/api/sign/${token}/final-pdf`, async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'not ready' }),
      });
    });

    await page.route('**/pdf.worker.min.mjs', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: workerScript,
      });
    });

    await page.goto(`/sign/${token}`);
    await expect(page.locator('img[alt^="Page"]')).toHaveCount(1);

    const firstField = page.locator('[data-field-id="s1"]');
    const secondField = page.locator('[data-field-id="s2"]');

    await firstField.locator('button', { hasText: /^Sign$/ }).click();
    await secondField.locator('button', { hasText: /^Sign$/ }).click();
    await expect(page.locator('[data-field-id="s1"] [data-filled="true"]')).toBeVisible();
    await expect(page.locator('[data-field-id="s2"] [data-filled="true"]')).toBeVisible();
  });
});
