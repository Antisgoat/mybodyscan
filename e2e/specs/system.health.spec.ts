import { expect, test } from '@playwright/test';

test('system health endpoint responds with ok', async ({ request }) => {
  const response = await request.get('/system/health');
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body).toMatchObject({ ok: true });
  expect(typeof body.projectId).toBe('string');
  expect(body.timestamp).toBeTruthy();
});
