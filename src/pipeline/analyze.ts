import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { ensurePngPreview } from "../tools/render";
import { computeMetricsAndScores } from "../tools/metrics";
import { writeBriefJson } from "../tools/brief";
import { writeResultJson } from "../tools/result";
import { enrichWithOpenAi } from "../llm/enrich";
import { renderReportPdf } from "../report/renderReport";

const SUPPORTED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".pdf"];

export interface AnalyzePathOptions {
  inputPath: string;
  outputPath: string;
  primaryKpi: "readability" | "brand" | "cta_qr";
  useLlm?: boolean;
}

export interface AnalyzeSummary {
  processed: number;
  failed: number;
}

function isSupportedFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return SUPPORTED_EXTENSIONS.includes(ext);
}

function collectInputFiles(inputPath: string): string[] {
  const stat = fs.statSync(inputPath);
  if (stat.isFile()) {
    return isSupportedFile(inputPath) ? [inputPath] : [];
  }

  const files: string[] = [];
  const entries = fs.readdirSync(inputPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile()) {
      const full = path.join(inputPath, entry.name);
      if (isSupportedFile(full)) files.push(full);
    }
    if (entry.isDirectory()) {
      // one level deep for MVP
      const subEntries = fs.readdirSync(path.join(inputPath, entry.name), {
        withFileTypes: true,
      });
      for (const se of subEntries) {
        if (!se.isFile()) continue;
        const full = path.join(inputPath, entry.name, se.name);
        if (isSupportedFile(full)) files.push(full);
      }
    }
  }
  return files;
}

export async function analyzePath(opts: AnalyzePathOptions): Promise<AnalyzeSummary> {
  if (!fs.existsSync(opts.inputPath)) {
    throw new Error(`Input path does not exist: ${opts.inputPath}`);
  }
  if (!fs.existsSync(opts.outputPath)) {
    fs.mkdirSync(opts.outputPath, { recursive: true });
  }

  const inputFiles = collectInputFiles(opts.inputPath);
  if (inputFiles.length === 0) {
    // eslint-disable-next-line no-console
    console.warn("No supported input files found (PNG, JPG, JPEG, PDF).");
    return { processed: 0, failed: 0 };
  }

  let processed = 0;
  let failed = 0;

  for (const file of inputFiles) {
    const jobId = uuidv4();
    const jobDir = path.join(opts.outputPath, jobId);
    fs.mkdirSync(jobDir, { recursive: true });

    const fileName = path.basename(file);
    const fileExt = path.extname(file).toLowerCase();

    // eslint-disable-next-line no-console
    console.log(`\n[${jobId}] Processing ${fileName} ...`);

    try {
      const previewPath = path.join(jobDir, "input_preview.png");

      const previewInfo = await ensurePngPreview({
        inputFile: file,
        outputFile: previewPath,
      });

      const briefPath = path.join(jobDir, "brief.json");
      await writeBriefJson({
        briefPath,
        primaryKpi: opts.primaryKpi,
      });

      let metrics = await computeMetricsAndScores({
        previewPath,
        width: previewInfo.width,
        height: previewInfo.height,
        fileName,
        fileType: fileExt.replace(".", ""),
      });

      if (opts.useLlm) {
        try {
          const enrichment = await enrichWithOpenAi({
            previewPath,
            metrics,
          });
          if (enrichment) {
            if (enrichment.subscoresOverride) {
              metrics = {
                ...metrics,
                subscores: {
                  ...metrics.subscores,
                  ...enrichment.subscoresOverride,
                },
              };
            }
            if (enrichment.recommendationsOverride) {
              metrics = {
                ...metrics,
                recommendations: enrichment.recommendationsOverride,
              };
            }
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn(
            `[${jobId}] LLM enrichment failed, continuing with base metrics:`,
            (err as Error).message ?? err,
          );
        }
      }

      // Пересчёт общего балла и статуса из актуальных сабскоров (с учётом LLM).
      {
        const s = metrics.subscores;
        const clamp = (v: number) => Math.max(0, Math.min(100, v));
        const overallBase =
          0.35 * s.readability +
          0.15 * s.visual_hierarchy +
          0.15 * s.cta_qr +
          0.15 * s.brand +
          0.15 * s.contact_time_fit +
          0.05 * s.legal_compliance;
        const overallScore = Math.round(clamp(overallBase));
        const status =
          overallScore >= 80 ? "excellent" : overallScore >= 60 ? "ok" : "needs_work";
        metrics = {
          ...metrics,
          overallScore,
          status,
        };
      }

      const resultPath = path.join(jobDir, "result.json");
      await writeResultJson({
        resultPath,
        metrics,
      });

      const reportPath = path.join(jobDir, "report.pdf");
      await renderReportPdf({
        jobDir,
        previewPath,
        resultPath,
        reportPath,
      });

      processed += 1;
      // eslint-disable-next-line no-console
      console.log(`[${jobId}] Done. Output at ${jobDir}`);
    } catch (err) {
      failed += 1;
      // eslint-disable-next-line no-console
      console.error(
        `[${jobId}] Failed to process ${fileName}:`,
        (err as Error).message ?? err,
      );
      if (file.toLowerCase().endsWith(".pdf")) {
        // eslint-disable-next-line no-console
        console.error(
          "PDF render failed. As a workaround, please export this PDF to a PNG/JPEG and re-run the analyzer.",
        );
      }
      continue;
    }
  }

  return { processed, failed };
}

