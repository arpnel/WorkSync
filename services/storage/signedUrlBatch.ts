type SignedUrlRow = {
  path: string | null;
  signedUrl: string | null;
  error: string | null;
};

type StorageBucket = {
  createSignedUrls: (
    paths: string[],
    expiresIn: number,
    options?: { download?: boolean | string },
  ) => Promise<{
    data: SignedUrlRow[] | null;
    error: { message: string } | null;
  }>;
};

type StorageSigningClient = {
  storage: { from: (bucket: string) => StorageBucket };
};

const SIGNING_BATCH_SIZE = 100;

/** Sign many private object paths in a few Storage requests instead of one per row. */
export async function createSignedUrlMap(
  client: StorageSigningClient,
  bucket: string,
  inputPaths: Array<string | null | undefined>,
  expiresIn: number,
  options?: { download?: boolean | string },
): Promise<Map<string, string>> {
  const paths = [...new Set(inputPaths.filter((path): path is string => Boolean(path)))];
  const signedUrls = new Map<string, string>();
  const storageBucket = client.storage.from(bucket);

  for (let offset = 0; offset < paths.length; offset += SIGNING_BATCH_SIZE) {
    const batch = paths.slice(offset, offset + SIGNING_BATCH_SIZE);
    const { data, error } = await storageBucket.createSignedUrls(
      batch,
      expiresIn,
      options,
    );
    if (error) continue;
    for (const row of data ?? []) {
      if (row.path && row.signedUrl && !row.error)
        signedUrls.set(row.path, row.signedUrl);
    }
  }

  return signedUrls;
}
