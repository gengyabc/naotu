import { worldToScreen } from "../core/screen-transform";
import type { ProjectedEdge, ProjectedNode } from "../types/mindmap";
import { isUnderlineNode } from "../types/mindmap";
import type { ViewTransform } from "../core/screen-transform";
import { routeEdge } from "../core/edge-routing";
import { getActiveWindow } from "../core/dom";

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
    const dpr = getActiveWindow().devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    this.drawEdges(ctx, nodes, edges, transform);
    this.drawNodes(ctx, nodes, transform);
  }

  private drawNodes(ctx: CanvasRenderingContext2D, nodes: ProjectedNode[], transform: ViewTransform): void {
    ctx.save();
    ctx.font = "12px sans-serif";
    ctx.textBaseline = "middle";

    ctx.strokeStyle = "rgba(140, 140, 140, 0.8)";
    ctx.fillStyle = "rgba(120, 120, 120, 0.9)";

    for (const node of nodes) {
      const screen = worldToScreen({ x: node.projectedX, y: node.projectedY }, transform);
      if (isUnderlineNode(node)) {
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(screen.x, screen.y + node.displayHeight - 1);
        ctx.lineTo(screen.x + node.displayWidth, screen.y + node.displayHeight - 1);
        ctx.stroke();
      } else {
        ctx.lineWidth = 1;
        ctx.beginPath();
        roundRect(ctx, screen.x, screen.y, node.displayWidth, node.displayHeight, 8);
        ctx.stroke();
      }
      ctx.fillText(node.title, screen.x + 8, screen.y + Math.min(node.displayHeight / 2, 18));
    }

    ctx.restore();
  }

  private drawEdges(ctx: CanvasRenderingContext2D, nodes: ProjectedNode[], edges: ProjectedEdge[], transform: ViewTransform): void {
    const nodeMap = new Map(
      nodes.map((node) => {
        const screen = worldToScreen({ x: node.projectedX, y: node.projectedY }, transform);
        return [node.id, { ...node, projectedX: screen.x, projectedY: screen.y }];
      }),
    );
    ctx.save();
    for (const edge of edges) {
      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      if (!source || !target) continue;

      const route = routeEdge({ edge, source, target });
      ctx.beginPath();
      const path = new Path2D(route.d);
      ctx.strokeStyle = edge.branchColorBorder ?? "rgba(120, 120, 120, 0.6)";
      ctx.lineWidth = edge.isFromRoot ? 3 : 2;
      ctx.stroke(path);
    }
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
