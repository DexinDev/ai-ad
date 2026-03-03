import http from "http";
import fs from "fs";
import path from "path";
import url from "url";
import { ensurePngPreview } from "../tools/render";

// Опираемся на расположение скомпилированного server.js (dist/annotator),
// чтобы корректно находить корень проекта и папку samples вне зависимости от cwd.
const PROJECT_ROOT = path.join(__dirname, "..", "..");
const SAMPLES_DIR = path.join(PROJECT_ROOT, "samples");
const DATA_DIR = path.join(PROJECT_ROOT, "data");
const ANNOTATIONS_DIR = path.join(DATA_DIR, "annotations");
const PREVIEWS_DIR = path.join(DATA_DIR, "annotator_previews");

interface CreativeInfo {
  id: string;
  index: number;
  filePath: string;
  fileName: string;
}

function collectCreatives(): CreativeInfo[] {
  if (!fs.existsSync(SAMPLES_DIR)) {
    return [];
  }
  const entries = fs.readdirSync(SAMPLES_DIR, { withFileTypes: true });
  const supportedExts = new Set([".png", ".jpg", ".jpeg", ".pdf"]);
  const files: CreativeInfo[] = [];
  let index = 0;
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const full = path.join(SAMPLES_DIR, entry.name);
    const ext = path.extname(full).toLowerCase();
    if (!supportedExts.has(ext)) continue;
    files.push({
      id: `${index}`,
      index,
      filePath: full,
      fileName: entry.name,
    });
    index += 1;
  }
  return files;
}

const creatives = collectCreatives();

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(ANNOTATIONS_DIR)) {
  fs.mkdirSync(ANNOTATIONS_DIR, { recursive: true });
}
if (!fs.existsSync(PREVIEWS_DIR)) {
  fs.mkdirSync(PREVIEWS_DIR, { recursive: true });
}

function sendJson(res: http.ServerResponse, status: number, payload: unknown) {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Length", Buffer.byteLength(body));
  res.end(body);
}

function sendText(res: http.ServerResponse, status: number, text: string) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end(text);
}

async function handlePreview(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  index: number,
): Promise<void> {
  const creative = creatives[index];
  if (!creative) {
    sendText(res, 404, "Creative not found");
    return;
  }
  const previewPath = path.join(PREVIEWS_DIR, `${creative.id}.png`);
  if (!fs.existsSync(previewPath)) {
    await ensurePngPreview({
      inputFile: creative.filePath,
      outputFile: previewPath,
    });
  }
  const stream = fs.createReadStream(previewPath);
  res.statusCode = 200;
  res.setHeader("Content-Type", "image/png");
  stream.pipe(res);
}

async function handleSaveAnnotation(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  index: number,
): Promise<void> {
  const creative = creatives[index];
  if (!creative) {
    sendText(res, 404, "Creative not found");
    return;
  }
  const chunks: Buffer[] = [];
  req.on("data", (chunk) => {
    chunks.push(chunk as Buffer);
  });
  req.on("end", () => {
    try {
      const raw = Buffer.concat(chunks).toString("utf-8");
      const payload = raw ? JSON.parse(raw) : {};
      const annotatorId =
        typeof payload.annotatorId === "string" && payload.annotatorId.trim()
          ? payload.annotatorId.trim()
          : null;
      const metrics = payload.metrics ?? {};
      const record = {
        creativeId: creative.id,
        fileName: creative.fileName,
        index: creative.index,
        annotatorId,
        metrics,
        createdAt: new Date().toISOString(),
      };
      const outPath = path.join(ANNOTATIONS_DIR, `${creative.id}.json`);
      let existing: unknown[] = [];
      if (fs.existsSync(outPath)) {
        try {
          const txt = fs.readFileSync(outPath, "utf-8");
          existing = JSON.parse(txt);
          if (!Array.isArray(existing)) existing = [];
        } catch {
          existing = [];
        }
      }
      existing.push(record);
      fs.writeFileSync(outPath, JSON.stringify(existing, null, 2), "utf-8");
      sendJson(res, 200, { ok: true });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Failed to save annotation", err);
      sendText(res, 400, "Invalid JSON payload");
    }
  });
}

function loadAnnotatorHtml(): string {
  const templatePath = path.join(
    process.cwd(),
    "templates",
    "annotator.html",
  );
  if (!fs.existsSync(templatePath)) {
    return "<!DOCTYPE html><html><body><p>annotator.html not found.</p></body></html>";
  }
  return fs.readFileSync(templatePath, "utf-8");
}

const annotatorHtml = loadAnnotatorHtml();

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url ?? "", true);
  const pathname = parsed.pathname ?? "/";

  if (req.method === "GET" && pathname === "/") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(annotatorHtml);
    return;
  }

  if (req.method === "GET" && pathname === "/api/creatives") {
    sendJson(res, 200, {
      total: creatives.length,
    });
    return;
  }

  const previewMatch = pathname.match(/^\/api\/creative\/(\d+)\/image$/);
  if (req.method === "GET" && previewMatch) {
    const index = Number(previewMatch[1]);
    await handlePreview(req, res, index);
    return;
  }

  const labelMatch = pathname.match(/^\/api\/creative\/(\d+)\/labels$/);
  if (req.method === "POST" && labelMatch) {
    const index = Number(labelMatch[1]);
    await handleSaveAnnotation(req, res, index);
    return;
  }

  sendText(res, 404, "Not found");
});

const port = Number(process.env.ANNOTATOR_PORT ?? 3030);
// eslint-disable-next-line no-console
console.log(
  `Annotator UI running at http://localhost:${port}/ (samples from ${SAMPLES_DIR})`,
);
server.listen(port);

