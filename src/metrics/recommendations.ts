import { MetricsAndScores, Recommendation } from "./types";

export function generateRecommendations(
  data: MetricsAndScores,
): Recommendation[] {
  const recs: Recommendation[] = [];

  const contrastScore = data.subscores.contrast_color;
  const clutterScore = data.subscores.clutter;
  const readabilityScore = data.subscores.readability;
  const visualHierarchyScore = data.subscores.visual_hierarchy;
  const ctaQrScore = data.subscores.cta_qr;
  const brandScore = data.subscores.brand;
  const contactTimeFitScore = data.subscores.contact_time_fit;

  if (contrastScore < 70) {
    recs.push({
      id: "increase_contrast",
      message:
        "Увеличьте контраст текста и фона (целевой ≥ 4.5:1) для лучшей читаемости с первого взгляда.",
      expectedGain: 10,
      rationale:
        "Прокси контраста по вариации яркости ниже рекомендуемого порога.",
    });
  }

  if (clutterScore < 65) {
    recs.push({
      id: "reduce_clutter",
      message:
        "Упростите фон и композицию вокруг основного сообщения.",
      expectedGain: 8,
      rationale:
        "Плотность контуров указывает на визуально перегруженную композицию, которая конкурирует с ключевым текстом.",
    });
  }

  if (data.metricsRaw.orientation === "horizontal") {
    recs.push({
      id: "billboard_orientation_defaults",
      message:
        "Макет горизонтальный; использованы типовые допущения для щита (высота 5.5 м, ~40 км/ч).",
      expectedGain: 5,
      rationale:
        "Ориентация соответствует ландшафтному формату типичного придорожного щита.",
    });
  }

  recs.push({
    id: "assumptions_traffic",
    message:
      "Допущения: высота конструкции 5.5 м, средняя скорость потока 40 км/ч, основной угол обзора ~45° с 15 м.",
    expectedGain: 5,
    rationale:
      "Явные допущения помогают согласовать креативные решения с условиями размещения.",
  });

  if (readabilityScore < 70) {
    recs.push({
      id: "focus_message",
      message:
        "Выделите одно чёткое главное сообщение с минимумом второстепенного текста для проезжающей аудитории.",
      expectedGain: 12,
      rationale:
        "Прокси загруженности и контраста указывают на возможную перегрузку при коротком контакте.",
    });
  }

  if (visualHierarchyScore < 65) {
    recs.push({
      id: "improve_visual_hierarchy",
      message:
        "Усильте визуальную иерархию: один главный элемент должен доминировать, второстепенные — чётко подчинены.",
      expectedGain: 9,
      rationale:
        "Эвристика визуальной иерархии указывает на конкурирующие элементы, которые дробят внимание при коротком взгляде.",
    });
  }

  if (ctaQrScore < 60) {
    recs.push({
      id: "strengthen_cta_qr",
      message:
        "Сделайте призыв к действию или QR крупнее, контрастнее и менее перегруженным визуально.",
      expectedGain: 9,
      rationale:
        "Прокси заметности CTA/QR указывает, что точка входа может быть недостаточно выделена при быстром проезде.",
    });
  }

  if (brandScore < 60) {
    recs.push({
      id: "reinforce_branding",
      message:
        "Усильте блок бренда (размер логотипа, единое цветовое поле) без добавления лишней загруженности.",
      expectedGain: 7,
      rationale:
        "Прокси брендированности указывает, что визуальный акцент на бренде слабее рекомендуемого для OOH.",
    });
  }

  if (contactTimeFitScore < 60) {
    recs.push({
      id: "optimize_for_contact_time",
      message:
        "Сократите число конкурирующих сообщений и оставьте только то, что можно воспринять за 2–3 секунды при типичной скорости потока.",
      expectedGain: 10,
      rationale:
        "Прокси соответствия времени контакта указывает, что креатив может требовать больше внимания, чем даёт короткий контакт у дороги.",
    });
  }

  // cap at top 5 by expectedGain
  return recs
    .sort((a, b) => b.expectedGain - a.expectedGain)
    .slice(0, 5);
}

