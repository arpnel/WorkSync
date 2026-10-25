/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const { S3Client, UploadPartCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const api = {};
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync("lib/storage/hybridStorage.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  { exports: api },
);

test("5 MB and exactly 50 MB stay on Supabase Storage", () => {
  assert.equal(api.usesR2Storage(5 * 1024 * 1024), false);
  assert.equal(api.usesR2Storage(50 * 1024 * 1024), false);
});

test("a file larger than 50 MB routes to R2", () => {
  assert.equal(api.usesR2Storage(50 * 1024 * 1024 + 1), true);
});

test("100 MB video and 1 GB deliverable types are accepted within the large-file cap", () => {
  assert.equal(
    api.validateLargeAttachment(100 * 1024 * 1024, "demo.mp4", "video/mp4"),
    null,
  );
  assert.equal(
    api.validateLargeAttachment(1024 * 1024 * 1024, "archive.zip", "application/zip"),
    null,
  );
});

test("oversized files and file type/extension mismatches are rejected", () => {
  assert.match(
    api.validateLargeAttachment(1024 * 1024 * 1024 + 1, "archive.zip", "application/zip"),
    /1 GB/,
  );
  assert.match(
    api.validateLargeAttachment(60 * 1024 * 1024, "video.mp4", "application/pdf"),
    /extension does not match/,
  );
});

test("large-file reference checks stay tied to records and private signed URLs", () => {
  const route = fs.readFileSync("app/api/storage/r2/download/route.ts", "utf8");
  const migration = fs.readFileSync("supabase/migrations/202610250004_hybrid_r2_large_uploads.sql", "utf8");
  assert.match(route, /\.eq\("status", "attached"\)/);
  assert.match(route, /projectParticipant\(db, user\.id/);
  assert.match(route, /expiresIn: 15 \* 60/);
  assert.match(migration, /new\.sender_id is distinct from auth\.uid\(\)/);
  assert.match(migration, /status='ready' and expires_at>now\(\)/);
});

test("each presigned multipart URL binds the exact part length", async () => {
  const client = new S3Client({
    region: "auto",
    endpoint: "https://example.r2.cloudflarestorage.com",
    forcePathStyle: true,
    credentials: { accessKeyId: "test-key", secretAccessKey: "test-secret" },
  });
  const url = await getSignedUrl(
    client,
    new UploadPartCommand({
      Bucket: "test-bucket",
      Key: "test-key",
      UploadId: "test-upload",
      PartNumber: 1,
      ContentLength: 1024,
    }),
    { expiresIn: 300 },
  );
  assert.match(new URL(url).searchParams.get("X-Amz-SignedHeaders"), /content-length/);
  client.destroy();
});
