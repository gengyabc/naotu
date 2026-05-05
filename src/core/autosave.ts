export class DebouncedAutosave {
  private timer: number | null = null;

  constructor(
    private saveFn: () => Promise<void>,
    private delayMs = 800,
  ) {}

  schedule(): void {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
    }

    this.timer = window.setTimeout(() => {
      this.timer = null;
      void this.saveFn();
    }, this.delayMs);
  }

  async flush(): Promise<void> {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }

    await this.saveFn();
  }
}
