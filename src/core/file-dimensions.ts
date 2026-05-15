import { decompressFromBase64 } from "lz-string";
import { App, TFile } from "obsidian";
import type { NotebookTargetKind } from "../types/mindmap";
import {
  NOTEBOOK_MIN_CUSTOM_WIDTH,
  NOTEBOOK_MIN_CUSTOM_HEIGHT,
  clampNotebookAspectRatioSize,
} from "./notebook-size";

const DEFAULT_EMBEDDED_WIDTH = 240;
const DEFAULT_EMBEDDED_HEIGHT = 96;
const INITIAL_EMBEDDED_MAX_WIDTH = 240;
const INITIAL_EMBEDDED_MAX_HEIGHT = 180;
const MEDIUM_EMBEDDED_MAX_WIDTH = 240;
const MEDIUM_EMBEDDED_MAX_HEIGHT = 180;
const LARGE_EMBEDDED_MAX_WIDTH = 360;
const LARGE_EMBEDDED_MAX_HEIGHT = 300;
const MAX_EMBEDDED_WIDTH = 600;
const MAX_EMBEDDED_HEIGHT = 500;
const LEGACY_DEFAULT_EMBEDDED_WIDTH = 360;
const LEGACY_DEFAULT_EMBEDDED_HEIGHT = 300;

type EmbeddedPresetSize = { width: number; height: number };

export async function getFileDimensions(
  app: App,
  file: TFile,
  targetKind?: NotebookTargetKind,
): Promise<{ width: number; height: number } | null> {
  const extension = file.extension.toLowerCase();

  if (targetKind === "excalidraw") {
    return await getExcalidrawDimensions(app, file);
  }

  if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "avif"].includes(extension)) {
    return await getImageDimensions(app, file);
  }

  if (extension === "svg") {
    return await getSvgDimensions(app, file);
  }

  if (extension === "excalidraw" || (extension === "md" && file.path.includes(".excalidraw"))) {
    return await getExcalidrawDimensions(app, file);
  }

  return null;
}

async function getImageDimensions(
  app: App,
  file: TFile,
): Promise<{ width: number; height: number } | null> {
  try {
    const data = await app.vault.readBinary(file);
    const blob = new Blob([data], { type: `image/${file.extension}` });
    const url = URL.createObjectURL(blob);

    const img = new Image();
    const dimensions = await new Promise<{ width: number; height: number } | null>((resolve) => {
      img.onload = () => {
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
        URL.revokeObjectURL(url);
      };
      img.onerror = () => {
        resolve(null);
        URL.revokeObjectURL(url);
      };
      img.src = url;
    });

    return dimensions;
  } catch {
    return null;
  }
}

async function getSvgDimensions(
  app: App,
  file: TFile,
): Promise<{ width: number; height: number } | null> {
  try {
    const content = await app.vault.read(file);
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, "image/svg+xml");
    const svg = doc.querySelector("svg");

    if (!svg) return null;

    const widthAttr = svg.getAttribute("width");
    const heightAttr = svg.getAttribute("height");
    const viewBox = svg.getAttribute("viewBox");

    if (widthAttr && heightAttr) {
      const width = parseFloat(widthAttr);
      const height = parseFloat(heightAttr);
      if (width > 0 && height > 0) return { width, height };
    }

    if (viewBox) {
      const parts = viewBox.split(/[ ,]+/).map(parseFloat);
      if (parts.length >= 4 && parts[2] > 0 && parts[3] > 0) {
        return { width: parts[2], height: parts[3] };
      }
    }

    return null;
  } catch {
    return null;
  }
}

async function getExcalidrawDimensions(
  app: App,
  file: TFile,
): Promise<{ width: number; height: number } | null> {
  try {
    const content = await app.vault.read(file);
    const json = parseExcalidrawScene(content, file.extension);
    if (!json) return null;

    if (!json.elements || json.elements.length === 0) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const el of json.elements) {
      const x = el.x ?? 0;
      const y = el.y ?? 0;
      const w = el.width ?? 0;
      const h = el.height ?? 0;

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);
    }

    if (minX === Infinity || maxX === -Infinity) return null;

    const width = maxX - minX;
    const height = maxY - minY;

    if (width <= 0 || height <= 0) return null;

    return { width, height };
  } catch {
    return null;
  }
}

