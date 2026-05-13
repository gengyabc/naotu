export class DebouncedAutosave {
  private timer: ReturnType<Window["setTimeout"]> | null = null;

  constructor(
    private saveFn: () => Promise<void>,
    private getConfig: () => { enabled: boolean; delayMs: number } = () => ({ enabled: true, delayMs: 800 }),
  ) {}

  schedule(): void {
    const config = this.getConfig();
    if (!config.enabled) return;
    const timerWindow = getTimerWindow();

    if (this.timer !== null) {
      timerWindow.clearTimeout(this.timer);
    }

    this.timer = timerWindow.setTimeout(() => {
      this.timer = null;
      void this.saveFn();
    }, config.delayMs);
  }

  async flush(): Promise<void> {
    const timerWindow = getTimerWindow();
    if (this.timer !== null) {
      timerWindow.clearTimeout(this.timer);
      this.timer = null;
    }

    await this.saveFn();
  }
}

function getTimerWindow(): Pick<Window, "setTimeout" | "clearTimeout"> {
  if (typeof window !== "undefined" && typeof window.setTimeout === "function" && typeof window.clearTimeout === "function") {
    return window;
  }

  return {
    setTimeout,
    clearTimeout,
  };
}
