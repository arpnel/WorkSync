/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = (path) => fs.readFileSync(path, "utf8");

test("seller verification migration has separate history, private upload authorization, and server-side publish guards", () => {
  const migration = read("supabase/migrations/20261026174403_freelancer_seller_verification.sql");
  assert.match(migration, /PREPARED, NOT APPLIED/);
  assert.match(migration, /create table public\.freelancer_seller_verification_requirements/);
  assert.match(migration, /create table public\.freelancer_seller_verification_submissions/);
  assert.match(migration, /create table public\.freelancer_seller_verification_events/);
  for (const status of ["not_submitted", "pending", "verified", "rejected", "not_applicable"])
    assert.ok(migration.includes(`'${status}'`), `missing ${status} status`);
  assert.match(migration, /storage\.buckets where id='verification-documents' and public=false/);
  assert.match(migration, /worksync_seller_document_upload_allowed/);
  assert.match(migration, /before insert or update of status,freelancer_id on public\.services/);
  assert.match(migration, /before insert or update of status,listing_type,owner_id on public\.listing_submissions/);
  assert.match(migration, /worksync_freelancer_seller_eligible/);
  assert.doesNotMatch(migration, /drop table|delete from public\.(projects|contracts|payments)/i);
});

test("seller submission endpoints bind records to the authenticated user and validate private file bytes", () => {
  const submit = read("app/api/freelancer-seller-verification/route.ts");
  const upload = read("app/api/freelancer-seller-verification/upload-url/route.ts");
  assert.match(submit, /paymentUser\(request\)/);
  assert.match(submit, /inspectTaxDocument\(/);
  assert.match(submit, /p_user: user\.id/);
  assert.match(upload, /createSignedUploadUrl/);
  assert.match(upload, /freelancer_seller_verification_upload_tickets/);
  assert.match(upload, /TAX_DOCUMENT_MAX_BYTES/);
});

test("successful seller document submissions send the freelancer an idempotent review confirmation email", () => {
  const submit = read("app/api/freelancer-seller-verification/route.ts");
  const email = read("services/email/sellerVerificationEmails.ts");
  assert.ok(submit.indexOf("result.error") < submit.indexOf("await notifySellerDocumentSubmitted"));
  assert.match(email, /seller-verification-submitted:\$\{submissionId\}/);
  assert.match(email, /sendWorkSyncEmailSafely/);
  assert.match(email, /home\/settings#seller-verification/);
  assert.match(email, /notifySellerDocumentReviewed/);
  assert.match(email, /seller-verification-reviewed:\$\{submissionId\}/);
  assert.match(read("app/api/admin/seller-verification/route.ts"), /notifySellerDocumentReviewed/);
});

test("setup, settings, My Listings and admin share seller-verification endpoints", () => {
  assert.match(read("components/accountsetup/FreelancerSetupForm.tsx"), /FreelancerSellerVerification/);
  assert.match(read("app/home/settings/page.tsx"), /seller-verification/);
  assert.match(read("components/profile/ServiceCreateDialogLauncher.tsx"), /api\/freelancer-seller-verification/);
  assert.match(read("components/admin/FreelancerSellerVerificationReview.tsx"), /api\/admin\/seller-verification/);
  assert.match(read("components/admin/admin-navigation.ts"), /\/admin\/seller-verification/);
});
