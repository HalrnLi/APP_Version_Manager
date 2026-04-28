// 简单内存缓存 - 使用两个 Map 分别存储数据和时间戳
// 由于 TypeScript 类型系统的限制，使用 string-keyed Map 存储
// 调用方需要确保 get<T>/set<T> 使用相同的类型参数
export class DataCache {
  private cache = new Map<string, unknown>();
  private ttl: number;
  private timestamps = new Map<string, number>();

  constructor(ttlMs: number = 30000) {
    this.ttl = ttlMs;
  }

  get<T>(key: string): T | null {
    if (!this.cache.has(key)) return null;

    const timestamp = this.timestamps.get(key) ?? 0;
    if (Date.now() - timestamp > this.ttl) {
      this.cache.delete(key);
      this.timestamps.delete(key);
      return null;
    }

    return this.cache.get(key) as T;
  }

  set<T>(key: string, data: T): void {
    this.cache.set(key, data);
    this.timestamps.set(key, Date.now());
  }

  invalidate(key?: string): void {
    if (key) {
      this.cache.delete(key);
      this.timestamps.delete(key);
    } else {
      this.cache.clear();
      this.timestamps.clear();
    }
  }
}
