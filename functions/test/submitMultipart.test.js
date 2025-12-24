import assert from "node:assert/strict";
import test from "node:test";
import { handleSubmitScanMultipart } from "../lib/scan/submitMultipart.js";

console.log("submitMultipart tests starting");
process.on("uncaughtException", (err) => {
  console.error("uncaught exception", err);
});
process.on("unhandledRejection", (err) => {
  console.error("unhandled rejection", err);
});

class MockDocRef {
  path;
  store;
  constructor(path, store) {
    this.path = path;
    this.store = store;
  }

  async get() {
    const val = this.store.get(this.path);
    return {
      exists: Boolean(val),
      data: () => structuredClone(val),
    };
  }

  async set(data, opts) {
    const existing = (this.store.get(this.path) || {});
    const next =
      opts?.merge === false ? data : { ...existing, ...structuredClone(data) };
    this.store.set(this.path, next);
  }
}

class MockFirestore {
  data = new Map();
  doc(path) {
    return new MockDocRef(path, this.data);
  }
}

class MockStorageFile {
  path;
  store;
  constructor(path, store) {
    this.path = path;
    this.store = store;
  }
  async save(buffer, opts) {
    this.store.push({ path: this.path, buffer, contentType: opts.contentType });
  }
}

class MockStorageBucket {
  store;
  constructor(store) {
    this.store = store;
  }
  file(path) {
    return new MockStorageFile(path, this.store);
  }
}

class MockStorage {
  saved = [];
  bucket() {
    return new MockStorageBucket(this.saved);
  }
}

class MockResponse {
  statusCode = 200;
  body = null;
  headers = {};
  status(code) {
    this.statusCode = code;
    return this;
  }
  json(payload) {
    this.body = payload;
    return this;
  }
  set(key, value) {
    this.headers[key.toLowerCase()] = value;
    return this;
  }
  end() {
    return this;
  }
}

function buildMultipartBody(args) {
  const boundary = "----boundary-" + Math.random().toString(16).slice(2);
  const chunks = [];
  const push = (value) => {
    chunks.push(typeof value === "string" ? Buffer.from(value) : value);
  };
  for (const [key, value] of Object.entries(args.fields)) {
    push(`--${boundary}\r\n`);
    push(`Content-Disposition: form-data; name="${key}"\r\n\r\n`);
    push(`${value}\r\n`);
  }
  for (const file of args.files) {
    push(`--${boundary}\r\n`);
    push(
      `Content-Disposition: form-data; name="${file.field}"; filename="${file.filename}"\r\n`
    );
    push(`Content-Type: ${file.contentType}\r\n\r\n`);
    push(file.buffer);
    push("\r\n");
  }
  push(`--${boundary}--`);
  return {
    boundary,
    buffer: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

function createMockRequest(init) {
  const headers = Object.fromEntries(
    Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v])
  );
  return {
    method: init.method || "POST",
    headers,
    rawBody: init.rawBody,
    get(header) {
      return headers[header.toLowerCase()] || null;
    },
    query: {},
  };
}

function tinyJpegBuffer() {
  return Buffer.from([0xff, 0xd8, 0xff, 0xd9]); // minimal JPEG markers
}

test("submitScanMultipart requires auth", async () => {
  try {
    const res = new MockResponse();
    const req = createMockRequest({
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=test" },
      rawBody: Buffer.from(""),
    });

    await handleSubmitScanMultipart(req, res, {
      firestore: new MockFirestore(),
      storage: new MockStorage(),
      verifyIdToken: async () => {
        throw new Error("unauthenticated");
      },
      now: () => ({}),
      ensureAppCheck: async () => undefined,
      hasOpenAI: () => true,
    });

    assert.equal(res.statusCode, 401);
    assert.equal(res.body?.ok, false);
  } catch (error) {
    console.error("requires auth test failed", error);
    throw error;
  }
});

test("submitScanMultipart uploads four photos and queues scan", async () => {
  try {
    const firestore = new MockFirestore();
    const storage = new MockStorage();
    const form = buildMultipartBody({
      fields: {
        currentWeightKg: "80",
        goalWeightKg: "75",
        scanId: "scan-123",
        correlationId: "corr-123",
      },
      files: ["front", "back", "left", "right"].map((pose) => ({
        field: pose,
        filename: `${pose}.jpg`,
        buffer: tinyJpegBuffer(),
        contentType: "image/jpeg",
      })),
    });
    const req = createMockRequest({
      method: "POST",
      headers: {
        "content-type": form.contentType,
        authorization: "Bearer test-token",
      },
      rawBody: form.buffer,
    });
    const res = new MockResponse();

    await handleSubmitScanMultipart(req, res, {
      firestore,
      storage,
      verifyIdToken: async () => ({ uid: "user-1" }),
      now: () => ({ seconds: Date.now() / 1000 }),
      ensureAppCheck: async () => undefined,
      hasOpenAI: () => true,
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body?.ok, true);
    assert.equal(res.body?.scanId, "scan-123");
    assert.equal(storage.saved.length, 4);
    const storedPaths = storage.saved.map((s) => s.path).sort();
    assert.deepEqual(storedPaths, [
      "user_uploads/user-1/scans/scan-123/back.jpg",
      "user_uploads/user-1/scans/scan-123/front.jpg",
      "user_uploads/user-1/scans/scan-123/left.jpg",
      "user_uploads/user-1/scans/scan-123/right.jpg",
    ]);
    const doc = firestore.data.get("users/user-1/scans/scan-123");
    assert.equal(doc?.status, "queued");
    assert.equal(doc?.input?.currentWeightKg, 80);
    assert.equal(doc?.input?.goalWeightKg, 75);
  } catch (error) {
    console.error("multipart test failed", error);
    throw error;
  }
});
