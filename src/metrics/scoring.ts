import {
  Assumptions,
  MetricsAndScores,
  Orientation,
  RawMetrics,
  Subscores,
} from "./types";

export interface BuildMetricsAndScoresOptions {
  raw: RawMetrics;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function mapStdLumaToContrastScore(stdLuma: number): number {
  // Heuristic: 0.0 => 10, 0.25 => 60, 0.5+ => 95 (clamped)
  const clamped = Math.max(0, Math.min(0.5, stdLuma));
  const score = 10 + (clamped / 0.5) * (95 - 10);
  return clampScore(score);
}

function mapEdgeDensityToClutterScore(edgeDensity: number): number {
  // More edges => more clutter => lower score.
  // Assume edgeDensity 0.05 => 90, 0.3 => 60, 0.6+ => 25
  const ed = Math.max(0, Math.min(0.6, edgeDensity));
  const t = ed / 0.6;
  const score = 90 * (1 - t) + 25 * t;
  return clampScore(score);
}

function mapColorfulnessToScore(colorfulness: number): number {
  // Heuristic mapping approx 0..0.5 => 20..60, 1.0+ => 85
  const cf = Math.max(0, Math.min(1.0, colorfulness));
  const score = 20 + cf * (85 - 20);
  return clampScore(score);
}

function deriveStatus(overallScore: number): "needs_work" | "ok" | "excellent" {
  if (overallScore >= 80) return "excellent";
  if (overallScore >= 60) return "ok";
  return "needs_work";
}

export function buildMetricsAndScores(
  opts: BuildMetricsAndScoresOptions,
): MetricsAndScores {
  const { raw } = opts;

  const contrastScore = mapStdLumaToContrastScore(raw.imageStats.stdLuma);
  const clutterScore = mapEdgeDensityToClutterScore(raw.edgeDensity);
  const colorScore = mapColorfulnessToScore(raw.imageStats.colorfulness);

  const readabilityScore = 0.6 * contrastScore + 0.4 * clutterScore;

  // Heuristic text presence bonus/penalty, used for secondary subscores.
  const textBonus =
    raw.textLikelihood === "high"
      ? 8
      : raw.textLikelihood === "medium"
      ? 0
      : -8;

  // Visual hierarchy: good when readability is high, clutter is under control,
  // and there is a reasonable amount of text. Purely derived from 0–100
  // subscores so that the result itself can meaningfully span 0–100.
  const visualHierarchyBase =
    0.7 * readabilityScore + 0.3 * clutterScore + textBonus;
  const visualHierarchyScore = clampScore(visualHierarchyBase);

  // CTA / QR proxy: assumes CTA is text-based and benefits from high contrast,
  // good readability and lower clutter. Built as a weighted mix of 0–100
  // subscores without any hard baseline, so low‑качественные макеты могут
  // опускаться ближе к 0.
  const ctaQrBase =
    0.5 * contrastScore + 0.3 * readabilityScore + 0.2 * clutterScore + textBonus;
  const ctaQrScore = clampScore(ctaQrBase);

  // Brand proxy: favors reasonably strong colorfulness and not-too-high clutter.
  // This does NOT detect logos, only gives a weak proxy for "branding headroom".
  // Комбинируем 0–100 оценку цветности и "чистоты" макета, без фиксированного
  // смещения, чтобы диапазон 0–100 реально использовался.
  const brandBase = 0.6 * colorScore + 0.4 * clutterScore;
  const brandScore = clampScore(brandBase);

  // Contact time fit: primarily driven by readability and clutter, adjusted by
  // how likely it is that there is readable text. Собираем из 0–100 метрик
  // без "минимума 60".
  const contactTimeFitBase =
    0.7 * readabilityScore + 0.3 * clutterScore + textBonus;
  const contactTimeFitScore = clampScore(contactTimeFitBase);

  // Legal compliance cannot be inferred from simple pixel statistics in this MVP.
  // Keep a neutral placeholder value while clearly flagging lack of a model
  // in the assumptions metadata.
  const legalComplianceScore = 60;

  const subscores: Subscores = {
    readability: Math.round(readabilityScore),
    contrast_color: Math.round(0.7 * contrastScore + 0.3 * colorScore),
    clutter: Math.round(clutterScore),
    visual_hierarchy: Math.round(visualHierarchyScore),
    cta_qr: Math.round(ctaQrScore),
    brand: Math.round(brandScore),
    contact_time_fit: Math.round(contactTimeFitScore),
    legal_compliance: legalComplianceScore,
  };

  // Общий балл: взвешенная средняя по ключевым сабскорам, чтобы он отражал
  // не только читаемость, но и иерархию, CTA, бренд и соответствие времени контакта.
  const overallBase =
    0.35 * subscores.readability +
    0.15 * subscores.visual_hierarchy +
    0.15 * subscores.cta_qr +
    0.15 * subscores.brand +
    0.15 * subscores.contact_time_fit +
    0.05 * subscores.legal_compliance;
  const overallScore = Math.round(clampScore(overallBase));
  const status = deriveStatus(overallScore);

  const assumptions: Assumptions = {
    defaults: {
      structureHeightM: 5.5,
      avgVehicleSpeedKmh: 40,
      viewpoints: [
        {
          angleDeg: 45,
          distanceM: 15,
          speedKmh: 40,
        },
      ],
    },
    notImplemented: [
      "true OCR-based text detection and text block segmentation",
      "full visual hierarchy model (current score is a heuristic proxy)",
      "brand asset/logo detection (current score only uses color/contrast heuristics)",
      "explicit QR/CTA symbol detection (current score approximates visibility only)",
      "legal small-print compliance model (no disclaimer or regulation checks)",
    ],
  };

  const metricsAndScores: MetricsAndScores = {
    overallScore,
    status,
    subscores,
    metricsRaw: raw,
    assumptions,
    recommendations: [], // populated later
  };

  return metricsAndScores;
}

export function deriveOrientation(
  width: number,
  height: number,
): Orientation {
  const ratio = width / height;
  if (ratio > 1.1) return "horizontal";
  if (ratio < 0.9) return "vertical";
  return "square";
}

