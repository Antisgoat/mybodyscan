import assert from "node:assert/strict";
import test from "node:test";
import { handleGetScanPhotoHttp } from "../lib/scan/getScanPhotoHttp.js";
import { HttpsError } from "firebase-functions/v2/https";

class MockStorageFile {
  path;
  meta;
  existsValue;
  constructor(path, meta, existsValue = true) {
    this.path = path;
    this.meta = meta;
    this.existsValue = existsValue;
  }
  async exists() {
    return [this.existsValue];
  }
  async getMetadata() {
    return [this.meta];
  }
  createReadStream() {
    throw new Error("not used in tests");
  }
}

class MockBucket {
  files;
  constructor(files) {
    this.files = files;
  }
  file(path) {
    if (!this.files.has(path)) {
      // default to non-existent
      return new MockStorageFile(path, {}, false);
    }
    return this.files.get(path);
  }
}

class MockStorage {
  bucketValue;
  constructor(bucketValue) {
    this.bucketValue = bucketValue;
  }
  bucket() {
    return this.bucketValue;
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
  setHeader(key, value) {
    this.headers[String(key).toLowerCase()] = value;
    return this;
  }
  set(key, value) {
    return this.setHeader(key, value);
  }
  end() {
    return this;
  }
}

function createReq(init) {
  const headers = Object.fromEntries(
    Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v])
  );
  return {
    method: init.method || "GET",
    headers,
    query: init.query || {},
    get(header) {
      return headers[String(header).toLowerCase()] || null;
    },
  };
}

test("getScanPhotoHttp token mode rejects invalid token", async () => {
  const path = "scans/user-1/scan-1/front.jpg";
  const files = new Map();
  files.set(
    path,
    new MockStorageFile(path, {
      metadata: { firebaseStorageDownloadTokens: "good-token" },
    })
  );
  const storage = new MockStorage(new MockBucket(files));
  const req = createReq({
    method: "HEAD",
    query: { scanId: "scan-1", pose: "front", uid: "user-1", token: "bad-token" },
  });
  const res = new MockResponse();
  await handleGetScanPhotoHttp(req, res, {
    storage,
    allowCorsAndOptionalAppCheck: (_req, _res, next) => next?.(),
    requireAuth: async () => {
      throw new Error("should not be called");
    },
  });
  assert.equal(res.statusCode, 403);
});

test("getScanPhotoHttp token mode allows valid token", async () => {
  const path = "scans/user-1/scan-1/front.jpg";
  const files = new Map();
  files.set(
    path,
    new MockStorageFile(path, {
      metadata: { firebaseStorageDownloadTokens: "good-token" },
    })
  );
  const storage = new MockStorage(new MockBucket(files));
  const req = createReq({
    method: "HEAD",
    query: { scanId: "scan-1", pose: "front", uid: "user-1", token: "good-token" },
  });
  const res = new MockResponse();
  await handleGetScanPhotoHttp(req, res, {
    storage,
    allowCorsAndOptionalAppCheck: (_req, _res, next) => next?.(),
    requireAuth: async () => {
      throw new Error("should not be called");
    },
  });
  assert.equal(res.statusCode, 200);
});

test("getScanPhotoHttp requires auth when no token provided", async () => {
  const storage = new MockStorage(new MockBucket(new Map()));
  const req = createReq({ method: "HEAD", query: { scanId: "scan-1", pose: "front" } });
  const res = new MockResponse();
  await handleGetScanPhotoHttp(req, res, {
    storage,
    allowCorsAndOptionalAppCheck: (_req, _res, next) => next?.(),
    requireAuth: async () => {
      throw new HttpsError("unauthenticated", "Authentication required");
    },
  });
  assert.equal(res.statusCode, 401);
});

