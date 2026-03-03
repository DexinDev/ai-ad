import fs from "fs/promises";
import path from "path";
import Ajv, { JSONSchemaType } from "ajv";
import { MetricsWithInputSummary } from "./metrics";

export interface Versions {
  app: string;
  libs: {
    sharp: string;
    puppeteer: string;
  };
  schemaId: string;
}

export interface ResultJson extends MetricsWithInputSummary {
  versions: Versions;
}

export interface WriteResultJsonOptions {
  resultPath: string;
  metrics: MetricsWithInputSummary;
}

const ajv = new Ajv();

// Only validate high-level structure minimally; detailed schema can evolve later.
const resultSchema: JSONSchemaType<ResultJson> = {
  type: "object",
  properties: {
    overallScore: { type: "number" },
    status: { type: "string", enum: ["needs_work", "ok", "excellent"] },
    subscores: {
      type: "object",
      properties: {
        readability: { type: "number" },
        contrast_color: { type: "number" },
        clutter: { type: "number" },
        visual_hierarchy: { type: "number" },
        cta_qr: { type: "number" },
        brand: { type: "number" },
        contact_time_fit: { type: "number" },
        legal_compliance: { type: "number" },
      },
      required: [
        "readability",
        "contrast_color",
        "clutter",
        "visual_hierarchy",
        "cta_qr",
        "brand",
        "contact_time_fit",
        "legal_compliance",
      ],
      additionalProperties: false,
    },
    metricsRaw: {
      type: "object",
      properties: {
        orientation: {
          type: "string",
          enum: ["horizontal", "vertical", "square"],
        },
        imageStats: {
          type: "object",
          properties: {
            meanLuma: { type: "number" },
            stdLuma: { type: "number" },
            colorfulness: { type: "number" },
          },
          required: ["meanLuma", "stdLuma", "colorfulness"],
          additionalProperties: false,
        },
        edgeDensity: { type: "number" },
        textLikelihood: {
          type: "string",
          enum: ["low", "medium", "high"],
        },
      },
      required: ["orientation", "imageStats", "edgeDensity", "textLikelihood"],
      additionalProperties: false,
    },
    assumptions: {
      type: "object",
      properties: {
        defaults: {
          type: "object",
          properties: {
            structureHeightM: { type: "number" },
            avgVehicleSpeedKmh: { type: "number" },
            viewpoints: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  angleDeg: { type: "number" },
                  distanceM: { type: "number" },
                  speedKmh: { type: "number" },
                },
                required: ["angleDeg", "distanceM", "speedKmh"],
                additionalProperties: false,
              },
            },
          },
          required: ["structureHeightM", "avgVehicleSpeedKmh", "viewpoints"],
          additionalProperties: false,
        },
        notImplemented: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: ["defaults", "notImplemented"],
      additionalProperties: false,
    },
    recommendations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          message: { type: "string" },
          expectedGain: { type: "number" },
          rationale: { type: "string" },
        },
        required: ["id", "message", "expectedGain", "rationale"],
        additionalProperties: false,
      },
    },
    inputSummary: {
      type: "object",
      properties: {
        fileName: { type: "string" },
        fileType: { type: "string" },
        widthPx: { type: "number" },
        heightPx: { type: "number" },
        orientation: {
          type: "string",
          enum: ["horizontal", "vertical", "square"],
        },
      },
      required: ["fileName", "fileType", "widthPx", "heightPx", "orientation"],
      additionalProperties: false,
    },
    versions: {
      type: "object",
      properties: {
        app: { type: "string" },
        libs: {
          type: "object",
          properties: {
            sharp: { type: "string" },
            puppeteer: { type: "string" },
          },
          required: ["sharp", "puppeteer"],
          additionalProperties: false,
        },
        schemaId: { type: "string" },
      },
      required: ["app", "libs", "schemaId"],
      additionalProperties: false,
    },
  },
  required: [
    "overallScore",
    "status",
    "subscores",
    "metricsRaw",
    "assumptions",
    "recommendations",
    "inputSummary",
    "versions",
  ],
  additionalProperties: false,
};

const validateResult = ajv.compile(resultSchema);

export async function writeResultJson(
  opts: WriteResultJsonOptions,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pkg = require(path.join(__dirname, "..", "..", "package.json")) as {
    version: string;
    dependencies?: Record<string, string>;
  };

  const versions: Versions = {
    app: pkg.version,
    libs: {
      sharp: pkg.dependencies?.sharp ?? "unknown",
      puppeteer: pkg.dependencies?.puppeteer ?? "unknown",
    },
    schemaId: "mvp-1",
  };

  const full: ResultJson = {
    ...opts.metrics,
    versions,
  };

  if (!validateResult(full)) {
    throw new Error(
      `Generated result failed schema validation: ${JSON.stringify(
        validateResult.errors,
      )}`,
    );
  }

  await fs.writeFile(opts.resultPath, JSON.stringify(full, null, 2), "utf-8");
}

