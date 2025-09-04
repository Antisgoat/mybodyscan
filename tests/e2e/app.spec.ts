import { test, expect } from '@playwright/test';
import { ensureFixtures } from './helpers';
import fs from 'fs';

test('fixtures are created', async ({ page }) => {
  ensureFixtures();
  expect(fs.existsSync('tests/fixtures/front.jpg')).toBe(true);
});
