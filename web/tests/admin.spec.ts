import { expect, Page, test } from '@playwright/test';

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

type MockOptions = {
  projects?: ProjectFixture[];
  investorsByProject?: Record<number, InvestorFixture[]>;
  finalsByProject?: Record<number, FinalArtifactFixture[]>;
  envelopesByProject?: Record<number, EnvelopeFixture[]>;
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
  const { projects = defaultProjects, investorsByProject = {}, finalsByProject = {}, envelopesByProject = {} } = options;

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

    await expect(page.getByRole('button', { name: /Alpha Fund/i })).toBeVisible();

    const stored = await page.evaluate(() => ({
      token: localStorage.getItem('adminAccessToken'),
      projectId: localStorage.getItem('adminSelectedProjectId'),
    }));

    expect(stored.token).toBe('secret-token');
    expect(stored.projectId).toBe('201');
  });

  test('switching projects refreshes investors and resets to documents tab', async ({ page }) => {
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

    const investorPanel = page.locator('.investor-panel');
    await expect(investorPanel.getByText('Alpha Holder')).toBeVisible();

    await page.getByRole('button', { name: 'Share' }).click();
    const shareHeading = page.getByText('Project access token');
    await expect(shareHeading).toBeVisible();

    await page.getByRole('button', { name: /Beta Build/i }).click();

    await expect(investorPanel.getByText('Beta Holder')).toBeVisible();
    await expect(investorPanel.getByText('Alpha Holder')).toHaveCount(0);
    await expect(shareHeading).toHaveCount(0);
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

    await expect(investorPanel.getByText('No investors linked.')).toBeVisible();
    await expect(investorPanel.getByTestId('investor-manage-toggle')).toHaveText('Manage');
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

    const signedSection = page.getByTestId('signed-documents-section');
    await signedSection.getByTestId('signed-manage-toggle').click();
    const signedCheckbox = signedSection.getByRole('checkbox').first();
    await signedCheckbox.check();
    await expect(signedSection.getByTestId('signed-delete-selected')).toBeEnabled();

    await page.route('**/api/projects/*/final-artifacts/*', async (route) => {
      await route.fulfill(jsonResponse({ removed: true }));
    });

    const deleteDialog = page.waitForEvent('dialog');
    await Promise.all([
      deleteDialog.then((dialog) => dialog.accept()),
      signedSection.getByTestId('signed-delete-selected').click(),
    ]);

    await expect(page.getByTestId('signed-documents-section')).toHaveCount(0);

    const envelopeSection = page.getByTestId('outstanding-envelopes-section');
    await envelopeSection.getByTestId('envelope-manage-toggle').click();

    await page.route('**/api/projects/*/envelopes/*', async (route) => {
      await route.fulfill(jsonResponse({ revoked: true }));
    });

    const revokeDialog = page.waitForEvent('dialog');
    await Promise.all([
      revokeDialog.then((dialog) => dialog.accept()),
      envelopeSection.getByRole('button', { name: 'Revoke' }).click(),
    ]);

    await expect(page.getByTestId('outstanding-envelopes-section')).toHaveCount(0);
  });
});
