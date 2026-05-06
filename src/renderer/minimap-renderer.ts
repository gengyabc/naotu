import type { MindmapDocument, Rect } from "../types/mindmap";
import { getStoredNodeSize } from "../core/notebook-size";

export class MinimapRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private lastBounds: Rect | null = null;

  constructor(
    private container: HTMLElement,
    private onJumpToWorldPoint: (x: number, y: number) => void,
  ) {
    this.canvas = container.createEl("canvas", { cls: "mindmap-minimap" });
    this.ctx = this.canvas.getContext("2d");

    this.canvas.addEventListener("click", (event) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const world = this.screenToWorld(x, y);
      if (world) this.onJumpToWorldPoint(world.x, world.y);
    });
  }

  render(args: { doc: MindmapDocument; viewportWorldRect: Rect }): void {
    if (!this.ctx) return;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;

    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.clearRect(0, 0, rect.width, rect.height);

    const bounds = computeNodeBounds(args.doc);
    this.lastBounds = bounds;

    const scale = Math.min(rect.width / Math.max(bounds.width, 1), rect.height / Math.max(bounds.height, 1));
    const offsetX = -bounds.x * scale + (rect.width - bounds.width * scale) / 2;
    const offsetY = -bounds.y * scale + (rect.height - bounds.height * scale) / 2;

    this.ctx.save();
    this.ctx.strokeStyle = "rgba(120,120,120,0.6)";
    this.ctx.fillStyle = "rgba(120,120,120,0.9)";

    for (const edge of args.doc.edges) {
      const source = args.doc.nodes.find((node) => node.id === edge.source);
      const target = args.doc.nodes.find((node) => node.id === edge.target);
      if (!source || !target) continue;
      this.ctx.beginPath();
      this.ctx.moveTo(source.x * scale + offsetX, source.y * scale + offsetY);
      this.ctx.lineTo(target.x * scale + offsetX, target.y * scale + offsetY);
      this.ctx.stroke();
    }

    for (const node of args.doc.nodes) {
      this.ctx.fillRect(node.x * scale + offsetX - 2, node.y * scale + offsetY - 2, 4, 4);
    }

    this.ctx.strokeStyle = "rgba(50,120,220,0.9)";
    this.ctx.lineWidth = 1.5;
    this.ctx.strokeRect(
      args.viewportWorldRect.x * scale + offsetX,
      args.viewportWorldRect.y * scale + offsetY,
      args.viewportWorldRect.width * scale,
      args.viewportWorldRect.height * scale,
    );
    this.ctx.restore();
  }

  remove(): void {
    this.canvas.remove();
  }

  private screenToWorld(x: number, y: number): { x: number; y: number } | null {
    const bounds = this.lastBounds;
    if (!bounds) return null;

    const rect = this.canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / Math.max(bounds.width, 1), rect.height / Math.max(bounds.height, 1));
    const offsetX = -bounds.x * scale + (rect.width - bounds.width * scale) / 2;
    const offsetY = -bounds.y * scale + (rect.height - bounds.height * scale) / 2;

    return {
      x: (x - offsetX) / scale,
      y: (y - offsetY) / scale,
    };
  }
}

function computeNodeBounds(doc: MindmapDocument): Rect {
  if (doc.nodes.length === 0) return { x: -400, y: -300, width: 800, height: 600 };

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const node of doc.nodes) {
    const size = getStoredNodeSize(node);
    minX = Math.min(minX, node.x - size.width / 2);
    minY = Math.min(minY, node.y - size.height / 2);
    maxX = Math.max(maxX, node.x + size.width / 2);
    maxY = Math.max(maxY, node.y + size.height / 2);
  }

  const padding = 300;
  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  };
}
