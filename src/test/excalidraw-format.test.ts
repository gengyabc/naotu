import { describe, it, expect } from "vitest";
import { compressToBase64, decompressFromBase64 } from "lz-string";

function createCompressedJson(json: object): string {
  return compressToBase64(JSON.stringify(json));
}

describe("excalidraw compressed-json parsing", () => {
  it("handles compressed-json format", () => {
    const testJson = {
      type: "excalidraw",
      version: 2,
      elements: [
        { type: "rectangle", id: "1", x: 100, y: 50, width: 200, height: 100 },
        { type: "text", id: "2", x: 150, y: 80, text: "Test" },
      ],
    };

    const compressed = createCompressedJson(testJson);
    const content = `---
excalidraw-plugin: true
---
# Excalidraw Data

\`\`\`compressed-json
${compressed}
\`\`\`
`;

    const compressedMatch = content.match(/```compressed-json\s*\n([\s\S]*?)\n```/);
    expect(compressedMatch).not.toBeNull();

    if (compressedMatch) {
      const compressedData = compressedMatch[1].replace(/\s+/g, "");
      const decompressed = decompressFromBase64(compressedData);
      const parsed = JSON.parse(decompressed);

      expect(parsed.type).toBe("excalidraw");
      expect(parsed.elements).toHaveLength(2);
      expect(parsed.elements[0].width).toBe(200);
      expect(parsed.elements[0].height).toBe(100);
    }
  });

  it("handles compressed-json split into chunks with blank lines", () => {
    const testJson = {
      type: "excalidraw",
      version: 2,
      elements: [
        { type: "rectangle", id: "1", x: 20, y: 10, width: 300, height: 120 },
      ],
    };

    const compressed = createCompressedJson(testJson);
    const chunked = compressed.match(/.{1,16}/g)?.join("\n\n") ?? compressed;
    const content = `---
excalidraw-plugin: true
---
## Drawing

\`\`\`compressed-json
${chunked}
\`\`\`
`;

    const compressedMatch = content.match(/```compressed-json\s*\n([\s\S]*?)\n```/);
    expect(compressedMatch).not.toBeNull();

    if (compressedMatch) {
      const compressedData = compressedMatch[1].replace(/\s+/g, "");
      const decompressed = decompressFromBase64(compressedData);
      const parsed = JSON.parse(decompressed);

      expect(parsed.elements[0].width).toBe(300);
      expect(parsed.elements[0].height).toBe(120);
    }
  });

  it("handles regular json format", () => {
    const content = `---
excalidraw-plugin: true
---
# Excalidraw Data

\`\`\`json
{
  "type": "excalidraw",
  "version": 2,
  "elements": [
    {"type": "rectangle", "x": 100, "y": 50, "width": 200, "height": 100}
  ]
}
\`\`\`
`;

    const jsonMatch = content.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
    expect(jsonMatch).not.toBeNull();

    if (jsonMatch) {
      const jsonContent = jsonMatch[1];
      const parsed = JSON.parse(jsonContent);

      expect(parsed.type).toBe("excalidraw");
      expect(parsed.elements).toHaveLength(1);
    }
  });
});
