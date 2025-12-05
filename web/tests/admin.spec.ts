import { expect, Page, test } from '@playwright/test';
import path from 'path';

type ProjectFixture = {
  id: number;
  name: string;
  status?: string;
  access_token?: string | null;
};

type InvestorFixture = {
  id: number;
  name: string;
  email: string;
  units_invested: number;
  role?: string;
  mailing_address?: string | null;
  bank_name?: string | null;
  bank_account_number?: string | null;
  bank_routing_number?: string | null;
};

type FinalArtifactFixture = {
  envelope_id: number;
  document_id: number;
  document_name: string;
  completed_at: string;
  sha256_final: string;
};

type EnvelopeFixture = {
  id: number;
  subject: string;
  status: string;
  created_at: string;
  total_signers: number;
  completed_signers: number;
  document: { id: number | null; filename: string | null };
  signers: Array<{ id: number; name: string; email: string; status: string; role: string; routing_order: number }>;
};

type ProjectFileFixture = {
  id: number;
  display_name: string;
  stored_filename: string;
  uploaded_at: string;
  content_type?: string | null;
};

type MockOptions = {
  projects?: ProjectFixture[];
  investorsByProject?: Record<number, InvestorFixture[]>;
  finalsByProject?: Record<number, FinalArtifactFixture[]>;
  envelopesByProject?: Record<number, EnvelopeFixture[]>;
  filesByProject?: Record<number, ProjectFileFixture[]>;
};

const defaultProjects: ProjectFixture[] = [
  { id: 201, name: 'Alpha Fund', status: 'active', access_token: 'alpha-token' },
  { id: 202, name: 'Beta Build', status: 'draft', access_token: 'beta-token' },
];

const jsonResponse = (data: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(data),
});

const extractProjectId = (url: string): number | undefined => {
  const match = url.match(/projects\/(\d+)/);
  return match ? Number(match[1]) : undefined;
};

const mockAdminData = async (page: Page, options: MockOptions = {}) => {
  const {
    projects = defaultProjects,
    investorsByProject = {},
    finalsByProject = {},
    envelopesByProject = {},
    filesByProject = {},
  } = options;

  await page.route('**/api/projects', async (route) => {
    await route.fulfill(jsonResponse(projects));
  });

  await page.route('**/api/projects/*/final-artifacts', async (route) => {
    const projectId = extractProjectId(route.request().url());
    await route.fulfill(jsonResponse(finalsByProject[projectId ?? 0] ?? []));
  });

  await page.route('**/api/projects/*/envelopes', async (route) => {
    const projectId = extractProjectId(route.request().url());
    await route.fulfill(jsonResponse(envelopesByProject[projectId ?? 0] ?? []));
  });

  await page.route('**/api/projects/*/investors', async (route) => {
    const projectId = extractProjectId(route.request().url());
    await route.fulfill(jsonResponse(investorsByProject[projectId ?? 0] ?? []));
  });

  await page.route('**/api/projects/*/files', async (route) => {
    const projectId = extractProjectId(route.request().url());
    if (route.request().method() === 'GET') {
      await route.fulfill(jsonResponse(filesByProject[projectId ?? 0] ?? []));
    } else {
      await route.fulfill(jsonResponse({ ok: true }));
    }
  });

  await page.route('**/api/projects/*/files/*', async (route) => {
    await route.fulfill(jsonResponse({ ok: true }));
  });
};

const completeLogin = async (page: Page, token = 'valid-token') => {
  await page.goto('/admin');
  const tokenInput = page.getByPlaceholder('Admin token');
  await tokenInput.waitFor();
  await tokenInput.fill(token);
  await page.getByRole('button', { name: /continue/i }).click();
};

const waitForDashboard = async (page: Page) => {
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
};

const openInvestorsTab = async (page: Page) => {
  await page.getByTestId('tab-investors').click();
};

