import fs from "fs";
import path from "path";
import sharp, { Sharp } from "sharp";
import { createCanvas, Canvas, CanvasRenderingContext2D } from "canvas";

export interface PreviewInfo {
  width: number;
  height: number;
}

export interface EnsurePngPreviewOptions {
  inputFile: string;
  outputFile: string;
}

const MAX_PREVIEW_WIDTH = 2048;

function isPdf(file: string): boolean {
  return path.extname(file).toLowerCase() === ".pdf";
}

async function renderPdfFirstPageToPng(inputFile: string): Promise<Buffer> {
  // Use legacy build for Node.js environment to avoid worker complications.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js") as any;
  const data = new Uint8Array(fs.readFileSync(inputFile));
  const loadingTask = pdfjsLib.getDocument({ data });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(1);

  const viewport = page.getViewport({ scale: 1.0 });
  const canvasFactory = new NodeCanvasFactory();
  const { canvas, context } = canvasFactory.create(
    viewport.width,
    viewport.height,
  );

  await page.render({
    canvasContext: context,
    viewport,
    canvasFactory,
  }).promise;

  const pngBuffer = canvas.toBuffer("image/png");
  return pngBuffer;
}

class NodeCanvasFactory {
  create(
    width: number,
    height: number,
  ): { canvas: Canvas; context: CanvasRenderingContext2D } {
    if (width <= 0 || height <= 0) {
      throw new Error("Invalid canvas size");
    }
    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Failed to get 2D context from canvas");
    }
    return { canvas, context };
  }

  reset(
    canvasAndContext: { canvas: Canvas; context: CanvasRenderingContext2D },
    width: number,
    height: number,
  ): void {
    if (width <= 0 || height <= 0) {
      throw new Error("Invalid canvas size");
    }
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }

  destroy(
    canvasAndContext: { canvas: Canvas; context: CanvasRenderingContext2D },
  ): void {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    canvasAndContext.canvas.width = 0;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    canvasAndContext.canvas.height = 0;
  }
}

async function loadImageAsSharp(inputFile: string): Promise<Sharp> {
  if (isPdf(inputFile)) {
    const pngBuffer = await renderPdfFirstPageToPng(inputFile);
    return sharp(pngBuffer);
  }
  return sharp(inputFile);
}

export async function ensurePngPreview(
  opts: EnsurePngPreviewOptions,
): Promise<PreviewInfo> {
  const image = await loadImageAsSharp(opts.inputFile);

  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Unable to read image dimensions.");
  }

  const scale =
    metadata.width > MAX_PREVIEW_WIDTH
      ? MAX_PREVIEW_WIDTH / metadata.width
      : 1.0;

  const pipeline = image
    .toColorspace("srgb")
    .resize({
      width:
        scale < 1
          ? Math.round(metadata.width * scale)
          : metadata.width,
      height:
        scale < 1
          ? Math.round(metadata.height! * scale)
          : metadata.height,
    })
    .png({ compressionLevel: 6 });

  const outDir = path.dirname(opts.outputFile);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const { width, height } = await pipeline.toFile(opts.outputFile);

  return {
    width: width ?? metadata.width,
    height: height ?? metadata.height!,
  };
}

