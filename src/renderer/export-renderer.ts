import type { MindmapDocument, ProjectedEdge, ProjectedNode } from "../types/mindmap";
import { createSemanticProjection } from "../core/semantic-projection";
import { computeProjectionBounds } from "../core/export-bounds";
import { routeEdge } from "../core/edge-routing";

export function renderMindmapToSvgString(doc: MindmapDocument): string {
  const projection = createSemanticProjection(doc, {
    zoom: 1.2,
    viewportWorldRect: { x: -100000, y: -100000, width: 200000, height: 200000 },
    selectedNodeIds: [],
  });

  const bounds = computeProjectionBounds(projection.nodes);
  const nodesSvg = projection.nodes.map((node) => renderNodeSvg(node, bounds)).join("\n");
  const edgesSvg = projection.edges.map((edge) => renderEdgeSvg(edge, projection.nodes, bounds)).join("\n");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}" height="${bounds.height}" viewBox="0 0 ${bounds.width} ${bounds.height}">`,
    `<rect width="100%" height="100%" fill="white"/>`,
    `<g class="edges">`,
    edgesSvg,
    `</g>`,
    `<g class="nodes">`,
    nodesSvg,
    `</g>`,
    `</svg>`,
  ].join("\n");
}

export async function renderSvgStringToPngArrayBuffer(svg: string): Promise<ArrayBuffer> {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  try {
    const image = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Unable to create canvas context.");

    ctx.drawImage(image, 0, 0);
    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error("PNG export failed."));
      }, "image/png");
    });

    return await pngBlob.arrayBuffer();
  } finally {
    URL.revokeObjectURL(url);
  }
}

function renderNodeSvg(node: ProjectedNode, bounds: { x: number; y: number }): string {
  const x = node.projectedX - bounds.x;
  const y = node.projectedY - bounds.y;
  const title = escapeXml(node.title);
  const badge = node.kind === "notebook" ? "notebook" : "";

  return [
    `<g transform="translate(${x}, ${y})">`,
    `<rect x="0" y="0" width="${node.displayWidth}" height="${node.displayHeight}" rx="12" ry="12" fill="#ffffff" stroke="#999999"/>`,
    `<text x="12" y="26" font-size="14" font-family="sans-serif" fill="#222222">${title}</text>`,
    badge ? `<text x="12" y="48" font-size="11" font-family="sans-serif" fill="#777777">${badge}</text>` : "",
    `</g>`,
  ].join("\n");
}

function renderEdgeSvg(edge: ProjectedEdge, nodes: ProjectedNode[], bounds: { x: number; y: number }): string {
  const map = new Map(nodes.map((node) => [node.id, node]));
  const source = map.get(edge.source);
  const target = map.get(edge.target);
  if (!source || !target) return "";

  const d = routeEdge({
    edge,
    source: { ...source, projectedX: source.projectedX - bounds.x, projectedY: source.projectedY - bounds.y },
    target: { ...target, projectedX: target.projectedX - bounds.x, projectedY: target.projectedY - bounds.y },
  }).d;

  const stroke = edge.relation === "reference" ? "#999999" : "#666666";
  const dash = edge.relation === "reference" ? `stroke-dasharray="5 5"` : "";
  return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="2" ${dash}/>`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load SVG image."));
    image.src = src;
  });
}

function escapeXml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
