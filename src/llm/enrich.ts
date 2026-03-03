import fs from "fs/promises";
import OpenAI from "openai";
import { MetricsWithInputSummary } from "../tools/metrics";
import { Recommendation, Subscores } from "../metrics/types";

export interface LlmEnrichmentResult {
  subscoresOverride?: Partial<Subscores>;
  recommendationsOverride?: Recommendation[];
}

export interface EnrichWithOpenAiOptions {
  previewPath: string;
  metrics: MetricsWithInputSummary;
}

export async function enrichWithOpenAi(
  opts: EnrichWithOpenAiOptions,
): Promise<LlmEnrichmentResult | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // eslint-disable-next-line no-console
    console.warn(
      "[LLM] OPENAI_API_KEY is not set, skipping LLM enrichment for this run.",
    );
    return null;
  }

  const client = new OpenAI({ apiKey });

  const imgBuf = await fs.readFile(opts.previewPath);
  const imgBase64 = imgBuf.toString("base64");

  const {
    subscores,
    metricsRaw,
    inputSummary: { fileName },
    recommendations,
  } = opts.metrics;

  const systemPrompt =
    "Ты маркетолог и креативный стратег по наружной рекламе (OOH). " +
    "Оценивай макеты по заданным метрикам, представляя, что человек видит щит 0.5–1 секунду первым взглядом " +
    "и ещё 2–3 секунды вторым, без вчитывания в мелкий текст.";

  const userInstruction = `
У тебя есть:
- превью макета (картинка);
- базовые числовые метрики (контраст, загруженность, читаемость и т.п.);
- черновые рекомендации от простых эвристик.

Тебе нужно:

1) Скорректировать только следующие метрики (0–100):
- visual_hierarchy — насколько ясно выстроена визуальная иерархия (что главное, что второстепенное);
- cta_qr — заметность и понятность точки входа: призыва к действию / QR;
- brand — сила брендированности: насколько понятно, чей это бренд и насколько он визуально выделен;
- contact_time_fit — насколько макет реалистично успевают «снять» за 2–3 секунды;
- legal_compliance — грубая оценка юридической корректности: нет ли откровенно рискованных заявлений, отсутствующих дисклеймеров и т.п.

Общий сценарий оценки: наружная реклама у дороги (контакт 2–3 секунды).

2) Сформулировать до 5 кратких рекомендаций по улучшению, ориентируясь на макет, метрики и уже существующие советы.

Текущие данные от скрипта:
${JSON.stringify(
  {
    fileName,
    subscores,
    metricsRaw,
    recommendations,
  },
  null,
  2,
)}

Важно:
- Ориентируйся и на картинку, и на числа, и на текущие рекомендации;
- Все значения метрик должны быть от 0 до 100;
- Не меняй другие метрики, кроме перечисленных выше;
- Дай не более 5 рекомендаций, понятных маркетологу, без лишней "воды".

Ответь строго в формате JSON:
{
  "subscoresOverride": {
    "visual_hierarchy": number,
    "cta_qr": number,
    "brand": number,
    "contact_time_fit": number,
    "legal_compliance": number
  },
  "recommendationsOverride": [
    {
      "id": "string (machine-friendly, например focus_message)",
      "message": "короткий совет по-русски",
      "expectedGain": number (0-100),
      "rationale": "краткое обоснование по-русски"
    }
  ]
}
Если по какой-то метрике не можешь дать осмысленную оценку, всё равно дай аккуратное числовое предположение (не null).
Если считаешь, что текущие рекомендации достаточно хороши, можешь вернуть пустой массив recommendationsOverride.
`.trim();

  const response = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: userInstruction },
          {
            type: "image_url",
            image_url: {
              url: `data:image/png;base64,${imgBase64}`,
            },
          },
        ],
      } as any,
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    // eslint-disable-next-line no-console
    console.warn("[LLM] Empty response content, skipping enrichment.");
    return null;
  }

  let parsed: LlmEnrichmentResult;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      "[LLM] Failed to parse JSON from LLM response, skipping enrichment.",
      err,
    );
    return null;
  }

  return parsed;
}

