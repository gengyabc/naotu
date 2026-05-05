import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DebouncedAutosave } from "../core/autosave";

describe("DebouncedAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not schedule saves when autosave is disabled", async () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    const autosave = new DebouncedAutosave(saveFn, () => ({ enabled: false, delayMs: 10 }));

    autosave.schedule();
    await vi.advanceTimersByTimeAsync(20);

    expect(saveFn).not.toHaveBeenCalled();
  });

  it("uses the latest configured autosave delay", async () => {
    const saveFn = vi.fn().mockResolvedValue(undefined);
    let delayMs = 10;
    const autosave = new DebouncedAutosave(saveFn, () => ({ enabled: true, delayMs }));

    autosave.schedule();
    await vi.advanceTimersByTimeAsync(9);
    expect(saveFn).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(saveFn).toHaveBeenCalledTimes(1);

    delayMs = 25;
    autosave.schedule();
    await vi.advanceTimersByTimeAsync(24);
    expect(saveFn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(saveFn).toHaveBeenCalledTimes(2);
  });
});
