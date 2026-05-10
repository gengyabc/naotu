import { describe, expect, it } from "vitest";

import {
  buildEmbeddedPreviewMarkdown,
  getFileNodeTitle,
  getSupportedFileNodeTargetKind,
  isSupportedFileNodeTargetPath,
} from "../core/file-node-support";

describe("file node support helpers", () => {
  it("recognizes supported image targets by extension", () => {
    expect(getSupportedFileNodeTargetKind("assets/photo.png")).toBe("image");
    expect(getSupportedFileNodeTargetKind("assets/photo.JPEG")).toBe("image");
    expect(getSupportedFileNodeTargetKind("assets/icon.svg")).toBe("image");
  });

  it("recognizes supported excalidraw targets by path suffix", () => {
    expect(getSupportedFileNodeTargetKind("assets/diagram.excalidraw")).toBe("excalidraw");
    expect(getSupportedFileNodeTargetKind("assets/diagram.excalidraw.md")).toBe("excalidraw");
  });

  it("rejects unsupported targets", () => {
    expect(getSupportedFileNodeTargetKind("notes/topic.md")).toBeNull();
    expect(getSupportedFileNodeTargetKind("assets/video.mp4")).toBeNull();
    expect(isSupportedFileNodeTargetPath("notes/topic.md")).toBe(false);
    expect(isSupportedFileNodeTargetPath("assets/photo.webp")).toBe(true);
  });

  it("derives fallback titles from the leaf filename including extension", () => {
    expect(getFileNodeTitle("assets/photo.png")).toBe("photo.png");
    expect(getFileNodeTitle("assets/diagram.excalidraw.md")).toBe("diagram.excalidraw.md");
    expect(getFileNodeTitle("photo.png")).toBe("photo.png");
  });

  it("builds embedded preview markdown using the vault path", () => {
    expect(buildEmbeddedPreviewMarkdown("assets/photo.png")).toBe("![[assets/photo.png]]");
  });
});
