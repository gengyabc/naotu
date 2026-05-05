import type { MindmapNode, Rect } from "../types/mindmap";

export interface TileIndex {
  tileSize: number;
  tiles: Map<string, string[]>;
}

export function buildTileIndex(nodes: MindmapNode[], tileSize = 1000): TileIndex {
  const tiles = new Map<string, string[]>();

  for (const node of nodes) {
    const tx = Math.floor(node.x / tileSize);
    const ty = Math.floor(node.y / tileSize);
    const key = `${tx}:${ty}`;
    const list = tiles.get(key) ?? [];
    list.push(node.id);
    tiles.set(key, list);
  }

  return { tileSize, tiles };
}

export function getNodeIdsNearViewport(index: TileIndex, rect: Rect, paddingTiles = 1): Set<string> {
  const minX = Math.floor(rect.x / index.tileSize) - paddingTiles;
  const maxX = Math.floor((rect.x + rect.width) / index.tileSize) + paddingTiles;
  const minY = Math.floor(rect.y / index.tileSize) - paddingTiles;
  const maxY = Math.floor((rect.y + rect.height) / index.tileSize) + paddingTiles;

  const result = new Set<string>();
  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      const ids = index.tiles.get(`${x}:${y}`) ?? [];
      for (const id of ids) result.add(id);
    }
  }

  return result;
}
