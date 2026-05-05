import type { ProjectedEdge, ProjectedNode } from "../types/mindmap";
import type { ViewTransform } from "../core/screen-transform";

export interface CanvasBackgroundRenderInput {
  canvas: HTMLCanvasElement;
  nodes: ProjectedNode[];
  edges: ProjectedEdge[];
  transform: ViewTransform;
}

export class CanvasBackgroundRenderer {
  render(input: CanvasBackgroundRenderInput): void {
    const { canvas, nodes, edges, transform } = input;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.k, transform.k);
    this.drawEdges(ctx, nodes, edges);
    this.drawNodes(ctx, nodes);
    ctx.restore();
  }

  private drawNodes(ctx: CanvasRenderingContext2D, nodes: ProjectedNode[]): void {
    ctx.save();
    ctx.strokeStyle = "rgba(140, 140, 140, 0.8)";
    ctx.fillStyle = "rgba(120, 120, 120, 0.9)";
    ctx.font = "12px sans-serif";
    ctx.textBaseline = "middle";

    for (const node of nodes) {
      ctx.beginPath();
      roundRect(ctx, node.projectedX, node.projectedY, node.displayWidth, node.displayHeight, 8);
      ctx.stroke();
      ctx.fillText(node.title, node.projectedX + 8, node.projectedY + Math.min(node.displayHeight / 2, 18));
    }

    ctx.restore();
  }

  private drawEdges(ctx: CanvasRenderingContext2D, nodes: ProjectedNode[], edges: ProjectedEdge[]): void {
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    ctx.save();
    ctx.strokeStyle = "rgba(120, 120, 120, 0.6)";
    ctx.beginPath();
    for (const edge of edges) {
      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      if (!source || !target) continue;
      const sx = source.projectedX + source.displayWidth / 2;
      const sy = source.projectedY + source.displayHeight / 2;
      const tx = target.projectedX + target.displayWidth / 2;
      const ty = target.projectedY + target.displayHeight / 2;
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);
    }
    ctx.stroke();
    ctx.restore();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}
