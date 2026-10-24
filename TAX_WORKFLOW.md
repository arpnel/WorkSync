# Tax verification and transaction records

## Current workflow

- Freelancer onboarding and Settings use `POST /api/tax-documents` for one upload and one database submission path. Skipping onboarding leaves the existing setup flow available.
- The API issues an exact-path, short-lived Supabase signed upload token for PDF, JPG/JPEG, or PNG files up to 5 MB, avoiding Vercel's 4.5 MB Function request cap. After direct-to-private-Storage upload, the authenticated finalization API checks the stored file size, extension, MIME, and signature before inserting its tax-document row; rejected bytes are deleted. User document links are short-lived and owner-scoped; administrator links are produced only by the admin review endpoint.
- Tax document decisions and VAT treatment remain separate. VAT treatment requires an admin classification and the corresponding verified, unexpired registration evidence. Marketplace cards show only the verified VAT-Registered or verified Non-VAT classification, and the filter does not expose supporting tax records.
- Payout tax snapshots and receipt snapshots remain saved transaction records. The receipt API retains a full internal snapshot and returns a role-filtered version: clients receive purchase and VAT fields, freelancers receive their own payout/withholding fields, and authorized admins receive the full detail. PDFs should be generated from the response for the current reader.
- Withholding remains off until the platform's withholding-agent status and operating arrangement are confirmed and configured. Uploaded declarations are evidence for review; they do not automatically create an exemption.

## Checkout and tax limitations

The existing payment and agreement contract saves a single agreed project amount. The payout snapshot migration treats the freelancer's saved gross amount as VAT-inclusive where current VAT registration and treatment are verified. The codebase does not carry a per-listing VAT-exclusive/inclusive pricing choice or a verified transaction-level tax determination before payment. Therefore this change does not add VAT to the amount charged at checkout, does not infer zero VAT from missing paperwork, and does not change historical payments. A checkout VAT line and tax-inclusive/ exclusive pricing must wait until the listing/contract price semantics and WorkSync's invoicing/payment role are explicitly established.

Similarly, the BIR's current publications describe withholding rules for covered payors and e-marketplace/DFSP operators, but the code changes do not decide whether WorkSync is in scope for a particular payment flow. Do not enable the platform gate based only on this implementation.

References for a qualified tax review: [RR 11-2018](https://bir-cdn.bir.gov.ph/local/pdf/RR%20No.%2011-2018.pdf), [RMC 8-2024](https://bir-cdn.bir.gov.ph/BIR/pdf/RMC%20No.%208-2024%20%281%29.pdf), and [RMC 55-2026](https://bir-cdn.bir.gov.ph/BIR/pdf/RMC%20No.%2055-2026%20Digest.pdf). RMC 55-2026 specifically reminds covered e-marketplace operators and DFSPs of withholding and payee-alphalist reporting obligations; it is not an individualized determination that WorkSync's arrangement is covered.

## Database deployment

`supabase/migrations/202610240002_tax_uploads_and_vat_classification.sql` is **PREPARED, NOT APPLIED**. It depends on the existing tax record and receipt migrations, sets the storage bucket to private with a 5 MB limit and allowed MIME types, denies direct authenticated storage inserts, adds the reviewed VAT classification field, and exposes only verified public classification values. Apply through the established migration workflow after verifying the prior migrations and storage bucket in the target Supabase project.

The new behavior requiring those columns/RPC and the earlier tax tables is not live until those migrations are applied and the deployed app is updated. No settlement or payout records were changed.
