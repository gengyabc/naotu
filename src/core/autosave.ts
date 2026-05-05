export class DebouncedAutosave {
  private timer: ReturnType<typeof globalThis.setTimeout> | null = null;

  constructor(
    private saveFn: () => Promise<void>,
    private getConfig: () => { enabled: boolean; delayMs: number } = () => ({ enabled: true, delayMs: 800 }),
  ) {}

  schedule(): void {
    const config = this.getConfig();
    if (!config.enabled) return;

    if (this.timer !== null) {
      globalThis.clearTimeout(this.timer);
    }

    this.timer = globalThis.setTimeout(() => {
      this.timer = null;
      void this.saveFn();
    }, config.delayMs);
  }

  async flush(): Promise<void> {
    if (this.timer !== null) {
      globalThis.clearTimeout(this.timer);
      this.timer = null;
    }

    await this.saveFn();
  }
}
