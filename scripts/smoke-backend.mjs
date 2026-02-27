#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

function projectIdFromEnv() {
  return (
    process.env.VITE_FIREBASE_PROJECT_ID ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GCLOUD_PROJECT ||
    ''
  ).trim();
}

async function projectIdFromGeneratedConfig() {
  try {
    const src = await readFile(new URL('../src/generated/appConfig.ts', import.meta.url), 'utf8');
    const match = src.match(/"projectId":\s*"([^"]+)"/);
    return (match?.[1] || '').trim();
  } catch {
    return '';
  }
}

const projectId = projectIdFromEnv() || (await projectIdFromGeneratedConfig()) || 'mybodyscan-f3daf';
const origin = `https://us-central1-${projectId}.cloudfunctions.net`;

async function probe(path, init = {}) {
  const res = await fetch(`${origin}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text.slice(0, 160) };
  }
  if (!res.ok) {
    throw new Error(`${path} failed (${res.status}): ${JSON.stringify(payload)}`);
  }
  return payload;
}

try {
  const health = await probe('/health');
  const system = await probe('/systemHealth');
  console.log(JSON.stringify({ ok: true, origin, healthOk: health?.ok === true, systemHealth: !!system }, null, 2));
} catch (error) {
  console.error('[smoke-backend] failed', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