test.describe('Admin portal', () => {
  test('rejects invalid admin token', async ({ page }) => {
    await page.route('**/api/projects', async (route) => {
      await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ detail: 'invalid' }) });
    });

    await page.goto('/admin');
    const tokenInput = page.getByPlaceholder('Admin token');
    await tokenInput.waitFor();
    await tokenInput.fill('wrong-token');
    await page.getByRole('button', { name: /continue/i }).click();

    await expect(page.getByText('Invalid token')).toBeVisible();
  });

  test('unlocks projects and stores selection after successful verification', async ({ page }) => {
    await mockAdminData(page);
    await completeLogin(page, 'secret-token');
    await waitForDashboard(page);

    await expect(page.locator('.project-scroll').getByRole('button', { name: /Alpha Fund/i })).toBeVisible();

    const stored = await page.evaluate(() => ({
      token: localStorage.getItem('adminAccessToken'),
      projectId: localStorage.getItem('adminSelectedProjectId'),
    }));

    expect(stored.token).toBe('secret-token');
    expect(stored.projectId).toBe('201');
  });

  test('switching projects refreshes investors and resets to signatures tab', async ({ page }) => {
    await mockAdminData(page, {
      investorsByProject: {
        201: [
          { id: 1, name: 'Alpha Holder', email: 'alpha@example.com', units_invested: 10, role: 'Investor' },
        ],
        202: [
          { id: 2, name: 'Beta Holder', email: 'beta@example.com', units_invested: 20, role: 'Investor' },
        ],
      },
    });

    await completeLogin(page);
    await waitForDashboard(page);

    await openInvestorsTab(page);
    const investorPanel = page.locator('.investor-panel');
    await expect(investorPanel.getByText('Alpha Holder')).toBeVisible();

    await page.getByRole('button', { name: 'Share' }).click();
    const shareHeading = page.getByText('Project access token');
    await expect(shareHeading).toBeVisible();

    await page.getByRole('button', { name: /Beta Build/i }).click();

    await expect(shareHeading).toHaveCount(0);
    await openInvestorsTab(page);
    await expect(investorPanel.getByText('Beta Holder')).toBeVisible();
    await expect(investorPanel.getByText('Alpha Holder')).toHaveCount(0);
  });

  test('manage investors mode allows bulk removal', async ({ page }) => {
    await mockAdminData(page, {
      investorsByProject: {
        201: [
          { id: 1, name: 'Alice Alpha', email: 'alice@example.com', units_invested: 12, role: 'Investor' },
          { id: 2, name: 'Bob Bravo', email: 'bob@example.com', units_invested: 8, role: 'Investor' },
        ],
      },
    });

    await completeLogin(page);
    await waitForDashboard(page);

    await openInvestorsTab(page);
    const investorPanel = page.locator('.investor-panel');
    await investorPanel.getByTestId('investor-manage-toggle').click();
    const removeButton = investorPanel.getByTestId('investor-remove-button');
    await expect(removeButton).toBeDisabled();

    const checkboxes = investorPanel.getByRole('checkbox');
    await checkboxes.nth(0).check();
    await checkboxes.nth(1).check();
    await expect(removeButton).toBeEnabled();

    await page.route('**/api/projects/*/investors/*', async (route) => {
      await route.fulfill(jsonResponse({ success: true }));
    });

    const dialogPromise = page.waitForEvent('dialog');
    await Promise.all([
      dialogPromise.then((dialog) => dialog.accept()),
      removeButton.click(),
    ]);

    await expect(investorPanel.getByText('No investors linked yet.')).toBeVisible();
    await expect(investorPanel.getByTestId('investor-manage-toggle')).toHaveText('Manage');
  });

  test('clicking an investor card opens inline edit (no edit button)', async ({ page }) => {
    await mockAdminData(page, {
      investorsByProject: {
        201: [{ id: 1, name: 'Alice Alpha', email: 'alice@example.com', units_invested: 12, role: 'Investor' }],
      },
    });

    await completeLogin(page);
    await waitForDashboard(page);
    await openInvestorsTab(page);

    const card = page.getByRole('button', { name: /Alice Alpha/i }).first();
    await card.click();

    await expect(page.locator('input[value="Alice Alpha"]')).toBeVisible();
    await expect(page.locator('input[value="alice@example.com"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Edit$/ })).toHaveCount(0);
  });

  test('canceling inline investor edit returns to view state', async ({ page }) => {
    await mockAdminData(page, {
      investorsByProject: {
        201: [{ id: 1, name: 'Alice Alpha', email: 'alice@example.com', units_invested: 12, role: 'Investor' }],
      },
    });

    await completeLogin(page);
    await waitForDashboard(page);
    await openInvestorsTab(page);

    const card = page.getByRole('button', { name: /Alice Alpha/i }).first();
    await card.click();

    await expect(page.locator('input[value="Alice Alpha"]')).toBeVisible();
    await page.getByRole('button', { name: /^Cancel$/ }).click();
    await expect(page.locator('input[value="Alice Alpha"]')).toHaveCount(0);
    await expect(page.getByText('Mailing:', { exact: false })).toHaveCount(0); // ensures view mode summary renders without inputs
  });

  test('audit tab loads events with filters and expandable payload', async ({ page }) => {
    await mockAdminData(page);

    // Mock audit endpoint
    await page.route('**/api/projects/201/audit**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              id: 1,
              action: 'upload',
              resource_type: 'document',
              resource_id: 'doc-1',
              actor_type: 'admin_token',
              actor_id: 'admin',
              status: 'success',
              summary: 'Uploaded memo',
              created_at: '2024-01-01T00:00:00Z',
              payload_json: JSON.stringify({ filename: 'memo.pdf' }),
            },
          ],
        }),
      });
    });

    await completeLogin(page);
    await waitForDashboard(page);
    await page.getByTestId('tab-audit').click();

    await expect(page.getByText('Uploaded memo')).toBeVisible();
    await page.getByText('Action: upload').click();
    await expect(page.getByText('filename')).toBeVisible();

    // Filter should trigger new request
    await page.getByPlaceholder('Search (resource, actor, summary)').fill('doc-1');
  });

  test('project sidebar CTA stays anchored while switching tabs', async ({ page }) => {
    await mockAdminData(page);
    await completeLogin(page);
    await waitForDashboard(page);

    const newProjectButton = page.locator('.admin-sidebar').getByRole('button', { name: /New Project/i });
    await newProjectButton.waitFor();
    const initialBox = await newProjectButton.boundingBox();
    expect(initialBox).not.toBeNull();

    await page.getByTestId('tab-investors').click();
    await expect(page.locator('.investor-panel')).toBeVisible();

    const afterBox = await newProjectButton.boundingBox();
    expect(afterBox).not.toBeNull();

    const deltaY = Math.abs((afterBox?.y ?? 0) - (initialBox?.y ?? 0));
    expect(deltaY).toBeLessThan(5);
  });

  test('investor validation banner clears after fixing required fields', async ({ page }) => {
    await mockAdminData(page);
    await completeLogin(page);
    await waitForDashboard(page);
    await openInvestorsTab(page);

    // Open the add investor form and trigger validation
    await page.getByRole('button', { name: /Add investor/i }).click();
    const submitButton = page.getByRole('button', { name: /^Submit$/ });
    await submitButton.click();

    const errorBanner = page.getByText('Name, email, and units are required to add an investor.');
    await expect(errorBanner).toBeVisible({ timeout: 2000 });

    // Fix the fields and ensure the banner clears automatically
    await page.getByPlaceholder('Name', { exact: true }).fill('New Investor');
    await page.getByPlaceholder('Email', { exact: true }).fill('new@example.com');
    await page.getByPlaceholder('Units (e.g. 10000)').fill('10');
    await expect(errorBanner).toHaveCount(0);
  });

  test('editing investor units refreshes KPI totals without full reload', async ({ page }) => {
    const initialInvestors = [
      { id: 1, name: 'Alex Example', email: 'alex@example.com', units_invested: 10000, role: 'Investor' },
    ];
    let currentInvestors = [...initialInvestors];

    await mockAdminData(page, {
      investorsByProject: { 201: initialInvestors },
    });

    await page.route('**/api/projects/201/investors', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill(jsonResponse(currentInvestors));
        return;
      }
      await route.fulfill(jsonResponse({ ok: true }));
    });
    await page.route('**/api/projects/201/investors/1', async (route) => {
      if (route.request().method() === 'PATCH') {
        currentInvestors = [{ ...currentInvestors[0], units_invested: 20000 }];
        await route.fulfill(jsonResponse(currentInvestors[0]));
        return;
      }
      await route.fulfill(jsonResponse(currentInvestors[0]));
    });

    await completeLogin(page);
    await waitForDashboard(page);

    await expect(page.getByText('$10,000')).toBeVisible();

    await openInvestorsTab(page);
    await page.getByText('Alex Example').click();
    const editCard = page.getByRole('button', { name: /Alex Example\s+alex@example\.com/ }).first();
    const unitsInput = editCard.locator('input[type="number"]').first();
    await unitsInput.fill('20000');
    await editCard.getByRole('button', { name: /^Save$/ }).click();

    await expect(editCard.getByText('20,000 units')).toBeVisible({ timeout: 10000 });
  });

  test('signed documents deletion and envelope revoke actions update the dashboard', async ({ page }) => {
    await mockAdminData(page, {
      finalsByProject: {
        201: [
          {
            envelope_id: 3001,
            document_id: 91,
            document_name: 'Executed Packet.pdf',
            completed_at: '2024-01-01T00:00:00Z',
            sha256_final: 'abc123',
          },
        ],
      },
      envelopesByProject: {
        201: [
          {
            id: 3001,
            subject: 'Executed Packet',
            status: 'completed',
            created_at: '2024-01-01T00:00:00Z',
            total_signers: 2,
            completed_signers: 2,
            document: { id: 91, filename: 'Executed Packet.pdf' },
            signers: [
              { id: 1, name: 'Signer One', email: 'one@example.com', status: 'completed', role: 'Primary', routing_order: 1 },
            ],
          },
          {
            id: 4001,
            subject: 'Pending Offer',
            status: 'sent',
            created_at: '2024-02-01T00:00:00Z',
            total_signers: 2,
            completed_signers: 1,
            document: { id: 92, filename: 'Pending Offer.pdf' },
            signers: [
              { id: 2, name: 'Signer Two', email: 'two@example.com', status: 'sent', role: 'Primary', routing_order: 1 },
            ],
          },
        ],
      },
    });

    await completeLogin(page);
    await waitForDashboard(page);

    await page.getByTestId('tab-signatures').click();
    const signaturesManageToggle = page.getByTestId('signatures-manage-toggle');
    await signaturesManageToggle.click();
    const deleteButton = page.getByTestId('signatures-delete-selected');
    await expect(deleteButton).toBeDisabled();
    const signedCheckbox = page.locator('[data-document-kind="signed"]').getByRole('checkbox').first();
    await signedCheckbox.check();
    await expect(deleteButton).toBeEnabled();

    await page.route('**/api/projects/*/final-artifacts/*', async (route) => {
      await route.fulfill(jsonResponse({ removed: true }));
    });

    const deleteDialog = page.waitForEvent('dialog');
    await Promise.all([
      deleteDialog.then((dialog) => dialog.accept()),
      deleteButton.click(),
    ]);

    await expect(page.locator('[data-document-kind="signed"]')).toHaveCount(0);

    const envelopeCheckbox = page.locator('[data-document-kind="awaiting"]').getByRole('checkbox').first();
    await envelopeCheckbox.check();
    await expect(deleteButton).toBeEnabled();

    await page.route('**/api/projects/*/envelopes/*', async (route) => {
      await route.fulfill(jsonResponse({ revoked: true }));
    });

    const revokeDialog = page.waitForEvent('dialog');
    await Promise.all([
      revokeDialog.then((dialog) => dialog.accept()),
      deleteButton.click(),
    ]);

    await expect(page.locator('[data-document-kind="awaiting"]')).toHaveCount(0);
    await expect(page.getByTestId('signatures-list-section')).toHaveCount(0);
  });

  test('view signees expands signed packet details', async ({ page }) => {
    await mockAdminData(page, {
      finalsByProject: {
        201: [
          {
            envelope_id: 501,
            document_id: 99,
            document_name: 'Signed Packet One',
            completed_at: '2025-06-01T12:00:00Z',
            sha256_final: 'abc123',
          },
        ],
      },
      envelopesByProject: {
        201: [
          {
            id: 501,
            subject: 'Completed Packet',
            status: 'completed',
            created_at: '2025-05-01T10:00:00Z',
            total_signers: 2,
            completed_signers: 2,
            document: { id: 99, filename: 'Signed Packet One' },
            signers: [
              { id: 1, name: 'Signer One', email: 'one@example.com', status: 'completed', role: 'Investor', routing_order: 1 },
              { id: 2, name: 'Signer Two', email: 'two@example.com', status: 'completed', role: 'Investor', routing_order: 2 },
            ],
          },
        ],
      },
    });

    await completeLogin(page);
    await waitForDashboard(page);
    await page.getByTestId('tab-signatures').click();

    const signedCard = page.locator('[data-document-kind="signed"]').first();
    await signedCard.click();

    await expect(page.getByText('Signer One')).toBeVisible();
    await expect(page.getByText('Signer Two')).toBeVisible();
  });

  test('request sign only creates envelope after final submit', async ({ page }) => {
    const investors = {
      201: [
        { id: 1, name: 'Alex Example', email: 'alex@example.com', units_invested: 10, role: 'Investor' },
      ],
    } satisfies Record<number, InvestorFixture[]>;
    await mockAdminData(page, { investorsByProject: investors });

    const pdfFixture = path.join(process.cwd(), 'tests', 'fixtures', 'sample.pdf');
    await page.route('**/api/projects/201/documents', async (route) => {
      await route.fulfill(jsonResponse({ id: 910, filename: 'Test Packet.pdf' }));
    });

    const createdEnvelopeId = 5555;
    let createCalls = 0;
    let sendCalls = 0;

    await page.route('**/api/envelopes', async (route) => {
      if (route.request().method() === 'POST') {
        createCalls += 1;
        await route.fulfill(jsonResponse({ id: createdEnvelopeId }));
      } else {
        await route.continue();
      }
    });

    await page.route(`**/api/envelopes/${createdEnvelopeId}/send`, async (route) => {
      sendCalls += 1;
      await route.fulfill(jsonResponse({ ok: true }));
    });

    await page.route(`**/api/envelopes/${createdEnvelopeId}`, async (route) => {
      await route.fulfill(
        jsonResponse({
          id: createdEnvelopeId,
          subject: 'Please sign',
          document: { id: 910, filename: 'Test Packet.pdf' },
          signers: investors[201].map((investor) => ({ id: investor.id, name: investor.name, email: investor.email })),
        }),
      );
    });

    await page.goto('/request-sign?project=201');
    const tokenInput = page.getByPlaceholder('Admin token');
    await tokenInput.waitFor();
    await tokenInput.fill('valid-token');
    await page.getByRole('button', { name: /continue/i }).click();

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(pdfFixture);
    const pdfContainer = page.locator('[data-page-container]').first();
    await pdfContainer.waitFor();

    const signatureButton = page.getByRole('button', { name: /Signature field/i }).first();
    await signatureButton.scrollIntoViewIfNeeded();
    await signatureButton.dragTo(pdfContainer, {
      targetPosition: { x: 60, y: 80 },
    });

    await expect(pdfContainer.getByText('Alex Example Signature')).toBeVisible();

    const reviewButton = page.getByRole('button', { name: /Review & Send/i }).first();
    await expect(reviewButton).toBeEnabled();
    await reviewButton.click();

    const subjectInput = page.getByLabel('Subject');
    await expect(subjectInput).toBeVisible();
    const nameInput = page.getByPlaceholder('e.g. Alex Chen');
    const emailInput = page.getByPlaceholder('you@example.com');
    await nameInput.fill('Admin Example');
    await emailInput.fill('admin@example.com');

    await page.getByRole('button', { name: /^Cancel$/ }).click();
    await subjectInput.waitFor({ state: 'detached' });
    expect(createCalls).toBe(0);

    await reviewButton.click();
    await expect(subjectInput).toBeVisible();
    await nameInput.fill('Admin Example');
    await emailInput.fill('admin@example.com');
    await page.getByRole('button', { name: 'Submit' }).click();

    await page.waitForURL(`**/request-sign/sent/${createdEnvelopeId}`);
    expect(createCalls).toBe(1);
    expect(sendCalls).toBe(1);
  });

  test('request sign submits even when upload response lacks id', async ({ page }) => {
    await mockAdminData(page, {
      investorsByProject: {
        201: [{ id: 1, name: 'Alex Example', email: 'alex@example.com', units_invested: 10, role: 'Investor' }],
      },
    });

    const pdfFixture = path.join(process.cwd(), 'tests', 'fixtures', 'sample.pdf');
    const createdEnvelopeId = 99001;
    let createPayload: any = null;
    let sendCalled = 0;

    await page.route('**/api/projects/201/documents', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill(jsonResponse({})); // legacy empty response
      } else {
        await route.fulfill(
          jsonResponse([
            { id: 910, project_id: 201, filename: 'Test Packet.pdf', created_at: new Date().toISOString() },
          ]),
        );
      }
    });

    await page.route('**/api/envelopes', async (route) => {
      if (route.request().method() === 'POST') {
        createPayload = route.request().postDataJSON();
        await route.fulfill(jsonResponse({ id: createdEnvelopeId, status: 'draft' }));
      } else {
        await route.continue();
      }
    });

    await page.route(`**/api/envelopes/${createdEnvelopeId}/send`, async (route) => {
      sendCalled += 1;
      await route.fulfill(jsonResponse({ ok: true }));
    });

    await page.goto('/request-sign?project=201');
    await page.getByPlaceholder('Admin token').fill('valid-token');
    await page.getByRole('button', { name: /continue/i }).click();

    const fileInput = page.locator('input[type=\"file\"]');
    await fileInput.setInputFiles(pdfFixture);
    const pdfContainer = page.locator('[data-page-container]').first();
    await pdfContainer.waitFor();

    const signatureButton = page.getByRole('button', { name: /Signature field/i }).first();
    await signatureButton.scrollIntoViewIfNeeded();
    await signatureButton.dragTo(pdfContainer, { targetPosition: { x: 80, y: 120 } });

    await page.getByRole('button', { name: /Review & Send/i }).click();
    await page.getByPlaceholder('e.g. Alex Chen').fill('Admin Example');
    await page.getByPlaceholder('you@example.com').fill('admin@example.com');
    await page.getByRole('button', { name: 'Submit' }).click();

    await page.waitForURL(`**/request-sign/sent/${createdEnvelopeId}`);

    expect(createPayload?.document_id).toBe(910);
    expect(Array.isArray(createPayload?.fields)).toBe(true);
    expect(createPayload?.signers?.[0]?.project_investor_id).toBe(1);
    expect(sendCalled).toBe(1);
  });
});
