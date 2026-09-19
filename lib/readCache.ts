type Entry = { value: unknown; expiresAt: number };

/** Bounded, memory-only cache. Forced reads supersede older requests. */
export class ReadCache {
  private entries = new Map<string, Entry>();
  private pending = new Map<string, Promise<unknown>>();

  constructor(
    private ttl = 30_000,
    private limit = 40,
    private now = Date.now,
  ) {}

  clear() {
    this.entries.clear();
    this.pending.clear();
  }

  read<T>(key: string, fetcher: () => Promise<T>, force = false): Promise<T> {
    if (force) this.entries.delete(key);
    const cached = this.entries.get(key);
    if (!force && cached && cached.expiresAt > this.now()) {
      return Promise.resolve(cached.value as T);
    }
    if (!force && this.pending.has(key))
      return this.pending.get(key) as Promise<T>;
    const request = Promise.resolve()
      .then(fetcher)
      .then((value) => {
        if (this.pending.get(key) === request) {
          this.entries.delete(key);
          this.entries.set(key, { value, expiresAt: this.now() + this.ttl });
          while (this.entries.size > this.limit)
            this.entries.delete(this.entries.keys().next().value!);
        }
        return value;
      })
      .finally(() => {
        if (this.pending.get(key) === request) this.pending.delete(key);
      });
    this.pending.set(key, request);
    return request;
  }
}
