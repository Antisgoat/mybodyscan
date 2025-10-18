#!/usr/bin/env node
import { env } from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { URL } from 'node:url';
import https from 'node:https';
import http from 'node:http';

const BASE_ENV_KEYS = ['SANITY_BASE_URL', 'BASE_URL'];

function getBaseUrl() {
  const fromArgs = process.argv[2];
  const fromEnv = BASE_ENV_KEYS.map(k => env[k]).find(Boolean);
  let base = fromArgs || fromEnv || 'https://mybodyscanapp.com';
  base = base.trim();
  if (!base) throw new Error('Base URL is empty');
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
  try {
    const url = new URL(base);
    url.pathname = '/';
    return url.toString().replace(/\/$/, '');
  } catch (e) {
    throw new Error(`Invalid base URL: ${base}`);
  }
}

function request(url) {
  const isHttps = url.startsWith('https://');
  const mod = isHttps ? https : http;
  const start = Date.now();
  return new Promise((resolve) => {
    const req = mod.request(url, { method: 'GET', timeout: 10000, headers: { 'user-agent': 'sanity-check/1.0' } }, (res) => {
      const status = res.statusCode || 0;
      const headers = res.headers;
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const ms = Date.now() - start;
        const body = Buffer.concat(chunks).toString('utf8');
        resolve({ ok: status >= 200 && status < 400, status, ms, headers, body });
      });
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', (err) => {
      const ms = Date.now() - start;
      resolve({ ok: false, status: 0, ms, error: String(err) });
    });
    req.end();
  });
}

async function probe(base, path) {
  const url = `${base}${path}`;
  const res = await request(url);
  return { path, url, ...res };
}

function jsonTryParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

function summarize(results) {
  const lines = [];
  let failures = 0;
  for (const r of results) {
    const statusStr = r.status ? String(r.status) : 'ERR';
    const okMark = r.ok ? '✅' : '❌';
    if (!r.ok) failures++;
    let extra = '';
    if (r.path === '/system/health') {
      const body = jsonTryParse(r.body);
      if (body && body.ok === true) {
        extra = ` ok=${body.ok} projectId=${body.projectId ?? 'n/a'}`;
      }
    }
    lines.push(`${okMark} ${r.path} -> ${statusStr} (${r.ms} ms)${extra}`);
  }
  return { text: lines.join('\n'), failures };
}

async function main() {
  const base = getBaseUrl();
  const endpoints = ['/system/health', '/', '/demo'];
  const results = [];
  for (const path of endpoints) {
    const r = await probe(base, path);
    results.push(r);
    await delay(100);
  }
  const { text, failures } = summarize(results);
  const summary = `Sanity check against ${base}\n${text}`;
  console.log(summary);
  if (process.env.GITHUB_OUTPUT) {
    const fs = await import('node:fs/promises');
    await fs.appendFile(process.env.GITHUB_OUTPUT, `summary<<__EON__\n${summary}\n__EON__\n`);
    await fs.appendFile(process.env.GITHUB_OUTPUT, `failures=${failures}\n`);
  }
  const health = results.find(r => r.path === '/system/health');
  process.exit(health && health.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});