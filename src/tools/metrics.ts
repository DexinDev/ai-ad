import sharp from "sharp";
import { computeImageStats } from "../metrics/imageStats";
import { computeEdgeDensity } from "../metrics/edgeDensity";
import {
  MetricsAndScores,
  Orientation,
  RawMetrics,
} from "../metrics/types";
import { buildMetricsAndScores, deriveOrientation } from "../metrics/scoring";
import { generateRecommendations } from "../metrics/recommendations";

export interface ComputeMetricsAndScoresOptions {
  previewPath: string;
  width: number;
  height: number;
  fileName: string;
  fileType: string;
}

export interface MetricsWithInputSummary extends MetricsAndScores {
  inputSummary: {
    fileName: string;
    fileType: string;
    widthPx: number;
    heightPx: number;
    orientation: Orientation;
  };
}

export async function computeMetricsAndScores(
  opts: ComputeMetricsAndScoresOptions,
): Promise<MetricsWithInputSummary> {
  // Ensure we can read the preview
  await sharp(opts.previewPath).metadata();

  const { stats } = await computeImageStats({
    previewPath: opts.previewPath,
  });

  const { edgeDensity } = await computeEdgeDensity({
    previewPath: opts.previewPath,
  });

  const orientation = deriveOrientation(opts.width, opts.height);

  const textLikelihood: "low" | "medium" | "high" = (() => {
    if (edgeDensity > 0.35 && stats.stdLuma > 0.18) return "high";
    if (edgeDensity > 0.2 && stats.stdLuma > 0.12) return "medium";
    return "low";
  })();

  const raw: RawMetrics = {
    orientation,
    imageStats: stats,
    edgeDensity,
    textLikelihood,
  };

  const base = buildMetricsAndScores({ raw });
  const withRecs = {
    ...base,
    recommendations: generateRecommendations(base),
  };

  const result: MetricsWithInputSummary = {
    ...withRecs,
    inputSummary: {
      fileName: opts.fileName,
      fileType: opts.fileType,
      widthPx: opts.width,
      heightPx: opts.height,
      orientation,
    },
  };

  return result;
}

