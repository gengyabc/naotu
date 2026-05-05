import { DEFAULT_NODE_HEIGHT, DEFAULT_NODE_WIDTH } from "../constants";
import type { MindmapDocument, MindmapEdge, MindmapNode } from "../types/mindmap";
import { createId } from "./id";
import { parseMarkdownHeadings } from "./markdown-heading-parser";
import { RadialLayoutEngine } from "./radial-layout";

export interface CreateMindmapFromMarkdownOptions {
  markdown: string;
  fileBasename: string;
  filePath: string;
  headingsAsNotebookNodes: boolean;
}

export function createMindmapFromMarkdown(options: CreateMindmapFromMarkdownOptions): MindmapDocument {
  const headings = parseMarkdownHeadings(options.markdown);
  const nodes: MindmapNode[] = [];
  const edges: MindmapEdge[] = [];

  const rootId = createId("node");
  const rootNode: MindmapNode = {
    id: rootId,
    kind: "notebook",
    title: options.fileBasename,
    x: 0,
    y: 0,
    width: DEFAULT_NODE_WIDTH,
    height: DEFAULT_NODE_HEIGHT,
    treeControl: "manual-expanded",
    notebook: {
      link: `[[${options.fileBasename}]]`,
      path: options.filePath,
      targetType: "file",
    },
    link: `[[${options.fileBasename}]]`,
  };
  nodes.push(rootNode);

  const stack: Array<{ level: number; nodeId: string }> = [{ level: 0, nodeId: rootId }];

  for (const heading of headings) {
    const id = createId("node");
    const link = `[[${options.fileBasename}#${heading.title}]]`;
    const node: MindmapNode = {
      id,
      kind: options.headingsAsNotebookNodes ? "notebook" : "text",
      title: heading.title,
      x: 0,
      y: 0,
      width: DEFAULT_NODE_WIDTH,
      height: DEFAULT_NODE_HEIGHT,
      treeControl: "auto",
      notebook: options.headingsAsNotebookNodes
        ? {
            link,
            path: options.filePath,
            targetType: "heading",
          }
        : undefined,
      link: options.headingsAsNotebookNodes ? link : undefined,
    };
    nodes.push(node);

    while (stack.length > 0 && stack[stack.length - 1].level >= heading.level) {
      stack.pop();
    }

    const parentId = stack[stack.length - 1]?.nodeId ?? rootId;
    edges.push({
      id: createId("edge"),
      source: parentId,
      target: id,
      relation: "mindmap",
      type: "curve",
    });

    stack.push({ level: heading.level, nodeId: id });
  }

  const doc: MindmapDocument = {
    version: 1,
    title: `${options.fileBasename} Mindmap`,
    layoutMode: "radial",
    viewport: { x: 400, y: 300, zoom: 1 },
    nodes,
    edges,
  };

  return new RadialLayoutEngine().layout(doc, rootId);
}
