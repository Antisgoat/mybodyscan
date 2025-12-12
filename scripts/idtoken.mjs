#!/usr/bin/env node
import { pathToFileURL } from "url";

const SIGN_UP_ENDPOINT =
  "https://identitytoolkit.googleapis.com/v1/accounts:signUp";

function hrefForModule(path) {
  try {
    return pathToFileURL(path).href;
  } catch (error) {
    return undefined;
  }
}

export async function mintIdToken(options = {}) {
  const apiKey = options.apiKey ?? process.env.FIREBASE_WEB_API_KEY;

  if (!apiKey) {
    throw new Error("FIREBASE_WEB_API_KEY is required to mint an ID token.");
  }

  const endpoint = `${SIGN_UP_ENDPOINT}?key=${encodeURIComponent(apiKey)}`;

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ returnSecureToken: true }),
    });
  } catch (error) {
    throw new Error(`Failed to call Identity Toolkit: ${error.message}`);
  }

  const payloadText = await response.text();
  let payload;
  try {
    payload = payloadText ? JSON.parse(payloadText) : {};
  } catch (error) {
    throw new Error(
      `Unable to parse Identity Toolkit response (status ${response.status}): ${payloadText.slice(0, 200)}`
    );
  }

  if (!response.ok) {
    const message = payload?.error?.message ?? `HTTP ${response.status}`;
    throw new Error(`Identity Toolkit error: ${message}`);
  }

  const token = payload.idToken;
  if (!token) {
    throw new Error("Identity Toolkit response did not include idToken.");
  }

  return {
    token,
    expiresIn: payload.expiresIn ? Number(payload.expiresIn) : undefined,
    refreshToken: payload.refreshToken,
  };
}

const isMainModule = import.meta.url === hrefForModule(process.argv[1] ?? "");

if (isMainModule) {
  mintIdToken()
    .then(({ token }) => {
      process.stdout.write(`${token}\n`);
    })
    .catch((error) => {
      console.error(`[idtoken] ${error.message}`);
      process.exitCode = 1;
    });
}
