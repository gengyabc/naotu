import { describe, expect, it, vi } from "vitest";

import { MindmapDocumentStore } from "../core/document-store";

describe("MindmapDocumentStore", () => {
  it("does not overwrite the source file after a load failure", async () => {
    const read = vi.fn().mockResolvedValue("{not valid json");
    const modify = vi.fn().mockResolvedValue(undefined);
    const store = new MindmapDocumentStore({
      vault: { read, modify },
    } as never);

    await store.openFile({ path: "broken.mindmap.json" } as never);

    expect(store.getLoadError()).toBeInstanceOf(Error);
    expect(store.canSave()).toBe(false);
    await expect(store.save()).rejects.toBeInstanceOf(Error);
    expect(modify).not.toHaveBeenCalled();
  });
});
