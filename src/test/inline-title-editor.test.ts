import { beforeEach, describe, expect, it, vi } from "vitest";
import { InlineTitleEditor } from "../renderer/inline-title-editor";

describe("InlineTitleEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preserves legacy oversized text and blocks further input at the limit", async () => {
    const originalCreateEl = document.body.createEl;
    vi.spyOn(document.body, "createEl").mockImplementation(((tagName, options) => {
      if (tagName === "canvas") {
        return {
          getContext: () => null,
          remove: () => {},
        } as unknown as HTMLElement;
      }
      return originalCreateEl.call(document.body, tagName, options);
    }) as typeof document.body.createEl);

    const layer = document.body.createDiv();
    const onCommitText = vi.fn();
    const onCancel = vi.fn();
    const longValue = "这是一段很长的文本节点内容".repeat(8);

    const editor = new InlineTitleEditor({
      layer,
      x: 0,
      y: 0,
      width: 120,
      height: 40,
      fontSize: 14,
      isBold: false,
      value: longValue,
      onCommitText,
      onCancel,
    });

    editor.open();

    const textarea = layer.children[0] as HTMLTextAreaElement & {
      selectionStart?: number;
      selectionEnd?: number;
      setSelectionRange?: (start: number, end: number) => void;
    };

    textarea.selectionStart = textarea.value.length;
    textarea.selectionEnd = textarea.value.length;
    textarea.setSelectionRange = vi.fn();

    const preventDefault = vi.fn();
    textarea.dispatchEvent({
      type: "beforeinput",
      inputType: "insertText",
      data: "x",
      preventDefault,
    } as unknown as Event);

    expect(textarea.value).toBe(longValue);
    expect(preventDefault).toHaveBeenCalled();
    expect(textarea.value.endsWith("x")).toBe(false);

    await editor.commit();
    expect(onCommitText).toHaveBeenCalledWith(longValue);
  });

  it("commits safely when close re-enters during textarea removal", async () => {
    const layer = document.body.createDiv();
    const onCommitText = vi.fn();
    const onCancel = vi.fn();

    const editor = new InlineTitleEditor({
      layer,
      x: 0,
      y: 0,
      width: 120,
      height: 40,
      fontSize: 14,
      isBold: false,
      value: "节点标题",
      onCommitText,
      onCancel,
    });

    editor.open();

    const textarea = layer.children[0] as HTMLTextAreaElement;
    let removeCalls = 0;
    textarea.remove = vi.fn(() => {
      removeCalls += 1;
      if (removeCalls > 1) {
        throw new DOMException(
          "Failed to execute 'remove' on 'Element': The node to be removed is no longer a child of this node.",
          "NotFoundError"
        );
      }
      textarea.parentNode?.removeChild(textarea);
      editor.close();
    });

    await expect(editor.commit()).resolves.toBeUndefined();
    expect(onCommitText).toHaveBeenCalledWith("节点标题");
    expect(onCancel).not.toHaveBeenCalled();
    expect(removeCalls).toBe(1);
  });
});
