import { expect, test } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';

const API_BASE =
  process.env.PLAYWRIGHT_API_BASE ??
  process.env.NEXT_PUBLIC_API_BASE ??
  'http://localhost:8000';
const ADMIN_TOKEN =
  process.env.PLAYWRIGHT_ADMIN_TOKEN ??
  process.env.ADMIN_ACCESS_TOKEN ??
  'admin';
const SAMPLE_PDF_PATH = path.resolve(
  process.cwd(),
  'tests/fixtures/sample.pdf',
);

test.describe('Investor portal downloads', () => {
  test('project file with unicode name downloads successfully', async ({
    page,
    request,
  }) => {
    const projectName = `Playwright Investor ${Date.now()}`;
    const createProjectResp = await request.post(
      `${API_BASE}/api/projects?name=${encodeURIComponent(projectName)}`,
      {
        headers: { 'X-Access-Token': ADMIN_TOKEN },
      },
    );

    expect(createProjectResp.ok()).toBeTruthy();
    const project = await createProjectResp.json();
    const projectId = project.id as number;
    const projectToken = project.access_token as string;

    const pdfBuffer = await fs.readFile(SAMPLE_PDF_PATH);
    const unicodeLabel = '契約書の案内.pdf';
    const uploadResp = await request.post(
      `${API_BASE}/api/projects/${projectId}/files`,
      {
        headers: { 'X-Access-Token': ADMIN_TOKEN },
        multipart: {
          label: unicodeLabel,
          file: {
            name: 'unicode-sample.pdf',
            mimeType: 'application/pdf',
            buffer: pdfBuffer,
          },
        },
      },
    );

    expect(uploadResp.ok()).toBeTruthy();
    const uploaded = await uploadResp.json();

    try {
      await page.goto(`/projects/${projectId}/${projectToken}`);
      const link = page.getByRole('link', { name: unicodeLabel });
      await expect(link).toBeVisible();

      const href = await link.getAttribute('href');
      expect(href, 'download href should be present').toBeTruthy();

      const downloadResponse = await request.get(href!);
      expect(
        downloadResponse.status(),
        `download should succeed for ${href}`,
      ).toBe(200);
      const disposition =
        downloadResponse.headers()['content-disposition'] ?? '';
      expect(disposition).toContain("filename*=");
    } finally {
      await request.delete(`${API_BASE}/api/projects/${projectId}`, {
        headers: { 'X-Access-Token': ADMIN_TOKEN },
      });
    }
  });
});