function parseExcalidrawScene(
  content: string,
  extension: string,
): { elements?: Array<{ x?: number; y?: number; width?: number; height?: number }> } | null {
  if (extension === "excalidraw") {
    return JSON.parse(content) as { elements?: Array<{ x?: number; y?: number; width?: number; height?: number }> };
  }

  const compressedMatch = content.match(/```compressed-json\s*\n([\s\S]*?)\n```/);
  if (compressedMatch) {
    const cleaned = compressedMatch[1].replace(/\s+/g, "");
    const decompressed = decompressFromBase64(cleaned);
    if (!decompressed) return null;
    return JSON.parse(decompressed) as { elements?: Array<{ x?: number; y?: number; width?: number; height?: number }> };
  }

  const jsonMatch = content.match(/```json\s*\n([\s\S]*?)\n```/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[1]) as { elements?: Array<{ x?: number; y?: number; width?: number; height?: number }> };
  }

  return null;
}

export function calculateAspectRatioSize(
  originalWidth: number,
  originalHeight: number,
): { width: number; height: number; aspectRatio: number } {
  const aspectRatio = originalWidth / originalHeight;
  const downscale = Math.min(
    1,
    MAX_EMBEDDED_WIDTH / originalWidth,
    MAX_EMBEDDED_HEIGHT / originalHeight,
  );
  const scaledWidth = originalWidth * downscale;
  const scaledHeight = originalHeight * downscale;
  const upscale = Math.max(
    1,
    NOTEBOOK_MIN_CUSTOM_WIDTH / scaledWidth,
    NOTEBOOK_MIN_CUSTOM_HEIGHT / scaledHeight,
  );
  const targetWidth = scaledWidth * upscale;
  const targetHeight = scaledHeight * upscale;
  const clamped = clampNotebookAspectRatioSize(targetWidth, targetHeight, aspectRatio);

  return {
    width: clamped.width,
    height: clamped.height,
    aspectRatio,
  };
}

export function calculateInitialEmbeddedSize(
  originalWidth: number,
  originalHeight: number,
): { width: number; height: number; aspectRatio: number } {
  const aspectRatio = originalWidth / originalHeight;
  const downscale = Math.min(
    1,
    INITIAL_EMBEDDED_MAX_WIDTH / originalWidth,
    INITIAL_EMBEDDED_MAX_HEIGHT / originalHeight,
  );

  return {
    width: Math.max(1, Math.round(originalWidth * downscale)),
    height: Math.max(1, Math.round(originalHeight * downscale)),
    aspectRatio,
  };
}

export function getNextEmbeddedNotebookWheelSize(args: {
  width: number;
  height: number;
  direction: "grow" | "shrink";
  aspectRatio?: number;
}): { width: number; height: number } | null {
  const presets = args.aspectRatio && args.aspectRatio > 0
    ? getEmbeddedAspectRatioPresets(args.aspectRatio)
    : getFallbackEmbeddedPresets();

  if (args.direction === "grow") {
    return presets.find((preset) => isStrictGrowPreset(args.width, args.height, preset)) ?? null;
  }

  for (let index = presets.length - 1; index >= 0; index -= 1) {
    const preset = presets[index];
    if (isStrictShrinkPreset(args.width, args.height, preset)) return preset;
  }

  return null;
}

