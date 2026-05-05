export interface PreviewCacheEntry {
  markdown: string;
  updatedAt: number;
}

export class PreviewCache {
  private cache = new Map<string, PreviewCacheEntry>();
  private version = 0;

  constructor(private maxEntries = 300) {}

  get(key: string): string | null {
    return this.cache.get(key)?.markdown ?? null;
  }

  set(key: string, markdown: string): void {
    this.cache.set(key, { markdown, updatedAt: Date.now() });
    this.evictIfNeeded();
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
    this.version += 1;
  }

  getVersion(): number {
    return this.version;
  }

  private evictIfNeeded(): void {
    if (this.cache.size <= this.maxEntries) return;
    const entries = [...this.cache.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt);
    while (entries.length > this.maxEntries) {
      const [key] = entries.shift()!;
      this.cache.delete(key);
    }
  }
}

export const globalPreviewCache = new PreviewCache();
