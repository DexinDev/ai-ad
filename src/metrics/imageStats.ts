import sharp from "sharp";
import { ImageStats } from "./types";

export interface ComputeImageStatsOptions {
  previewPath: string;
  maxWidth?: number;
}

const DEFAULT_METRIC_WIDTH = 512;

export async function computeImageStats(
  opts: ComputeImageStatsOptions,
): Promise<{
  stats: ImageStats;
  width: number;
  height: number;
}> {
  const img = sharp(opts.previewPath)
    .toColorspace("srgb")
    .resize({ width: opts.maxWidth ?? DEFAULT_METRIC_WIDTH, withoutEnlargement: true })
    .raw()
    .ensureAlpha();

  const { data, info } = await img.toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  if (channels < 3) {
    throw new Error("Expected at least 3 channels for RGB image.");
  }

  const pixelCount = width * height;
  let sumLuma = 0;
  let sumLumaSq = 0;

  // Hasler/Susstrunk-like colorfulness proxy
  let sumRg = 0;
  let sumYb = 0;
  let sumRgSq = 0;
  let sumYbSq = 0;

  for (let i = 0; i < pixelCount; i += 1) {
    const r = data[i * channels] / 255;
    const g = data[i * channels + 1] / 255;
    const b = data[i * channels + 2] / 255;

    // Rec. 601 luma approximation
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    sumLuma += luma;
    sumLumaSq += luma * luma;

    const rg = r - g;
    const yb = 0.5 * (r + g) - b;
    sumRg += rg;
    sumYb += yb;
    sumRgSq += rg * rg;
    sumYbSq += yb * yb;
  }

  const meanLuma = sumLuma / pixelCount;
  const varLuma = sumLumaSq / pixelCount - meanLuma * meanLuma;
  const stdLuma = Math.sqrt(Math.max(0, varLuma));

  const meanRg = sumRg / pixelCount;
  const meanYb = sumYb / pixelCount;
  const stdRg = Math.sqrt(
    Math.max(0, sumRgSq / pixelCount - meanRg * meanRg),
  );
  const stdYb = Math.sqrt(
    Math.max(0, sumYbSq / pixelCount - meanYb * meanYb),
  );

  const colorfulness =
    Math.sqrt(stdRg * stdRg + stdYb * stdYb) +
    0.3 * Math.sqrt(meanRg * meanRg + meanYb * meanYb);

  const stats: ImageStats = {
    meanLuma,
    stdLuma,
    colorfulness,
  };

  return { stats, width, height };
}

