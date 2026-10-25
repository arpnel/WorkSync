import "server-only";
import { S3Client } from "@aws-sdk/client-s3";

export const R2_PART_BYTES = 64 * 1024 * 1024;
export const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;

let client: S3Client | undefined;

export function getR2Client(): S3Client {
  if (client) return client;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey || !R2_BUCKET_NAME)
    throw new Error("Cloudflare R2 storage is not configured on the server.");
  client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
  return client;
}

export function getR2BucketName(): string {
  if (!R2_BUCKET_NAME)
    throw new Error("Cloudflare R2 storage is not configured on the server.");
  return R2_BUCKET_NAME;
}
