import fs from "fs/promises";
import Ajv, { JSONSchemaType } from "ajv";

export interface Brief {
  goals: {
    primaryObjectives: string[];
    primaryKpi: "readability" | "brand" | "cta_qr";
  };
  context: {
    structureHeightM: number;
    avgVehicleSpeedKmh: number;
  };
  simulation: {
    viewpoints: Array<{
      angleDeg: number;
      distanceM: number;
      speedKmh: number;
    }>;
  };
  reporting: {
    reportFormat: "pdf";
  };
  integration: {
    platform: "desktop_mvp";
  };
}

export interface WriteBriefJsonOptions {
  briefPath: string;
  primaryKpi: "readability" | "brand" | "cta_qr";
}

const ajv = new Ajv();

const briefSchema: JSONSchemaType<Brief> = {
  type: "object",
  properties: {
    goals: {
      type: "object",
      properties: {
        primaryObjectives: {
          type: "array",
          items: { type: "string" },
        },
        primaryKpi: {
          type: "string",
          enum: ["readability", "brand", "cta_qr"],
        },
      },
      required: ["primaryObjectives", "primaryKpi"],
      additionalProperties: false,
    },
    context: {
      type: "object",
      properties: {
        structureHeightM: { type: "number" },
        avgVehicleSpeedKmh: { type: "number" },
      },
      required: ["structureHeightM", "avgVehicleSpeedKmh"],
      additionalProperties: false,
    },
    simulation: {
      type: "object",
      properties: {
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
      required: ["viewpoints"],
      additionalProperties: false,
    },
    reporting: {
      type: "object",
      properties: {
        reportFormat: { type: "string", const: "pdf" },
      },
      required: ["reportFormat"],
      additionalProperties: false,
    },
    integration: {
      type: "object",
      properties: {
        platform: { type: "string", const: "desktop_mvp" },
      },
      required: ["platform"],
      additionalProperties: false,
    },
  },
  required: ["goals", "context", "simulation", "reporting", "integration"],
  additionalProperties: false,
};

const validateBrief = ajv.compile(briefSchema);

export async function writeBriefJson(
  opts: WriteBriefJsonOptions,
): Promise<void> {
  const brief: Brief = {
    goals: {
      primaryObjectives: ["awareness"],
      primaryKpi: opts.primaryKpi,
    },
    context: {
      structureHeightM: 5.5,
      avgVehicleSpeedKmh: 40,
    },
    simulation: {
      viewpoints: [
        {
          angleDeg: 45,
          distanceM: 15,
          speedKmh: 40,
        },
      ],
    },
    reporting: {
      reportFormat: "pdf",
    },
    integration: {
      platform: "desktop_mvp",
    },
  };

  if (!validateBrief(brief)) {
    throw new Error(
      `Generated brief failed schema validation: ${JSON.stringify(
        validateBrief.errors,
      )}`,
    );
  }

  await fs.writeFile(opts.briefPath, JSON.stringify(brief, null, 2), "utf-8");
}

