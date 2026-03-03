export type Orientation = "horizontal" | "vertical" | "square";

export interface ImageStats {
  meanLuma: number; // 0..1
  stdLuma: number; // 0..1
  colorfulness: number; // arbitrary, mapped later to 0..100
}

export interface RawMetrics {
  orientation: Orientation;
  imageStats: ImageStats;
  edgeDensity: number; // 0..1
  textLikelihood: "low" | "medium" | "high";
}

export interface Subscores {
  readability: number;
  contrast_color: number;
  clutter: number;
  visual_hierarchy: number;
  cta_qr: number;
  brand: number;
  contact_time_fit: number;
  legal_compliance: number;
}

export type Status = "needs_work" | "ok" | "excellent";

export interface Recommendation {
  id: string;
  message: string;
  expectedGain: number; // 0..100 delta
  rationale: string;
}

export interface Assumptions {
  defaults: {
    structureHeightM: number;
    avgVehicleSpeedKmh: number;
    viewpoints: Array<{
      angleDeg: number;
      distanceM: number;
      speedKmh: number;
    }>;
  };
  notImplemented: string[];
}

export interface MetricsAndScores {
  overallScore: number;
  status: Status;
  subscores: Subscores;
  metricsRaw: RawMetrics;
  assumptions: Assumptions;
  recommendations: Recommendation[];
}

