# WorkSync large-file storage setup

## Routing and limits

- Files up to and including 50 MiB continue to upload directly to their existing private Supabase Storage bucket.
- Files above 50 MiB and up to 1 GiB use private Cloudflare R2 multipart uploads. Each part is 64 MiB, uploaded directly by the browser with short-lived presigned URLs.
- Project messages, submissions/deliverables, and dispute evidence support large files. Existing service media remains capped at 50 MiB and continues to use its current Supabase flow. Profile, avatar, resume, verification, and portfolio upload behavior is unchanged.
- PostgreSQL stores the `r2:<object-key>` reference in the existing message, submission, or dispute path column. Existing Supabase references keep their current path format. A private upload-ticket row binds a new object to its uploader, target, purpose, and final database record.
- Retrieval requires the user's existing conversation/project permission and a matching attached ticket. The server returns a 15-minute signed URL. Images, PDFs, and supported video formats receive inline disposition; other supported files download as attachments.
- Large uploads report progress and can be cancelled from the project chat, submission, and dispute forms. Failed multipart sessions are aborted on cancellation and stale tickets are cleaned by a daily Vercel cron.
- Existing project submissions and message history do not have an attached-file deletion control. The server deletes abandoned or failed uploads only after confirming no message, submission, or dispute references the object; attached history remains intact.
- There is no general per-account storage quota in the inspected schema. The implementation caps each large file at 1 GiB; a minimal next safeguard would be a 10 GiB per-user total quota, enforced in the upload-init endpoint and database. That quota is not implemented here.

## Database setup

Review `supabase/migrations/202610250004_hybrid_r2_large_uploads.sql`. It creates server-only upload tickets, raises `project-attachments` and `message-attachments` Supabase limits to 50 MiB, and updates the existing submission/dispute routines and message trigger to validate and bind R2 references. It is **PREPARED, NOT APPLIED**. Reconcile it with deployed RPC definitions and bucket configuration before applying it manually in Supabase; no database changes were run by the application task.

## Cloudflare setup

1. Create a private R2 bucket; leave public access and the `r2.dev` public development URL disabled.
2. Create an R2 S3 API token with **Object Read & Write**, scoped to this bucket only. The S3 API needs the account ID, access key ID, secret access key, and endpoint format `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`. Do not put these in client-prefixed environment variables.
3. Add bucket CORS with the exact WorkSync origins. The currently configured production origin found in this checkout is `https://work-sync-pi.vercel.app`; add any production custom domain and exact preview origins that are actually used.

Suggested bucket CORS rule:

```json
{
  "rules": [
    {
      "id": "worksync-private-large-files",
      "allowed": {
        "origins": [
          "http://localhost:3000",
          "https://work-sync-pi.vercel.app"
        ],
        "methods": ["GET", "PUT", "HEAD"],
        "headers": ["*"]
      },
      "exposeHeaders": [
        "ETag",
        "Content-Length",
        "Content-Range",
        "Accept-Ranges"
      ],
      "maxAgeSeconds": 3600
    }
  ]
}
```

The browser needs to read the multipart `ETag` response header. Add every allowed origin without a trailing slash. R2's CORS setup and response-header behavior are documented by [Cloudflare](https://developers.cloudflare.com/r2/buckets/cors/).

4. Add an R2 lifecycle rule to abort incomplete multipart uploads after 1 day. Do not configure age-based deletion for completed objects because completed objects may be attached to active project records. Cloudflare documents the incomplete-upload lifecycle action [here](https://developers.cloudflare.com/r2/buckets/object-lifecycles/).

## Vercel environment variables

Set these as server-only values in every environment that should accept R2 uploads:

- `CLOUDFLARE_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `SUPABASE_SERVICE_ROLE_KEY` (used by the authenticated storage routes and cleanup worker; existing server-only key)
- `CRON_SECRET` (used by the scheduled cleanup route; existing server-only secret)

No values are recorded here. Cloudflare's official [S3 setup guide](https://developers.cloudflare.com/r2/get-started/s3/) describes the bucket-scoped S3 credentials and endpoint.

## Local and production verification

After reviewing and applying the prepared migration, and after configuring R2 CORS and server environment variables:

1. Start the app with `pnpm.cmd dev` and sign in as a project participant.
2. Send a 5 MiB and a 50 MiB message attachment. Confirm both use Supabase Storage and remain readable by the conversation participants.
3. Send a 50 MiB + 1 byte supported file. Confirm the browser uploads multipart data directly to the R2 host, shows progress, stores an `r2:` reference, and can open the resulting attachment.
4. Submit a 100 MiB MP4 and open the submission as the client. Confirm native browser video playback and that an unrelated account receives an access error.
5. Upload a 1 GiB ZIP as project work. Confirm progress, successful retrieval, then try cancellation on another large upload and confirm the upload ticket becomes aborted and the object is removed.
6. Open a dispute with a large evidence file; confirm both project parties and an authorized administrator can retrieve it. Verify a nonparticipant cannot.
7. Try an extension/MIME mismatch, an unsupported file type, and a file above 1 GiB. Confirm each is rejected. Confirm existing Supabase attachment URLs still work.
8. Try completing with a missing part, wrong ETag, and mismatched uploaded size; confirm completion fails and cleanup removes the unattached object. Try an unknown record ID and confirm the server refuses to sign it. Let a test download URL expire (15 minutes) and confirm R2 rejects it.
9. In production, repeat with the production origin and verify CORS, Vercel cron execution, and the Supabase migration separately.

Static routing and validation tests do not prove real R2 transfer, CORS, Supabase RLS, or deployed migration behavior. No live R2, browser, Vercel, or Supabase integration test was executed in this checkout.
