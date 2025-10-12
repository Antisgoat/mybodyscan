import { test, expect } from '@playwright/test';
import { ensureFixtures } from './helpers';
import fs from 'fs';

test('fixtures are created', async ({ page }) => {
  ensureFixtures();
  expect(fs.existsSync('tests/fixtures/front.jpg')).toBe(true);
});

test('auth page includes Apple and Google sign-in buttons', () => {
  const source = fs.readFileSync('src/pages/Auth.tsx', 'utf8');
  expect(source).toContain('data-testid="auth-apple-button"');
  expect(source).toContain('data-testid="auth-google-button"');
});

test('demo CTA links to demo gate', () => {
  const source = fs.readFileSync('src/pages/Auth.tsx', 'utf8');
  expect(source).toContain('to="/demo"');
});

test('coach chat stores messages under user coach collection', () => {
  const source = fs.readFileSync('src/pages/Coach/Chat.tsx', 'utf8');
  expect(source).toContain('users/${uid}/coach/chatMeta/chat');
});
