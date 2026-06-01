import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readRendererSource(relativePath: string): string {
  return readFileSync(resolve(__dirname, "..", "..", relativePath), "utf8");
}

function extractCreateSceneBody(source: string): string {
  const marker = "protected createScene()";
  const start = source.indexOf(marker);
  expect(start, `createScene() not found in source`).toBeGreaterThanOrEqual(0);

  const braceStart = source.indexOf("{", start);
  expect(braceStart, `createScene() opening brace not found`).toBeGreaterThanOrEqual(0);

  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(braceStart, index + 1);
      }
    }
  }

  throw new Error("createScene() body not terminated");
}

describe("interaction SVG sizing", () => {
  it("keeps the SVG mindmap renderer SVG element responsive to container size", () => {
    const source = readRendererSource("src/renderer/svg-mindmap-renderer.ts");
    const createSceneBody = extractCreateSceneBody(source);

    expect(createSceneBody).toContain(`.attr("class", "semantic-mindmap-svg")`);
    expect(createSceneBody).toContain(`.attr("width", "100%")`);
    expect(createSceneBody).toContain(`.attr("height", "100%")`);
    expect(createSceneBody).not.toMatch(/\.attr\("width",\s*viewport\./);
    expect(createSceneBody).not.toMatch(/\.attr\("height",\s*viewport\./);
    expect(createSceneBody).not.toMatch(/getElementViewportSize\(/);
  });

  it("keeps the hybrid mindmap renderer SVG overlay responsive to container size", () => {
    const source = readRendererSource("src/renderer/hybrid-mindmap-renderer.ts");
    const createSceneBody = extractCreateSceneBody(source);

    expect(createSceneBody).toContain(`.attr("class", "hybrid-interaction-svg")`);
    expect(createSceneBody).toContain(`.attr("width", "100%")`);
    expect(createSceneBody).toContain(`.attr("height", "100%")`);
    expect(createSceneBody).not.toMatch(/\.attr\("width",\s*viewport\./);
    expect(createSceneBody).not.toMatch(/\.attr\("height",\s*viewport\./);
    expect(createSceneBody).not.toMatch(/getElementViewportSize\(/);
  });
});
