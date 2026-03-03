import sharp from "sharp";

export interface ComputeEdgeDensityOptions {
  previewPath: string;
  maxWidth?: number;
}

const DEFAULT_EDGE_WIDTH = 512;

export async function computeEdgeDensity(
  opts: ComputeEdgeDensityOptions,
): Promise<{ edgeDensity: number }> {
  const img = sharp(opts.previewPath)
    .toColorspace("b-w")
    .resize({ width: opts.maxWidth ?? DEFAULT_EDGE_WIDTH, withoutEnlargement: true })
    .raw();

  const { data, info } = await img.toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  if (channels < 1) {
    throw new Error("Expected at least 1 channel for grayscale image.");
  }

  const sobelX = [
    -1, 0, 1,
    -2, 0, 2,
    -1, 0, 1,
  ];
  const sobelY = [
    -1, -2, -1,
     0,  0,  0,
     1,  2,  1,
  ];

  let edgeCount = 0;
  let maxMag = 0;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      let gx = 0;
      let gy = 0;

      let k = 0;
      for (let ky = -1; ky <= 1; ky += 1) {
        for (let kx = -1; kx <= 1; kx += 1) {
          const px = x + kx;
          const py = y + ky;
          const idx = (py * width + px) * channels;
          const v = data[idx]; // 0..255
          gx += v * sobelX[k];
          gy += v * sobelY[k];
          k += 1;
        }
      }

      const mag = Math.sqrt(gx * gx + gy * gy);
      if (mag > maxMag) maxMag = mag;
    }
  }

  if (maxMag === 0) {
    return { edgeDensity: 0 };
  }

  const threshold = maxMag * 0.3;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      let gx = 0;
      let gy = 0;

      let k = 0;
      for (let ky = -1; ky <= 1; ky += 1) {
        for (let kx = -1; kx <= 1; kx += 1) {
          const px = x + kx;
          const py = y + ky;
          const idx = (py * width + px) * channels;
          const v = data[idx];
          gx += v * sobelX[k];
          gy += v * sobelY[k];
          k += 1;
        }
      }

      const mag = Math.sqrt(gx * gx + gy * gy);
      if (mag > threshold) {
        edgeCount += 1;
      }
    }
  }

  const totalInteriorPixels = (width - 2) * (height - 2);
  const edgeDensity =
    totalInteriorPixels > 0 ? edgeCount / totalInteriorPixels : 0;

  return { edgeDensity };
}

