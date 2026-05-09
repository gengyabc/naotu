import { describe, it, expect } from "vitest";
import { truncateTextForNotebook, layoutDescription } from "../core/text-layout";

describe("truncateTextForNotebook", () => {
  it("should return original text if it fits", () => {
    const text = "short";
    const result = truncateTextForNotebook(text, 200, 14);
    expect(result).toBe("short");
  });

  it("should truncate and add ellipsis if text is too long", () => {
    const text = "这是一个非常非常非常非常非常非常长的标题需要被截断";
    const result = truncateTextForNotebook(text, 100, 14);
    expect(result.endsWith("...")).toBe(true);
    expect(result.length).toBeLessThan(text.length);
  });

  it("should handle mixed Chinese and English text", () => {
    const text = "This is a 这是一个测试 Mixed content 测试测试测试测试";
    const result = truncateTextForNotebook(text, 120, 14);
    expect(result.endsWith("...")).toBe(true);
  });

  it("should return empty string when maxWidth is zero", () => {
    const text = "any text";
    const result = truncateTextForNotebook(text, 0, 14);
    expect(result).toBe("");
  });

  it("should return empty string when maxWidth is negative", () => {
    const text = "any text";
    const result = truncateTextForNotebook(text, -10, 14);
    expect(result).toBe("");
  });

  it("should return empty string when maxWidth is smaller than ellipsis", () => {
    const text = "test";
    const result = truncateTextForNotebook(text, 10, 14);
    expect(result).toBe("");
  });

  it("should return empty string when fontSize is zero", () => {
    const text = "test";
    const result = truncateTextForNotebook(text, 100, 0);
    expect(result).toBe("");
  });

  it("should return empty string when fontSize is negative", () => {
    const text = "test";
    const result = truncateTextForNotebook(text, 100, -5);
    expect(result).toBe("");
  });

  it("should handle fontSize variations", () => {
    const text = "这是一个很长的文本用来测试不同字体大小下的截断效果";
    const result12 = truncateTextForNotebook(text, 80, 12);
    const result18 = truncateTextForNotebook(text, 80, 18);
    expect(result12.endsWith("...")).toBe(true);
    expect(result18.endsWith("...")).toBe(true);
    expect(result12.length).toBeGreaterThan(result18.length);
  });

  it("should handle empty text", () => {
    const result = truncateTextForNotebook("", 100, 14);
    expect(result).toBe("");
  });
});

describe("layoutDescription", () => {
  it("should return single line for short text", () => {
    const text = "short description";
    const lines = layoutDescription({ text, maxWidth: 200, fontSize: 11, maxLines: 3 });
    expect(lines.length).toBe(1);
    expect(lines[0]).toBe("short description");
  });

  it("should split into multiple lines for long text", () => {
    const text = "这是一个非常长的描述文本，需要被分成多行显示，因为它的长度超过了最大宽度的限制，所以应该自动换行处理";
    const lines = layoutDescription({ text, maxWidth: 100, fontSize: 11, maxLines: 3 });
    expect(lines.length).toBeGreaterThan(1);
  });

  it("should limit to maxLines and add ellipsis to last line", () => {
    const text = "这是一个非常非常非常非常非常非常非常非常非常非常长的描述文本，它需要被分成很多行，但是我们限制了最多显示三行，所以后面的内容会被截断并显示省略号";
    const lines = layoutDescription({ text, maxWidth: 80, fontSize: 11, maxLines: 3 });
    expect(lines.length).toBe(3);
    expect(lines[lines.length - 1].endsWith("...")).toBe(true);
  });

  it("should handle empty text", () => {
    const lines = layoutDescription({ text: "", maxWidth: 100, fontSize: 11, maxLines: 3 });
    expect(lines.length).toBe(0);
  });

  it("should handle exactly maxLines content", () => {
    const text = "第一行内容第二行内容第三行内容";
    const lines = layoutDescription({ text, maxWidth: 70, fontSize: 11, maxLines: 3 });
    expect(lines.length).toBeLessThanOrEqual(3);
  });

  it("should return empty array when maxWidth is zero", () => {
    const lines = layoutDescription({ text: "test", maxWidth: 0, fontSize: 11, maxLines: 3 });
    expect(lines.length).toBe(0);
  });

  it("should return empty array when maxWidth is negative", () => {
    const lines = layoutDescription({ text: "test", maxWidth: -10, fontSize: 11, maxLines: 3 });
    expect(lines.length).toBe(0);
  });

  it("should return empty array when fontSize is zero", () => {
    const lines = layoutDescription({ text: "test", maxWidth: 100, fontSize: 0, maxLines: 3 });
    expect(lines.length).toBe(0);
  });

  it("should return empty array when fontSize is negative", () => {
    const lines = layoutDescription({ text: "test", maxWidth: 100, fontSize: -5, maxLines: 3 });
    expect(lines.length).toBe(0);
  });

  it("should return empty array when maxLines is zero", () => {
    const lines = layoutDescription({ text: "test", maxWidth: 100, fontSize: 11, maxLines: 0 });
    expect(lines.length).toBe(0);
  });

  it("should return empty array when maxLines is negative", () => {
    const lines = layoutDescription({ text: "test", maxWidth: 100, fontSize: 11, maxLines: -1 });
    expect(lines.length).toBe(0);
  });

  it("should handle fontSize variations", () => {
    const text = "test description text";
    const lines12 = layoutDescription({ text, maxWidth: 50, fontSize: 12, maxLines: 3 });
    const lines18 = layoutDescription({ text, maxWidth: 50, fontSize: 18, maxLines: 3 });
    expect(lines12[0].length).toBeGreaterThan(lines18[0].length);
  });

  it("should handle maxLines = 1", () => {
    const text = "这是一个很长的描述";
    const lines = layoutDescription({ text, maxWidth: 50, fontSize: 11, maxLines: 1 });
    expect(lines.length).toBe(1);
    expect(lines[0].endsWith("...")).toBe(true);
  });

  it("should not produce a line that is only ellipsis when maxWidth is narrow", () => {
    const text = "这是一个非常长的描述文本会被分成多行";
    const lines = layoutDescription({ text, maxWidth: 30, fontSize: 11, maxLines: 3 });
    const lastLine = lines[lines.length - 1];
    expect(lastLine.endsWith("...")).toBe(true);
    expect(lastLine.length).toBeGreaterThan(3);
  });
});