export function clampEmbeddedNotebookSize(args: {
  width: number;
  height: number;
  aspectRatio?: number;
  axis?: "width" | "height";
}): { width: number; height: number } {
  if (!(args.aspectRatio && args.aspectRatio > 0)) {
    return {
      width: Math.max(DEFAULT_EMBEDDED_WIDTH, Math.round(args.width)),
      height: Math.max(DEFAULT_EMBEDDED_HEIGHT, Math.round(args.height)),
    };
  }

  const minSize = fitEmbeddedAspectRatioIntoBounds(
    args.aspectRatio,
    INITIAL_EMBEDDED_MAX_WIDTH,
    INITIAL_EMBEDDED_MAX_HEIGHT,
  );

  if (args.axis === "height") {
    let nextHeight = Math.max(minSize.height, Math.round(args.height));
    let nextWidth = Math.round(nextHeight * args.aspectRatio);
    if (nextWidth < minSize.width) {
      nextWidth = minSize.width;
      nextHeight = Math.max(minSize.height, Math.round(nextWidth / args.aspectRatio));
    }
    return { width: nextWidth, height: nextHeight };
  }

  let nextWidth = Math.max(minSize.width, Math.round(args.width));
  let nextHeight = Math.round(nextWidth / args.aspectRatio);
  if (nextHeight < minSize.height) {
    nextHeight = minSize.height;
    nextWidth = Math.max(minSize.width, Math.round(nextHeight * args.aspectRatio));
  }
  return { width: nextWidth, height: nextHeight };
}

export function getDefaultEmbeddedSize(): { width: number; height: number } {
  return { width: DEFAULT_EMBEDDED_WIDTH, height: DEFAULT_EMBEDDED_HEIGHT };
}

export function isLegacyDefaultEmbeddedSize(width?: number, height?: number): boolean {
  return width === LEGACY_DEFAULT_EMBEDDED_WIDTH && height === LEGACY_DEFAULT_EMBEDDED_HEIGHT;
}

function fitEmbeddedAspectRatioIntoBounds(
  aspectRatio: number,
  maxWidth: number,
  maxHeight: number,
): EmbeddedPresetSize {
  if (!(aspectRatio > 0)) {
    return { width: maxWidth, height: maxHeight };
  }

  const width = Math.round(Math.min(maxWidth, maxHeight * aspectRatio));
  const height = Math.round(width / aspectRatio);
  return {
    width: Math.max(1, width),
    height: Math.max(1, height),
  };
}

function getEmbeddedAspectRatioPresets(aspectRatio: number): EmbeddedPresetSize[] {
  return dedupePresetSizes([
    fitEmbeddedAspectRatioIntoBounds(aspectRatio, INITIAL_EMBEDDED_MAX_WIDTH, INITIAL_EMBEDDED_MAX_HEIGHT),
    fitEmbeddedAspectRatioIntoBounds(aspectRatio, MEDIUM_EMBEDDED_MAX_WIDTH, MEDIUM_EMBEDDED_MAX_HEIGHT),
    fitEmbeddedAspectRatioIntoBounds(aspectRatio, LARGE_EMBEDDED_MAX_WIDTH, LARGE_EMBEDDED_MAX_HEIGHT),
  ]);
}

function getFallbackEmbeddedPresets(): EmbeddedPresetSize[] {
  return [
    { width: DEFAULT_EMBEDDED_WIDTH, height: DEFAULT_EMBEDDED_HEIGHT },
    { width: MEDIUM_EMBEDDED_MAX_WIDTH, height: MEDIUM_EMBEDDED_MAX_HEIGHT },
    { width: LARGE_EMBEDDED_MAX_WIDTH, height: LARGE_EMBEDDED_MAX_HEIGHT },
  ];
}

function dedupePresetSizes(presets: EmbeddedPresetSize[]): EmbeddedPresetSize[] {
  return presets.filter((preset, index) => {
    return presets.findIndex((candidate) => candidate.width === preset.width && candidate.height === preset.height) === index;
  });
}

function isStrictGrowPreset(currentWidth: number, currentHeight: number, preset: EmbeddedPresetSize): boolean {
  return (preset.width >= currentWidth && preset.height >= currentHeight)
    && (preset.width > currentWidth || preset.height > currentHeight);
}

function isStrictShrinkPreset(currentWidth: number, currentHeight: number, preset: EmbeddedPresetSize): boolean {
  return (preset.width <= currentWidth && preset.height <= currentHeight)
    && (preset.width < currentWidth || preset.height < currentHeight);
}
