import assert from "node:assert/strict";
import test from "node:test";
import { handleUploadScanPhotoHttp } from "../lib/scan/uploadScanPhotoHttp.js";
import { HttpsError } from "firebase-functions/v2/https";

class MockStorageFile {
  path;
  store;
  metadata;
  constructor(path, store, metadata) {
    this.path = path;
    this.store = store;
    this.metadata = metadata;
  }
  async save(buffer, opts) {
    this.store.push({
      path: this.path,
      buffer,
      contentType: opts?.contentType,
      metadata: opts?.metadata,
    });
    // record metadata so getMetadata returns it
    this.metadata = {
      ...(this.metadata || {}),
      ...(opts?.metadata || {}),
      generation: "1",
      md5Hash: "mock",
    };
  }
  async getMetadata() {
    return [this.metadata || { generation: "1", md5Hash: "mock" }];
  }
}

class MockStorageBucket {
  store;
  metadataByPath;
  constructor(store, metadataByPath) {
    this.store = store;
    this.metadataByPath = metadataByPath;
  }
  file(path) {
    if (!this.metadataByPath.has(path)) this.metadataByPath.set(path, {});
    return new MockStorageFile(path, this.store, this.metadataByPath.get(path));
  }
  get name() {
    return "test-bucket";
  }
}

class MockStorage {
  saved = [];
  metadataByPath = new Map();
  bucket() {
    return new MockStorageBucket(this.saved, this.metadataByPath);
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
    this.headers[String(key).toLowerCase()] = value;
    return this;
  }
  setHeader(key, value) {
    return this.set(key, value);
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

function tinyJpegBuffer() {
  return Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
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
    query: init.query || {},
    body: init.body || undefined,
  };
}

test("uploadScanPhotoHttp rejects unauthenticated", async () => {
  const storage = new MockStorage();
  const req = createMockRequest({
    method: "POST",
    headers: { "content-type": "multipart/form-data; boundary=test" },
    rawBody: Buffer.from(""),
  });
  const res = new MockResponse();
  await handleUploadScanPhotoHttp(req, res, {
    storage,
    allowCorsAndOptionalAppCheck: (_req, _res, next) => next?.(),
    randomUUID: () => "uuid",
    nowIso: () => "now",
    requireAuth: async () => {
      throw new HttpsError("unauthenticated", "Authentication required");
    },
  });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body?.ok, false);
});

test("uploadScanPhotoHttp accepts multipart field 'photo' and writes canonical path", async () => {
  const storage = new MockStorage();
  const form = buildMultipartBody({
    fields: { scanId: "scan-1", pose: "front", correlationId: "corr-1" },
    files: [
      {
        field: "photo",
        filename: "front.jpg",
        buffer: tinyJpegBuffer(),
        contentType: "image/jpeg",
      },
    ],
  });
  const req = createMockRequest({
    method: "POST",
    headers: { "content-type": form.contentType, authorization: "Bearer t" },
    rawBody: form.buffer,
  });
  const res = new MockResponse();
  await handleUploadScanPhotoHttp(req, res, {
    storage,
    allowCorsAndOptionalAppCheck: (_req, _res, next) => next?.(),
    randomUUID: () => "uuid-token",
    nowIso: () => "now",
    requireAuth: async () => "user-1",
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.ok, true);
  assert.equal(res.body?.scanId, "scan-1");
  assert.equal(res.body?.pose, "front");
  assert.equal(res.body?.storagePath, "scans/user-1/scan-1/front.jpg");
  assert.equal(storage.saved.length, 1);
  assert.equal(storage.saved[0].path, "scans/user-1/scan-1/front.jpg");
  // token metadata should be present for download-token based flows
  const md = storage.saved[0].metadata?.metadata || {};
  assert.equal(typeof md.firebaseStorageDownloadTokens, "string");
});

