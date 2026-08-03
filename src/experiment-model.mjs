export const PREDICTION_THEME_NAMES = [
  "运动",
  "科技",
  "历史",
  "艺术",
  "自然",
];

function clampRandom(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(0.999999, Math.max(0, value));
}

function shuffle(items, random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(clampRandom(random()) * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

/**
 * 每个主题只抽取一张预测卡，并把结果作为一轮实验的稳定状态返回。
 * previousIds 仅用于重置时避免整组卡片和顺序完全不变。
 */
export function pickPredictionCards(
  cards,
  { random = Math.random, previousIds = [] } = {},
) {
  const selected = PREDICTION_THEME_NAMES.map((theme) => {
    const pool = cards.filter((card) => card.topic === theme);
    if (pool.length === 0) {
      throw new Error(`预测内容池缺少“${theme}”主题`);
    }
    return pool[Math.floor(clampRandom(random()) * pool.length)];
  });

  let ordered = shuffle(selected, random);
  const previousSignature = previousIds.join("|");
  const nextSignature = ordered.map((card) => card.id).join("|");

  if (previousSignature && previousSignature === nextSignature) {
    const firstTheme = ordered[0].topic;
    const pool = cards.filter((card) => card.topic === firstTheme);
    const currentIndex = pool.findIndex((card) => card.id === ordered[0].id);
    ordered = [
      pool[(currentIndex + 1) % pool.length],
      ...ordered.slice(1),
    ];
  }

  return ordered;
}

export function shouldAutoOpenReflection({
  challengeComplete,
  observationCompleted,
  reflectionShown,
}) {
  return (
    challengeComplete === true &&
    observationCompleted === true &&
    reflectionShown === false
  );
}
