# Freelancer TIN storage

Freelancer setup stores the TIN encrypted with AES-256-GCM before writing it to the private `freelancer_tax_identifiers.encrypted_tin` table. The browser receives only a `hasTin` status; it cannot read the stored value or ciphertext. The API verifies the signed-in user's freelancer profile and derives the row owner from that verified session.

The identifier table records `created_at`/`created_by` and `updated_at`/`updated_by`. Both actor fields identify the freelancer who submitted or changed their own TIN; they do not represent an administrator review. The table has RLS enabled, no client-role grants or policies, and service-role access is used only from server-side API code.

Configure `TAX_IDENTIFIER_ENCRYPTION_KEY` as a server-only environment variable containing 32 random bytes encoded as 64 hexadecimal characters. Generate it with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Keep a protected backup and do not use a `NEXT_PUBLIC_` variable. Changing the key without re-encrypting stored TINs makes them unreadable.

The schema is recorded in `supabase/migrations/20261029154101_encrypted_freelancer_tin.sql` and `supabase/migrations/20261029154136_limit_freelancer_tin_service_role_privileges.sql`. The TIN table remains inaccessible to `public`, `anon`, and `authenticated`; it has no RLS policies and is accessed only by the server-only service-role endpoint after verifying the user's session and freelancer profile.
