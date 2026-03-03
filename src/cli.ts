import { Command } from "commander";
import path from "path";
import { analyzePath } from "./pipeline/analyze";

const pkg = require("../package.json") as { version: string };

async function main() {
  const program = new Command();

  program
    .name("ooh-creative-analyzer")
    .description("Offline OOH creative analyzer MVP")
    .version(pkg.version)
    .requiredOption("--input <path>", "Input file or directory (PNG/JPG/JPEG/PDF)")
    .requiredOption("--output <path>", "Output directory")
    .option("--kpi <kpi>", "Primary KPI (readability|brand|cta_qr)", "readability")
    .option(
      "--llm",
      "Use OpenAI LLM (requires OPENAI_API_KEY) to refine advanced metrics",
      false,
    );

  program.parse(process.argv);
  const opts = program.opts<{
    input: string;
    output: string;
    kpi: "readability" | "brand" | "cta_qr";
    llm?: boolean;
  }>();

  const inputPath = path.resolve(process.cwd(), opts.input);
  const outputPath = path.resolve(process.cwd(), opts.output);

  try {
    const summary = await analyzePath({
      inputPath,
      outputPath,
      primaryKpi: opts.kpi,
      useLlm: Boolean(opts.llm),
    });

    // Final console summary
    // eslint-disable-next-line no-console
    console.log(
      `\nDone. Processed ${summary.processed} file(s), failed ${summary.failed}. Outputs at: ${outputPath}`,
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Fatal error while running analysis:", err);
    process.exitCode = 1;
  }
}

void main();

