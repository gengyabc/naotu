import { describe, expect, it } from "vitest";
import { buildHierarchy } from "../core/hierarchy";
import { createSmallTestDocument } from "./test-fixtures";

describe("buildHierarchy", () => {
  it("builds root and parent relation", () => {
    const doc = createSmallTestDocument();
    const hierarchy = buildHierarchy(doc);

    expect(hierarchy.rootId).toBe("root");
    expect(hierarchy.parentById.get("child")).toBe("root");
    expect(hierarchy.childrenById.get("root")).toContain("child");
  });
});
