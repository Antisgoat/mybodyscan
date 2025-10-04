#!/usr/bin/env node
// ESM script to validate CSP contains required sources

import https from 'node:https';
import http from 'node:http';

const requiredSources = [
  'js.stripe.com',
  'checkout.stripe.com',
  'api.stripe.com',
  '*.firebaseapp.com',
  '*.googleapis.com',
  '*.gstatic.com',
  "'self'",
];

const hostUrl = process.env.HOST_URL || 'https://mybodyscan-f3daf.web.app';

function fetchHeaders(urlString) {
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(urlString);
      const lib = url.protocol === 'http:' ? http : https;
      const req = lib.request({ method: 'HEAD', hostname: url.hostname, path: url.pathname || '/', protocol: url.protocol, port: url.port || undefined }, (res) => {
        resolve(res.headers);
      });
      req.on('error', reject);
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

function cspIncludesAll(csp) {
  if (!csp || typeof csp !== 'string') return false;
  const normalized = csp.replace(/\s+/g, ' ').toLowerCase();
  return requiredSources.every((src) => normalized.includes(src.toLowerCase()));
}

(async () => {
  try {
    const headers = await fetchHeaders(hostUrl);
    const csp = headers['content-security-policy'] || headers['Content-Security-Policy'];
    if (!csp) {
      console.error('CSP header missing');
      process.exit(1);
    }

    if (!cspIncludesAll(String(csp))) {
      console.error('CSP missing one or more required sources');
      console.error('Required:', requiredSources.join(', '));
      console.error('Actual  :', String(csp));
      process.exit(1);
    }

    console.log('CSP OK');
    process.exit(0);
  } catch (err) {
    console.error('Failed to fetch headers:', err?.message || err);
    process.exit(1);
  }
})();
