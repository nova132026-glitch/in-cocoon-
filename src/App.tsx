import {
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import contentCards from "./data/content_cards.json";
import { pickPredictionCards } from "./experiment-model.mjs";

type ThemeKey = "sport" | "tech" | "history" | "art" | "nature";
type ThemeName = "运动" | "科技" | "历史" | "艺术" | "自然";
type InterestMap = Record<ThemeKey, number>;
type TopicWeights = Record<ThemeName, number>;
type Behavior = "like" | "stay" | "next" | "reject";
type Phase =
  | "prediction"
  | "operation"
  | "observation"
  | "explanation"
  | "transfer"
  | "complete"
  | "free";

type RawCard = {
  id: string;
  topic: ThemeName;
  title: string;
  summary: string;
  tags: string[];
  topics: TopicWeights;
  baseScore: number;
  sourceStatus: string;
};

type ContentCard = RawCard & {
  theme: ThemeKey;
  emoji: string;
  gradient: string;
  video?: string;
};

type QueueItem = ContentCard & {
  index: number;
  score: number;
  isExplore: boolean;
  reason: string;
};

type Snapshot = {
  themeCount: number;
  sportShare: number;
  interestShares: InterestMap;
  queue: Array<{ id: string; title: string; theme: ThemeKey; topic: ThemeName }>;
  diversity: number;
  sportSlots: number;
};

type GuideTarget =
  | "prediction-choice"
  | "prediction-submit"
  | "action-like"
  | "action-stay"
  | "action-next"
  | "action-reject"
  | "compare-open"
  | "observation-one"
  | "observation-two"
  | "observation-finish"
  | "explanation-answer"
  | "explanation-submit"
  | "explore"
  | "manage"
  | "transfer-answer"
  | "enter-free";

type GuideStep = {
  id: string;
  target: GuideTarget;
  title: string;
  text: string;
};

type ImmediateChange = {
  behavior: string;
  profile: string;
  recommendation: string;
};

const themes: Array<{
  key: ThemeKey;
  name: ThemeName;
  icon: string;
  color: string;
  soft: string;
  gradients: string[];
}> = [
  {
    key: "sport",
    name: "运动",
    icon: "●",
    color: "#e89b2f",
    soft: "#ffebc9",
    gradients: [
      "linear-gradient(145deg, #e57a3d, #f5b448 55%, #fff0b7)",
      "linear-gradient(145deg, #f09c3d, #ffd070 48%, #77cfa9)",
    ],
  },
  {
    key: "tech",
    name: "科技",
    icon: "⌁",
    color: "#6975e8",
    soft: "#e4e6ff",
    gradients: [
      "linear-gradient(145deg, #273e8e, #7288ed 48%, #a7dbea)",
      "linear-gradient(145deg, #5362d8, #9b8bed 55%, #c5f0e0)",
    ],
  },
  {
    key: "history",
    name: "历史",
    icon: "▰",
    color: "#9a73bf",
    soft: "#eee0f7",
    gradients: [
      "linear-gradient(145deg, #75558f, #b98f93 54%, #e4c88e)",
      "linear-gradient(145deg, #654d83, #9c7eb4 48%, #dec99d)",
    ],
  },
  {
    key: "art",
    name: "艺术",
    icon: "✦",
    color: "#f36f5e",
    soft: "#ffe0da",
    gradients: [
      "linear-gradient(145deg, #ff8f70, #f6c777 52%, #7a85e6)",
      "linear-gradient(145deg, #3b4e86, #ab7fa0 52%, #f0c8aa)",
    ],
  },
  {
    key: "nature",
    name: "自然",
    icon: "◆",
    color: "#25a978",
    soft: "#d8f5e8",
    gradients: [
      "linear-gradient(145deg, #178c77, #55c69d 50%, #b6e8d1)",
      "linear-gradient(145deg, #247f62, #78c676 52%, #e7d775)",
    ],
  },
];

const themeKeyByName = Object.fromEntries(
  themes.map((theme) => [theme.name, theme.key]),
) as Record<ThemeName, ThemeKey>;

const themeByKey = Object.fromEntries(
  themes.map((theme) => [theme.key, theme]),
) as Record<ThemeKey, (typeof themes)[number]>;

const representativeVideos: Record<
  ThemeKey,
  { src: string; available: boolean }
> = {
  art: { src: "./videos/piano.mp4", available: true },
  tech: { src: "./videos/tech.mp4", available: false },
  sport: { src: "./videos/sport.mp4", available: false },
  nature: { src: "./videos/nature.mp4", available: false },
  history: { src: "./videos/history.mp4", available: false },
};

const representativeCardIds: Record<ThemeKey, string> = {
  art: "art-04",
  tech: "tech-01",
  sport: "sport-01",
  nature: "nature-01",
  history: "history-01",
};

const contents: ContentCard[] = (contentCards as RawCard[]).map((card) => {
  const theme = themeByKey[themeKeyByName[card.topic]];
  const sequence = Number(card.id.split("-")[1] ?? 1);
  return {
    ...card,
    theme: theme.key,
    emoji: theme.icon,
    gradient: theme.gradients[(sequence - 1) % theme.gradients.length],
    video:
      card.id === representativeCardIds[theme.key] &&
      representativeVideos[theme.key].available
        ? representativeVideos[theme.key].src
        : undefined,
  };
});

const initialPredictionCards = pickPredictionCards(contents, {
  random: () => 0,
});

const initialInterests: InterestMap = {
  sport: 1,
  tech: 1,
  history: 1,
  art: 1,
  nature: 1,
};

const initialEvidence: InterestMap = {
  sport: 0,
  tech: 0,
  history: 0,
  art: 0,
  nature: 0,
};

const initialIndex = Math.max(
  0,
  contents.findIndex((card) => card.id === "sport-01"),
);

const behaviorRules: Record<
  Behavior,
  { amount: number; label: string; evidence: number; tone: string }
> = {
  like: { amount: 3, label: "喜欢", evidence: 3, tone: "强正反馈" },
  stay: { amount: 1, label: "继续观看", evidence: 1, tone: "弱正反馈" },
  next: { amount: -1, label: "普通切换", evidence: -1, tone: "弱负反馈" },
  reject: { amount: -4, label: "快速划走", evidence: -4, tone: "强负反馈" },
};

const DOMINANT_GAP_THRESHOLD = 4;
const REDUCED_THEME_TARGET = 0.05;

const phaseCopy: Record<Phase, { number: number; name: string; task: string }> = {
  prediction: {
    number: 1,
    name: "预测",
    task: "→ 先猜一猜：多次喜欢运动内容后，推荐会怎样变化？",
  },
  operation: {
    number: 2,
    name: "操作",
    task: "→ 试试看：点击这条运动内容的“喜欢”。",
  },
  observation: {
    number: 3,
    name: "观察",
    task: "→ 展开前后对比，再勾选你发现的两处变化。",
  },
  explanation: {
    number: 4,
    name: "解释",
    task: "→ 选择正确的顺序，拼出行为与推荐的反馈循环。",
  },
  transfer: {
    number: 5,
    name: "迁移",
    task: "→ 先主动破茧，再完成一道生活情境题。",
  },
  complete: {
    number: 5,
    name: "完成",
    task: "回顾本轮发现，重置数据后进入自由探索。",
  },
  free: {
    number: 5,
    name: "自由探索",
    task: "全部操作已开放，可以自由试验不同选择。",
  },
};

const guideHoverCopy: Record<Exclude<Phase, "complete" | "free">, string> = {
  prediction: "先留下猜想，实验结束后再看看你猜得对不对。",
  operation: "你的点击会成为系统判断兴趣的一条线索。",
  observation: "看看运动内容是否变多，其他主题是否被排到后面。",
  explanation:
    "想一想：你的行为怎样改变推荐，推荐又怎样影响下一次选择？",
  transfer: "想想怎样主动看到更多不同的信息。",
};

function getInterestShares(interests: InterestMap): InterestMap {
  const total = Object.values(interests).reduce((sum, value) => sum + value, 0);
  return Object.fromEntries(
    themes.map((theme) => [
      theme.key,
      Math.round((interests[theme.key] / total) * 100),
    ]),
  ) as InterestMap;
}

function getExactInterestShare(interests: InterestMap, theme: ThemeKey) {
  const total = Object.values(interests).reduce((sum, value) => sum + value, 0);
  return total > 0 ? (interests[theme] / total) * 100 : 0;
}

function getInterestDominance(shares: InterestMap) {
  const ranked = [...themes].sort(
    (a, b) => shares[b.key] - shares[a.key],
  );
  const leadingTheme = ranked[0];
  const secondTheme = ranked[1];
  const gap = shares[leadingTheme.key] - shares[secondTheme.key];
  const hasClearDominant = gap >= DOMINANT_GAP_THRESHOLD;
  return {
    leadingTheme,
    secondTheme,
    gap,
    hasClearDominant,
    dominant: hasClearDominant ? leadingTheme : null,
  };
}

function applyReducedThemeTargets(
  source: InterestMap,
  reducedThemes: ThemeKey[],
) {
  const next = { ...source };
  if (reducedThemes.length === 0) return next;
  const activeThemes = themes.filter(
    (theme) => !reducedThemes.includes(theme.key),
  );
  const activeTotal = activeThemes.reduce(
    (sum, theme) => sum + next[theme.key],
    0,
  );
  const remainingShare = 1 - reducedThemes.length * REDUCED_THEME_TARGET;
  const targetScore =
    activeTotal > 0 && remainingShare > 0
      ? (activeTotal * REDUCED_THEME_TARGET) / remainingShare
      : 0.2;
  reducedThemes.forEach((theme) => {
    next[theme] = Math.max(0.2, targetScore);
  });
  return next;
}

function scoreCard(
  card: ContentCard,
  interests: InterestMap,
  reducedThemes: ThemeKey[] = [],
) {
  const matchScore = themes.reduce(
    (sum, theme) =>
      sum + interests[theme.key] * card.topics[theme.name],
    0,
  );
  const preferencePenalty = reducedThemes.reduce(
    (sum, key) => sum + card.topics[themeByKey[key].name] * 4,
    0,
  );
  return matchScore + card.baseScore - preferencePenalty;
}

function buildRecommendationQueue(
  interests: InterestMap,
  currentIndex: number,
  blockedThemes: ThemeKey[] = [],
  diversify = false,
): QueueItem[] {
  const eligible = contents
    .map((card, index) => ({
      ...card,
      index,
      score: scoreCard(card, interests, blockedThemes),
      isExplore: false,
      reason: "兴趣画像、主题权重和内容基础分共同计算",
    }))
    .filter((card) => card.index !== currentIndex)
    .sort((a, b) => b.score - a.score || b.baseScore - a.baseScore);

  const interestValues = Object.values(interests);
  const interestSpread =
    Math.max(...interestValues) - Math.min(...interestValues);
  if (!diversify && interestSpread < 0.05) {
    const balanced: QueueItem[] = [];
    for (const theme of themes) {
      const candidate = eligible.find(
        (card) =>
          card.theme === theme.key &&
          !balanced.some((item) => item.id === card.id),
      );
      if (candidate) balanced.push(candidate);
    }
    const extra = eligible.find(
      (card) => !balanced.some((item) => item.id === card.id),
    );
    if (extra)
      balanced.push({
        ...extra,
        isExplore: true,
        reason: "系统主动保留的探索内容",
      });
    return balanced.slice(0, 6);
  }

  if (diversify) {
    const picked: QueueItem[] = [];
    const activeThemes = themes
      .filter((theme) => !blockedThemes.includes(theme.key))
      .sort((a, b) => interests[a.key] - interests[b.key]);
    const reducedThemes = themes
      .filter((theme) => blockedThemes.includes(theme.key))
      .sort((a, b) => interests[a.key] - interests[b.key]);
    const activeExploreSlots = Math.max(0, 4 - reducedThemes.length);
    const orderedThemes = [
      ...activeThemes.slice(0, activeExploreSlots),
      ...reducedThemes,
    ].slice(0, 4);

    for (const theme of orderedThemes.slice(0, 4)) {
      const candidate = eligible.find(
        (card) =>
          card.theme === theme.key &&
          !picked.some((item) => item.id === card.id),
      );
      if (candidate)
        picked.push({
          ...candidate,
          isExplore: true,
          reason: blockedThemes.includes(theme.key)
            ? "减少推荐后，系统仍保留的少量探索内容"
            : "主动破茧后，较少出现的主题重新进入推荐",
        });
    }

    for (const candidate of eligible) {
      if (picked.length >= 6) break;
      if (!picked.some((item) => item.id === candidate.id)) {
        picked.push(candidate);
      }
    }
    return picked.slice(0, 6);
  }

  const personalized = eligible.slice(0, 4);
  const dominantTheme = themes.reduce((best, theme) =>
    interests[theme.key] > interests[best.key] ? theme : best,
  );
  const exploreThemes = themes
    .filter((theme) => theme.key !== dominantTheme.key)
    .sort((a, b) => {
      const reducedDifference =
        Number(blockedThemes.includes(a.key)) -
        Number(blockedThemes.includes(b.key));
      return reducedDifference || interests[a.key] - interests[b.key];
    });

  const exploreCards: QueueItem[] = [];
  for (const theme of exploreThemes) {
    if (exploreCards.length >= 2) break;
    const candidate = eligible.find(
      (card) =>
        card.theme === theme.key &&
        !personalized.some((item) => item.id === card.id) &&
        !exploreCards.some((item) => item.id === card.id),
    );
    if (candidate)
      exploreCards.push({
        ...candidate,
        isExplore: true,
        reason: blockedThemes.includes(theme.key)
          ? "减少推荐后保留的少量探索内容"
          : "系统主动保留的探索内容",
      });
  }

  return [...personalized, ...exploreCards].slice(0, 6);
}

function getDiversity(queue: QueueItem[]) {
  if (queue.length === 0) return 0;
  const counts = themes.map(
    (theme) => queue.filter((card) => card.theme === theme.key).length,
  );
  const visibleThemes = counts.filter(Boolean).length;
  const largestGroup = Math.max(...counts);
  const maxVisible = Math.min(themes.length, queue.length);
  const richness =
    maxVisible <= 1 ? 1 : (visibleThemes - 1) / (maxVisible - 1);
  const idealLargest = Math.ceil(queue.length / themes.length);
  const balanceRange = Math.max(1, queue.length - idealLargest);
  const balance =
    1 - Math.min(1, Math.max(0, largestGroup - idealLargest) / balanceRange);
  return Math.max(0, Math.min(100, Math.round(richness * 70 + balance * 30)));
}

function createSnapshot(
  interests: InterestMap,
  queue: QueueItem[],
): Snapshot {
  const shares = getInterestShares(interests);
  return {
    themeCount: new Set(queue.map((card) => card.theme)).size,
    sportShare: shares.sport,
    interestShares: shares,
    queue: queue.map((card) => ({
      id: card.id,
      title: card.title,
      theme: card.theme,
      topic: card.topic,
    })),
    diversity: getDiversity(queue),
    sportSlots: queue.filter((card) => card.theme === "sport").length,
  };
}

function getTagWeights(card: ContentCard) {
  return themes
    .map((theme) => ({
      key: theme.key,
      tag: theme.name,
      weight: card.topics[theme.name],
    }))
    .filter((item) => item.weight > 0)
    .sort((a, b) => b.weight - a.weight);
}

function ModalShell({
  label,
  className,
  onClose,
  showCloseButton = true,
  closeOnEscape = true,
  children,
}: {
  label: string;
  className: string;
  onClose: () => void;
  showCloseButton?: boolean;
  closeOnEscape?: boolean;
  children: ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    previousFocus.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (closeOnEscape && event.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      previousFocus.current?.focus();
    };
  }, [closeOnEscape]);

  return (
    <div
      className="guide-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <div className={className}>
        {showCloseButton && (
          <button
            ref={closeRef}
            className="guide-close"
            onClick={onClose}
            aria-label={`关闭${label}`}
          >
            ×
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

function LearningGuide({
  step,
  onSkip,
}: {
  step: GuideStep | null;
  onSkip: (id: string) => void;
}) {
  const [position, setPosition] = useState<{
    left: number;
    top: number;
    width: number;
    side: "left" | "right" | "top" | "bottom";
  } | null>(null);

  useEffect(() => {
    if (!step) {
      setPosition(null);
      return;
    }

    let frame = 0;
    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const dialog = document.querySelector<HTMLElement>(
          "[role='dialog'][aria-modal='true']",
        );
        const selector = `[data-guide-target="${step.target}"]`;
        const target = dialog
          ? dialog.querySelector<HTMLElement>(selector)
          : document.querySelector<HTMLElement>(selector);
        if (!target) {
          setPosition(null);
          return;
        }
        const rect = target.getBoundingClientRect();
        const defaultBubbleWidth = Math.min(290, window.innerWidth - 24);
        const gap = 16;
        const viewportPadding = 12;
        const clamp = (value: number, minimum: number, maximum: number) =>
          Math.max(minimum, Math.min(maximum, value));
        const sidePreferredGuide =
          step.id === "comparison-open" ||
          step.id.startsWith("observation-") ||
          step.id.startsWith("explanation-");
        const preferHorizontal =
          sidePreferredGuide && window.innerWidth > 760;
        const dialogPanel =
          dialog?.firstElementChild instanceof HTMLElement
            ? dialog.firstElementChild
            : dialog;
        const dialogRect = dialogPanel?.getBoundingClientRect();
        const horizontalAnchor = dialogRect ?? rect;
        const leftSpace = horizontalAnchor.left - viewportPadding;
        const rightSpace =
          window.innerWidth - horizontalAnchor.right - viewportPadding;
        const topSpace = rect.top - viewportPadding;
        const bottomSpace = window.innerHeight - rect.bottom - viewportPadding;
        const leftBubbleWidth = Math.min(
          defaultBubbleWidth,
          Math.max(0, leftSpace - gap),
        );
        const rightBubbleWidth = Math.min(
          defaultBubbleWidth,
          Math.max(0, rightSpace - gap),
        );
        const minimumSideWidth = 160;
        const horizontalBubbleWidth = Math.max(
          minimumSideWidth,
          Math.max(leftBubbleWidth, rightBubbleWidth),
        );
        const bubbleHeight =
          horizontalBubbleWidth < 220 ? 138 : 108;

        let side: "left" | "right" | "top" | "bottom";
        if (preferHorizontal && leftBubbleWidth >= minimumSideWidth) {
          side = "left";
        } else if (preferHorizontal && rightBubbleWidth >= minimumSideWidth) {
          side = "right";
        } else if (topSpace >= bubbleHeight + gap) {
          side = "top";
        } else if (bottomSpace >= bubbleHeight + gap) {
          side = "bottom";
        } else if (preferHorizontal && leftSpace >= rightSpace) {
          side = "left";
        } else if (preferHorizontal) {
          side = "right";
        } else {
          side = topSpace >= bottomSpace ? "top" : "bottom";
        }

        if (side === "left" || side === "right") {
          const anchor = dialogRect ?? rect;
          const bubbleWidth = Math.max(
            140,
            side === "left" ? leftBubbleWidth : rightBubbleWidth,
          );
          setPosition({
            left:
              side === "left"
                ? clamp(
                    anchor.left - bubbleWidth - gap,
                    viewportPadding,
                    window.innerWidth - bubbleWidth - viewportPadding,
                  )
                : clamp(
                    anchor.right + gap,
                    viewportPadding,
                    window.innerWidth - bubbleWidth - viewportPadding,
                  ),
            top: clamp(
              rect.top + rect.height / 2 - bubbleHeight / 2,
              viewportPadding,
              window.innerHeight - bubbleHeight - viewportPadding,
            ),
            width: bubbleWidth,
            side,
          });
          return;
        }

        setPosition({
          left: clamp(
            rect.left + rect.width / 2 - defaultBubbleWidth / 2,
            viewportPadding,
            window.innerWidth - defaultBubbleWidth - viewportPadding,
          ),
          top:
            side === "bottom"
              ? clamp(
                  rect.bottom + gap,
                  viewportPadding,
                  window.innerHeight - bubbleHeight - viewportPadding,
                )
              : clamp(
                  rect.top - bubbleHeight - gap,
                  viewportPadding,
                  window.innerHeight - bubbleHeight - viewportPadding,
                ),
          width: defaultBubbleWidth,
          side,
        });
      });
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [step]);

  useEffect(() => {
    document
      .querySelectorAll("[data-guide-active='true']")
      .forEach((node) => node.removeAttribute("data-guide-active"));
    if (!step) return;
    const dialog = document.querySelector<HTMLElement>(
      "[role='dialog'][aria-modal='true']",
    );
    const selector = `[data-guide-target="${step.target}"]`;
    const target = dialog
      ? dialog.querySelector(selector)
      : document.querySelector(selector);
    target?.setAttribute("data-guide-active", "true");
    return () => {
      target?.removeAttribute("data-guide-active");
    };
  }, [step]);

  if (!step || !position) return null;
  return (
    <aside
      className={`learning-coach side-${position.side}`}
      style={{ left: position.left, top: position.top, width: position.width } as CSSProperties}
      role="status"
      aria-live="polite"
      aria-label={`${step.title}：${step.text}`}
    >
      <button onClick={() => onSkip(step.id)} aria-label="跳过当前指引">×</button>
      <span className="coach-kicker">现在做这一步</span>
      <strong>{step.title}</strong>
      <p>{step.text}</p>
      <i className="coach-curve" aria-hidden="true" />
    </aside>
  );
}

export default function Home() {
  const [phase, setPhase] = useState<Phase>("prediction");
  const [prediction, setPrediction] = useState("");
  const [predictionReason, setPredictionReason] = useState("");
  const [predictionCards, setPredictionCards] = useState<ContentCard[]>(
    initialPredictionCards,
  );
  const [predictionModalOpen, setPredictionModalOpen] = useState(true);
  const [predictionCloseMessage, setPredictionCloseMessage] = useState("");
  const [teachingCompleted, setTeachingCompleted] = useState(false);
  const [showOperationTransition, setShowOperationTransition] =
    useState(false);
  const [interests, setInterests] =
    useState<InterestMap>(initialInterests);
  const [evidence, setEvidence] = useState<InterestMap>(initialEvidence);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [seenIds, setSeenIds] = useState<string[]>([
    contents[initialIndex].id,
  ]);
  const [sportLikedIds, setSportLikedIds] = useState<string[]>([]);
  const [actionCount, setActionCount] = useState(0);
  const [blockedThemes, setBlockedThemes] = useState<ThemeKey[]>([]);
  const [hasIntervened, setHasIntervened] = useState(false);
  const [isBreaking, setIsBreaking] = useState(false);
  const [observationResultShown, setObservationResultShown] =
    useState(false);
  const [observationChecks, setObservationChecks] = useState({
    sportMore: false,
    othersRemain: false,
  });
  const [observationCompleted, setObservationCompleted] = useState(false);
  const [challengeComplete, setChallengeComplete] = useState(false);
  const [reflectionShown, setReflectionShown] = useState(false);
  const [reflectionCompleted, setReflectionCompleted] = useState(false);
  const [explanationSelected, setExplanationSelected] = useState("");
  const [explanationFeedback, setExplanationFeedback] = useState("");
  const [explanationAttempts, setExplanationAttempts] = useState(0);
  const [lifeAnswer, setLifeAnswer] = useState("");
  const [showGuide, setShowGuide] = useState(false);
  const [showCocoonNotice, setShowCocoonNotice] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [comparisonCloseMessage, setComparisonCloseMessage] = useState("");
  const [showManage, setShowManage] = useState(false);
  const [preferenceDraft, setPreferenceDraft] = useState<ThemeKey[]>([]);
  const [preferenceSavedInTeaching, setPreferenceSavedInTeaching] =
    useState(false);
  const [breakResultMessage, setBreakResultMessage] = useState("");
  const [preferenceSaving, setPreferenceSaving] = useState(false);
  const [recommendationAnimating, setRecommendationAnimating] = useState(false);
  const [transientActionFeedback, setTransientActionFeedback] =
    useState<Behavior | null>(null);
  const [contentAnalysisOpen, setContentAnalysisOpen] = useState(false);
  const [showReflection, setShowReflection] = useState(false);
  const [experiencedBehaviors, setExperiencedBehaviors] = useState<Behavior[]>([]);
  const [hasExplored, setHasExplored] = useState(false);
  const [hasOpenedManage, setHasOpenedManage] = useState(false);
  const [skippedGuideIds, setSkippedGuideIds] = useState<string[]>([]);
  const [completedGuideIds, setCompletedGuideIds] = useState<string[]>([]);
  const [freeThemeLikeCounts, setFreeThemeLikeCounts] =
    useState<InterestMap>(initialEvidence);
  const [freeCocoonTheme, setFreeCocoonTheme] =
    useState<ThemeKey | null>(null);
  const [preferenceConflictTheme, setPreferenceConflictTheme] =
    useState<ThemeKey | null>(null);
  const [preferenceConflictProcessing, setPreferenceConflictProcessing] =
    useState(false);
  const [openReasonId, setOpenReasonId] = useState<string | null>(null);
  const [dropTheme, setDropTheme] = useState<ThemeKey | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [immediateChange, setImmediateChange] =
    useState<ImmediateChange>({
      behavior: "还没有操作",
      profile: "五类兴趣暂时相同",
      recommendation: "先保存预测，再留下行为信号",
    });
  const [lastSignal, setLastSignal] = useState<{
    kind: Behavior | "explore" | "manage";
    theme?: ThemeKey;
    label: string;
  } | null>(null);
  const [afterOperationSnapshot, setAfterOperationSnapshot] =
    useState<Snapshot | null>(null);
  const [beforeOperationSnapshot, setBeforeOperationSnapshot] =
    useState<Snapshot | null>(null);
  const [transferInitialInterests, setTransferInitialInterests] =
    useState<InterestMap | null>(null);

  const pointerStart = useRef({ x: 0, time: 0 });
  const actionFeedbackTimer = useRef<number | null>(null);
  const recommendationTimer = useRef<number | null>(null);
  const current = contents[currentIndex];
  const sportLikeCount = sportLikedIds.length;
  const currentShares = getInterestShares(interests);

  useEffect(
    () => () => {
      if (actionFeedbackTimer.current !== null) {
        window.clearTimeout(actionFeedbackTimer.current);
      }
      if (recommendationTimer.current !== null) {
        window.clearTimeout(recommendationTimer.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (phase === "free") {
      setContentAnalysisOpen(true);
    }
  }, [phase]);

  useEffect(() => {
    if (
      phase !== "free" ||
      !freeCocoonTheme ||
      isBreaking ||
      recommendationAnimating
    ) {
      return;
    }
    const shares = getInterestShares(interests);
    const dominance = getInterestDominance(shares);
    const cocoonStillMatchesReality =
      freeThemeLikeCounts[freeCocoonTheme] >= 3 &&
      dominance.hasClearDominant &&
      dominance.leadingTheme.key === freeCocoonTheme;
    if (!cocoonStillMatchesReality) {
      setFreeCocoonTheme(null);
    }
  }, [
    freeCocoonTheme,
    freeThemeLikeCounts,
    interests,
    isBreaking,
    phase,
    recommendationAnimating,
  ]);

  const baselineSnapshot = useMemo(() => {
    const queue = buildRecommendationQueue(
      initialInterests,
      initialIndex,
    );
    return createSnapshot(initialInterests, queue);
  }, []);

  const recommendationQueue = useMemo(
    () =>
      buildRecommendationQueue(
        interests,
        currentIndex,
        blockedThemes,
        hasIntervened,
      ),
    [blockedThemes, currentIndex, hasIntervened, interests],
  );

  const visibleThemeCount = new Set(
    recommendationQueue.map((item) => item.theme),
  ).size;
  const diversity = getDiversity(recommendationQueue);
  const currentTagWeights = getTagWeights(current);
  const canOperate =
    (phase === "operation" || phase === "free") &&
    preferenceConflictTheme === null &&
    !preferenceConflictProcessing;
  const canIntervene =
    (phase === "transfer" || phase === "free") &&
    !preferenceSaving &&
    !recommendationAnimating;
  const preferenceHasChanges =
    preferenceDraft.length !== blockedThemes.length ||
    preferenceDraft.some((theme) => !blockedThemes.includes(theme));
  const guideIsInDialog =
    showGuide ||
    (predictionModalOpen && !showGuide) ||
    showComparison ||
    showCocoonNotice ||
    showManage ||
    preferenceConflictTheme !== null ||
    (showReflection &&
      (phase === "explanation" || phase === "transfer" || phase === "complete"));

  function completeGuide(id: string | undefined) {
    if (!id) return;
    setCompletedGuideIds((previous) =>
      previous.includes(id) ? previous : [...previous, id],
    );
  }

  function skipGuide(id: string) {
    setSkippedGuideIds((previous) =>
      previous.includes(id) ? previous : [...previous, id],
    );
  }

  function chooseNextSport(excludeIds: string[]) {
    const next = contents.findIndex(
      (card) =>
        card.theme === "sport" &&
        card.id !== current.id &&
        !excludeIds.includes(card.id),
    );
    if (next >= 0) return next;
    return contents.findIndex(
      (card) => card.theme === "sport" && card.id !== current.id,
    );
  }

  function applySignal(kind: Behavior) {
    if (!canOperate || isLeaving || transientActionFeedback !== null) return;
    setShowOperationTransition(false);
    const rule = behaviorRules[kind];
    const previousQueue = buildRecommendationQueue(
      interests,
      currentIndex,
      blockedThemes,
      false,
    );
    const previousSnapshot = createSnapshot(interests, previousQueue);

    const nextInterests = { ...interests };
    const nextEvidence = { ...evidence };
    themes.forEach((theme) => {
      const topicWeight = current.topics[theme.name];
      nextInterests[theme.key] = Math.max(
        0.2,
        nextInterests[theme.key] + rule.amount * topicWeight,
      );
      nextEvidence[theme.key] = Math.max(
        0,
        nextEvidence[theme.key] + rule.evidence * topicWeight,
      );
    });

    const isNewSportLike =
      phase === "operation" &&
      kind === "like" &&
      current.theme === "sport" &&
      !sportLikedIds.includes(current.id);
    const nextLikedIds = isNewSportLike
      ? [...sportLikedIds, current.id]
      : sportLikedIds;
    const guidedNextIndex =
      nextLikedIds.length < 3
        ? chooseNextSport([...seenIds, ...nextLikedIds])
        : currentIndex;
    const freeQueue = buildRecommendationQueue(
      nextInterests,
      currentIndex,
      blockedThemes,
      hasIntervened,
    );
    const nextIndex =
      phase === "free"
        ? (freeQueue.find((item) => !seenIds.includes(item.id)) ?? freeQueue[0])
            ?.index ?? currentIndex
        : guidedNextIndex;
    const nextQueue = buildRecommendationQueue(
      nextInterests,
      nextIndex,
      blockedThemes,
      false,
    );
    const nextSnapshot = createSnapshot(nextInterests, nextQueue);
    const nextShares = getInterestShares(nextInterests);

    setInterests(nextInterests);
    setEvidence(nextEvidence);
    setSportLikedIds(nextLikedIds);
    setActionCount((count) => count + 1);
    setExperiencedBehaviors((previous) =>
      previous.includes(kind) ? previous : [...previous, kind],
    );
    if (
      activeGuide &&
      ((kind === "like" && activeGuide.target === "action-like") ||
        (kind === "stay" && activeGuide.target === "action-stay") ||
        (kind === "next" && activeGuide.target === "action-next") ||
        (kind === "reject" && activeGuide.target === "action-reject"))
    ) {
      if (activeGuide.id !== "operation-data-required" || nextLikedIds.length >= 3) {
        completeGuide(activeGuide.id);
      }
    }

    if (phase === "free") {
      const nextLikeCounts =
        kind === "like"
          ? {
              ...freeThemeLikeCounts,
              [current.theme]: freeThemeLikeCounts[current.theme] + 1,
            }
          : freeThemeLikeCounts;
      if (kind === "like") {
        setFreeThemeLikeCounts(nextLikeCounts);
      }

      const nextDominance = getInterestDominance(nextShares);
      const currentThemeCanFormCocoon =
        nextLikeCounts[current.theme] >= 3 &&
        nextDominance.hasClearDominant &&
        nextDominance.leadingTheme.key === current.theme;
      const previousCocoonStillValid =
        freeCocoonTheme !== null &&
        nextLikeCounts[freeCocoonTheme] >= 3 &&
        nextDominance.hasClearDominant &&
        nextDominance.leadingTheme.key === freeCocoonTheme;

      if (kind === "like" && currentThemeCanFormCocoon) {
        setFreeCocoonTheme(current.theme);
        setChallengeComplete(false);
        setIsBreaking(false);
      } else if (!previousCocoonStillValid) {
        setFreeCocoonTheme(null);
      }

      const positiveSignal = kind === "like" || kind === "stay";
      if (
        positiveSignal &&
        blockedThemes.includes(current.theme) &&
        getExactInterestShare(interests, current.theme) <= 50 &&
        getExactInterestShare(nextInterests, current.theme) > 50 &&
        preferenceConflictTheme === null
      ) {
        setPreferenceConflictTheme(current.theme);
        setPreferenceConflictProcessing(false);
      }
    }
    setOpenReasonId(null);
    setLastSignal({
      kind,
      theme: current.theme,
      label: rule.label,
    });
    setImmediateChange({
      behavior: `${rule.label}｜行为权重 ${rule.amount > 0 ? "+" : ""}${rule.amount}`,
      profile: `${current.topic}分数 ${interests[current.theme].toFixed(1)} → ${nextInterests[current.theme].toFixed(1)}（分数越高，系统猜测越感兴趣）`,
      recommendation: `主题权重参与计算后，6个推荐位中的${current.topic}从${previousSnapshot.queue.filter((card) => card.theme === current.theme).length}个变成${nextQueue.filter((card) => card.theme === current.theme).length}个`,
    });
    if (kind === "like") {
      if (actionFeedbackTimer.current !== null) {
        window.clearTimeout(actionFeedbackTimer.current);
      }
      setTransientActionFeedback("like");
      setDropTheme(current.theme);
      window.setTimeout(() => setDropTheme(null), 850);
    }

    if (phase === "operation" && isNewSportLike && nextLikedIds.length === 3) {
      setTransientActionFeedback(null);
      setAfterOperationSnapshot(nextSnapshot);
      setPhase("observation");
      setShowCocoonNotice(true);
      setIsBreaking(false);
      return;
    }

    if (nextIndex >= 0) {
      const showNextContent = () => {
        setTransientActionFeedback(null);
        setCurrentIndex(nextIndex);
        setSeenIds((previous) =>
          [...previous, contents[nextIndex].id].slice(-20),
        );
      };
      if (kind === "like") {
        actionFeedbackTimer.current = window.setTimeout(showNextContent, 360);
      } else {
        showNextContent();
      }
    }
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!canOperate || isLeaving || transientActionFeedback !== null) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerStart.current = { x: event.clientX, time: event.timeStamp };
    setIsDragging(true);
    setDragX(0);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!isDragging || isLeaving) return;
    const distance = event.clientX - pointerStart.current.x;
    setDragX(Math.max(-280, Math.min(110, distance)));
  }

  function animateAway(kind: "next" | "reject") {
    if (!canOperate || isLeaving || transientActionFeedback !== null) return;
    setIsDragging(false);
    setIsLeaving(true);
    setDragX(-620);
    window.setTimeout(() => {
      setIsLeaving(false);
      setDragX(0);
      applySignal(kind);
    }, 330);
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!isDragging || isLeaving) return;
    const elapsed = event.timeStamp - pointerStart.current.time;
    const distance = pointerStart.current.x - event.clientX;
    setIsDragging(false);
    if (distance >= 46) {
      const kind = elapsed <= 1000 ? "reject" : "next";
      animateAway(kind);
    } else {
      setDragX(0);
    }
  }

  function explore() {
    if (!canIntervene) return;
    const nextInterests = { ...interests };
    const currentDominance = getInterestDominance(currentShares);
    const focusTheme =
      phase === "free" &&
      freeCocoonTheme &&
      currentDominance.hasClearDominant &&
      currentDominance.leadingTheme.key === freeCocoonTheme
        ? freeCocoonTheme
        : currentDominance.leadingTheme.key;
    nextInterests[focusTheme] =
      phase === "free"
        ? Math.max(
            1,
            Object.values(interests).reduce((sum, value) => sum + value, 0) /
              themes.length,
          )
        : Math.max(1, nextInterests[focusTheme] - 3);
    themes
      .filter((theme) => theme.key !== focusTheme)
      .sort((a, b) => interests[a.key] - interests[b.key])
      .slice(0, 3)
      .forEach((theme) => {
        nextInterests[theme.key] += 2;
      });
    setInterests(nextInterests);
    setHasIntervened(true);
    setHasExplored(true);
    completeGuide(activeGuide?.target === "explore" ? activeGuide.id : undefined);
    setOpenReasonId(null);
    setIsBreaking(true);
    setLastSignal({ kind: "explore", label: "探索新主题" });
    const challenge = completeChallengeIfReady(
      nextInterests,
      blockedThemes,
      true,
      preferenceSavedInTeaching,
    );
    const nextDominance = getInterestDominance(
      getInterestShares(nextInterests),
    );
    const releaseFreeCocoon =
      phase === "free" &&
      freeCocoonTheme !== null &&
      (!nextDominance.hasClearDominant ||
        nextDominance.leadingTheme.key !== freeCocoonTheme);
    beginRecommendationAnimation(challenge, { releaseFreeCocoon });
    setImmediateChange({
      behavior: "刚刚的行为：探索陌生主题",
      profile: "低权重主题获得一次探索机会",
      recommendation: "推荐流开始重新加入不同主题",
    });
  }

  function togglePreferenceDraft(theme: ThemeKey) {
    if (!canIntervene) return;
    setPreferenceDraft((previous) => {
      if (previous.includes(theme)) {
        return previous.filter((item) => item !== theme);
      }
      if (previous.length >= 4) return previous;
      return [...previous, theme];
    });
  }

  function savePreferences() {
    if (!canIntervene || !preferenceHasChanges) return;
    const nextBlocked = [...preferenceDraft];
    let nextInterests = { ...interests };
    const changedThemes = themes.filter(
      (theme) =>
        nextBlocked.includes(theme.key) !== blockedThemes.includes(theme.key),
    );
    const restoredThemes = changedThemes.filter(
      (theme) => !nextBlocked.includes(theme.key),
    );
    const currentAverage =
      Object.values(interests).reduce((sum, value) => sum + value, 0) /
      themes.length;
    restoredThemes.forEach((theme) => {
      nextInterests[theme.key] = Math.max(
        1,
        currentAverage,
        nextInterests[theme.key],
      );
    });
    nextInterests = applyReducedThemeTargets(nextInterests, nextBlocked);

    setPreferenceSaving(true);
    setShowManage(false);
    setBlockedThemes(nextBlocked);
    setInterests(nextInterests);
    setHasIntervened(true);
    if (phase === "transfer") setPreferenceSavedInTeaching(true);
    completeGuide(activeGuide?.target === "manage" ? activeGuide.id : undefined);
    setBreakResultMessage("");
    setIsBreaking(true);
    setOpenReasonId(null);
    setLastSignal({ kind: "manage", label: "保存推荐偏好" });
    const challenge = completeChallengeIfReady(
      nextInterests,
      nextBlocked,
      hasExplored,
      true,
    );
    const nextDominance = getInterestDominance(
      getInterestShares(nextInterests),
    );
    const releaseFreeCocoon =
      phase === "free" &&
      freeCocoonTheme !== null &&
      (!nextDominance.hasClearDominant ||
        nextDominance.leadingTheme.key !== freeCocoonTheme);
    beginRecommendationAnimation(challenge, { releaseFreeCocoon });
    setImmediateChange({
      behavior: `保存偏好：调整了${changedThemes.length}个主题`,
      profile: "只有点击保存后，草稿才正式改变画像",
      recommendation: "正在按新偏好重新计算6个推荐位",
    });
  }

  function openManage() {
    if (!canIntervene) return;
    setHasOpenedManage(true);
    setPreferenceDraft([...blockedThemes]);
    setShowManage(true);
  }

  function closeManage() {
    if (preferenceSaving) return;
    setPreferenceDraft([...blockedThemes]);
    setShowManage(false);
  }

  function restoreConflictingPreference() {
    if (!preferenceConflictTheme || preferenceConflictProcessing) return;
    const theme = themeByKey[preferenceConflictTheme];
    const nextBlocked = blockedThemes.filter(
      (item) => item !== preferenceConflictTheme,
    );
    setPreferenceConflictProcessing(true);
    setBlockedThemes(nextBlocked);
    setPreferenceDraft(nextBlocked);
    setHasIntervened(true);
    setBreakResultMessage(
      `已恢复${theme.name}的正常推荐，并保留刚刚积累的真实兴趣。`,
    );
    setImmediateChange({
      behavior: `恢复${theme.name}正常推荐`,
      profile: `${theme.name}兴趣分数保持不变`,
      recommendation: "推荐列表已按最新画像重新计算",
    });
    setPreferenceConflictTheme(null);
    setPreferenceConflictProcessing(false);
  }

  function keepReducedPreference() {
    if (!preferenceConflictTheme || preferenceConflictProcessing) return;
    const theme = themeByKey[preferenceConflictTheme];
    const adjustedInterests = applyReducedThemeTargets(
      interests,
      blockedThemes,
    );
    setPreferenceConflictProcessing(true);
    setInterests(adjustedInterests);
    setPreferenceDraft([...blockedThemes]);
    setFreeCocoonTheme(null);
    setChallengeComplete(false);
    setIsBreaking(false);
    setHasIntervened(true);
    setBreakResultMessage(`已按照你的设置继续减少${theme.name}主题。`);
    setImmediateChange({
      behavior: `继续减少${theme.name}推荐`,
      profile: `${theme.name}兴趣占比重新调整到约5%`,
      recommendation: "仍保留少量探索内容，不会彻底消失",
    });
    setPreferenceConflictTheme(null);
    setPreferenceConflictProcessing(false);
  }

  function submitPrediction() {
    if (!prediction) return;
    completeGuide("prediction-submit");
    const firstQueue = buildRecommendationQueue(initialInterests, initialIndex);
    setBeforeOperationSnapshot(createSnapshot(initialInterests, firstQueue));
    setCurrentIndex(initialIndex);
    setSeenIds([contents[initialIndex].id]);
    setShowOperationTransition(true);
    setPhase("operation");
    setPredictionModalOpen(false);
    setPredictionCloseMessage("");
    setImmediateChange({
      behavior: "预测已保存，暂不公布答案",
      profile: "五类兴趣仍保持中性",
      recommendation: "请用3次运动点赞验证你的猜想",
    });
  }

  function keepPredictionOpen() {
    setPredictionCloseMessage("请先保存预测，完成这一步后才能开始行为实验。");
  }

  function openComparison() {
    completeGuide("comparison-open");
    setShowCocoonNotice(false);
    setObservationResultShown(true);
    setComparisonCloseMessage("");
    setShowComparison(true);
  }

  function toggleObservation(key: "sportMore" | "othersRemain") {
    if (!observationResultShown) return;
    completeGuide(key === "sportMore" ? "observation-one" : "observation-two");
    const nextChecks = {
      ...observationChecks,
      [key]: !observationChecks[key],
    };
    setObservationChecks(nextChecks);
    if (
      nextChecks.sportMore &&
      nextChecks.othersRemain &&
      !observationCompleted
    ) {
      setObservationCompleted(true);
      setImmediateChange({
        behavior: "完成前后对比",
        profile: "你找到了兴趣画像的变化",
        recommendation: "下一步要解释推荐为什么会越变越像",
      });
    }
  }

  function finishObservation() {
    if (!observationCompleted) {
      setComparisonCloseMessage("先完成下面两项观察，才能进入下一步。 ");
      return;
    }
    setShowComparison(false);
    setPhase("explanation");
    setShowReflection(true);
    completeGuide("observation-finish");
  }

  function completeChallengeIfReady(
    nextInterests: InterestMap,
    nextBlockedThemes: ThemeKey[],
    nextHasExplored: boolean,
    nextPreferenceSaved: boolean,
  ) {
    const nextQueue = buildRecommendationQueue(
      nextInterests,
      currentIndex,
      nextBlockedThemes,
      true,
    );
    const nextThemeCount = new Set(nextQueue.map((card) => card.theme)).size;
    return {
      ready:
        nextThemeCount >= 4 &&
        nextHasExplored &&
        nextPreferenceSaved,
      managementComplete: nextHasExplored && nextPreferenceSaved,
      diverse: nextThemeCount >= 4,
      themeCount: nextThemeCount,
    };
  }

  function beginRecommendationAnimation(
    challenge: {
      ready: boolean;
      managementComplete: boolean;
      diverse: boolean;
      themeCount: number;
    },
    options: { releaseFreeCocoon?: boolean } = {},
  ) {
    if (recommendationTimer.current !== null) {
      window.clearTimeout(recommendationTimer.current);
    }
    setRecommendationAnimating(true);
    setIsBreaking(true);
    recommendationTimer.current = window.setTimeout(() => {
      setRecommendationAnimating(false);
      setPreferenceSaving(false);
      if (phase === "transfer" && challenge.ready) {
        setChallengeComplete(true);
        setIsBreaking(false);
        setReflectionShown(true);
        setShowReflection(true);
        setBreakResultMessage("");
        setImmediateChange({
          behavior: "主动破茧完成",
          profile: "不同主题重新获得出现机会",
          recommendation: `推荐流恢复到${challenge.themeCount}类主题`,
        });
      } else if (phase === "transfer" && challenge.managementComplete) {
        setChallengeComplete(false);
        setIsBreaking(false);
        setBreakResultMessage(
          `管理偏好已经保存，但当前6个推荐位只有${challenge.themeCount}类主题。请恢复一个减少项，再次保存查看变化。`,
        );
      } else if (phase === "free") {
        setChallengeComplete(challenge.diverse);
        setIsBreaking(false);
        if (options.releaseFreeCocoon) {
          setFreeThemeLikeCounts(initialEvidence);
          setFreeCocoonTheme(null);
        }
      }
    }, 1100);
  }

  function submitExplanation() {
    if (!explanationSelected) return;
    completeGuide("explanation-submit");
    setExplanationAttempts((count) => count + 1);
    if (explanationSelected === "correct") {
      setTransferInitialInterests({ ...interests });
      setExplanationFeedback(
        "你的行为改变了系统的判断，新的推荐又会影响你下一次选择。这个过程不断重复，就形成了反馈循环。",
      );
      recommendationTimer.current = window.setTimeout(() => {
        recommendationTimer.current = null;
        setPhase("transfer");
        setShowReflection(false);
      }, 650);
    } else {
      setExplanationFeedback(
        "再回看一次：行为先改变画像，画像影响排序，新的排序又会影响下一次选择。",
      );
    }
  }

  function completeTransfer() {
    if (!lifeAnswer) return;
    completeGuide("transfer-question");
    setReflectionCompleted(true);
    setTeachingCompleted(true);
    setPhase("complete");
  }

  function cancelPendingAnimations() {
    if (actionFeedbackTimer.current !== null) {
      window.clearTimeout(actionFeedbackTimer.current);
      actionFeedbackTimer.current = null;
    }
    if (recommendationTimer.current !== null) {
      window.clearTimeout(recommendationTimer.current);
      recommendationTimer.current = null;
    }
  }

  function resetForFreeMode(message = "自由实验已从均衡状态开始") {
    cancelPendingAnimations();
    setTeachingCompleted(true);
    setPhase("free");
    setPrediction("");
    setPredictionReason("");
    setPredictionModalOpen(false);
    setPredictionCloseMessage("");
    setShowOperationTransition(false);
    setInterests(initialInterests);
    setEvidence(initialEvidence);
    setCurrentIndex(initialIndex);
    setSeenIds([]);
    setSportLikedIds([]);
    setFreeThemeLikeCounts(initialEvidence);
    setFreeCocoonTheme(null);
    setPreferenceConflictTheme(null);
    setPreferenceConflictProcessing(false);
    setActionCount(0);
    setBlockedThemes([]);
    setPreferenceDraft([]);
    setPreferenceSavedInTeaching(false);
    setBreakResultMessage("");
    setPreferenceSaving(false);
    setRecommendationAnimating(false);
    setTransientActionFeedback(null);
    setContentAnalysisOpen(true);
    setHasIntervened(false);
    setIsBreaking(false);
    setObservationResultShown(false);
    setObservationChecks({ sportMore: false, othersRemain: false });
    setObservationCompleted(false);
    setShowComparison(false);
    setComparisonCloseMessage("");
    setChallengeComplete(false);
    setReflectionShown(false);
    setReflectionCompleted(false);
    setExplanationSelected("");
    setExplanationFeedback("");
    setExplanationAttempts(0);
    setLifeAnswer("");
    setShowGuide(false);
    setShowCocoonNotice(false);
    setShowManage(false);
    setShowReflection(false);
    setExperiencedBehaviors([]);
    setHasExplored(false);
    setHasOpenedManage(false);
    setOpenReasonId(null);
    setDropTheme(null);
    setIsDragging(false);
    setIsLeaving(false);
    setDragX(0);
    setBeforeOperationSnapshot(null);
    setAfterOperationSnapshot(null);
    setTransferInitialInterests(null);
    setLastSignal(null);
    setImmediateChange({
      behavior: message,
      profile: "五类兴趣恢复均衡",
      recommendation: "6个推荐位恢复多元，全部操作已解锁",
    });
  }

  function restartTeaching() {
    cancelPendingAnimations();
    setPredictionCards((previous) =>
      pickPredictionCards(contents, {
        previousIds: previous.map((card) => card.id),
      }),
    );
    setTeachingCompleted(false);
    setPhase("prediction");
    setPrediction("");
    setPredictionReason("");
    setPredictionModalOpen(true);
    setPredictionCloseMessage("");
    setShowOperationTransition(false);
    setInterests(initialInterests);
    setEvidence(initialEvidence);
    setCurrentIndex(initialIndex);
    setSeenIds([contents[initialIndex].id]);
    setSportLikedIds([]);
    setFreeThemeLikeCounts(initialEvidence);
    setFreeCocoonTheme(null);
    setPreferenceConflictTheme(null);
    setPreferenceConflictProcessing(false);
    setActionCount(0);
    setBlockedThemes([]);
    setPreferenceDraft([]);
    setPreferenceSavedInTeaching(false);
    setBreakResultMessage("");
    setPreferenceSaving(false);
    setRecommendationAnimating(false);
    setTransientActionFeedback(null);
    setContentAnalysisOpen(false);
    setHasIntervened(false);
    setIsBreaking(false);
    setObservationResultShown(false);
    setObservationChecks({ sportMore: false, othersRemain: false });
    setObservationCompleted(false);
    setShowComparison(false);
    setComparisonCloseMessage("");
    setChallengeComplete(false);
    setReflectionShown(false);
    setReflectionCompleted(false);
    setExplanationSelected("");
    setExplanationFeedback("");
    setExplanationAttempts(0);
    setLifeAnswer("");
    setShowGuide(false);
    setShowCocoonNotice(false);
    setShowManage(false);
    setShowReflection(false);
    setExperiencedBehaviors([]);
    setHasExplored(false);
    setHasOpenedManage(false);
    setSkippedGuideIds([]);
    setCompletedGuideIds([]);
    setOpenReasonId(null);
    setDropTheme(null);
    setIsDragging(false);
    setIsLeaving(false);
    setDragX(0);
    setBeforeOperationSnapshot(null);
    setAfterOperationSnapshot(null);
    setTransferInitialInterests(null);
    setLastSignal(null);
    setImmediateChange({
      behavior: "实验已重新开始",
      profile: "五类兴趣恢复相同",
      recommendation: "先做预测，再观察推荐变化",
    });
  }

  function resetFreeExperiment() {
    resetForFreeMode("自由实验已重置");
  }

  function resetCurrentStep() {
    cancelPendingAnimations();
    setTransientActionFeedback(null);
    setRecommendationAnimating(false);
    setPreferenceSaving(false);
    setPreferenceConflictTheme(null);
    setPreferenceConflictProcessing(false);
    setOpenReasonId(null);
    setDropTheme(null);
    setIsDragging(false);
    setIsLeaving(false);
    setDragX(0);
    setShowGuide(false);

    const guidePrefixes: Record<Exclude<Phase, "free">, string[]> = {
      prediction: ["prediction-"],
      operation: ["operation-"],
      observation: ["comparison-", "observation-"],
      explanation: ["explanation-"],
      transfer: ["explore-", "manage-", "transfer-"],
      complete: ["enter-free-"],
    };
    const prefixes = phase === "free" ? [] : guidePrefixes[phase];
    const belongsToCurrentStep = (id: string) =>
      prefixes.some((prefix) => id.startsWith(prefix));
    setSkippedGuideIds((previous) =>
      previous.filter((id) => !belongsToCurrentStep(id)),
    );
    setCompletedGuideIds((previous) =>
      previous.filter((id) => !belongsToCurrentStep(id)),
    );

    if (phase === "prediction") {
      setPrediction("");
      setPredictionReason("");
      setPredictionModalOpen(true);
      setPredictionCloseMessage("");
      setShowOperationTransition(false);
      setCurrentIndex(initialIndex);
      setSeenIds([contents[initialIndex].id]);
      setBeforeOperationSnapshot(null);
      setAfterOperationSnapshot(null);
      setImmediateChange({
        behavior: "预测步骤已重置",
        profile: "五类兴趣仍保持均衡",
        recommendation: "重新留下预测后再开始实验",
      });
      return;
    }

    if (phase === "operation") {
      const initialQueue = buildRecommendationQueue(
        initialInterests,
        initialIndex,
      );
      setInterests(initialInterests);
      setEvidence(initialEvidence);
      setCurrentIndex(initialIndex);
      setSeenIds([contents[initialIndex].id]);
      setSportLikedIds([]);
      setActionCount(0);
      setExperiencedBehaviors([]);
      setBeforeOperationSnapshot(
        createSnapshot(initialInterests, initialQueue),
      );
      setAfterOperationSnapshot(null);
      setShowOperationTransition(true);
      setShowCocoonNotice(false);
      setShowComparison(false);
      setObservationResultShown(false);
      setObservationChecks({ sportMore: false, othersRemain: false });
      setObservationCompleted(false);
      setHasIntervened(false);
      setIsBreaking(false);
      setChallengeComplete(false);
      setImmediateChange({
        behavior: "操作步骤已重置",
        profile: "五类兴趣恢复均衡",
        recommendation: "预测已保留，请重新完成行为实验",
      });
      return;
    }

    if (phase === "observation") {
      setObservationResultShown(false);
      setObservationChecks({ sportMore: false, othersRemain: false });
      setObservationCompleted(false);
      setComparisonCloseMessage("");
      setShowComparison(false);
      setShowCocoonNotice(true);
      setImmediateChange({
        behavior: "观察步骤已重置",
        profile: "操作产生的画像与快照仍然保留",
        recommendation: "重新打开前后对比并完成两项观察",
      });
      return;
    }

    if (phase === "explanation") {
      setExplanationSelected("");
      setExplanationFeedback("");
      setExplanationAttempts(0);
      setShowReflection(true);
      setImmediateChange({
        behavior: "解释步骤已重置",
        profile: "前面的真实实验数据仍然保留",
        recommendation: "重新选择反馈循环的正确顺序",
      });
      return;
    }

    if (phase === "transfer") {
      if (transferInitialInterests) {
        setInterests({ ...transferInitialInterests });
      }
      setBlockedThemes([]);
      setPreferenceDraft([]);
      setPreferenceSavedInTeaching(false);
      setBreakResultMessage("");
      setHasIntervened(false);
      setHasExplored(false);
      setHasOpenedManage(false);
      setIsBreaking(false);
      setChallengeComplete(false);
      setReflectionShown(false);
      setReflectionCompleted(false);
      setLifeAnswer("");
      setShowManage(false);
      setShowReflection(false);
      setImmediateChange({
        behavior: "迁移步骤已重置",
        profile: "前四步结果仍然保留",
        recommendation: "请重新探索主题并保存管理偏好",
      });
      return;
    }

    if (phase === "complete") {
      setShowReflection(true);
      setImmediateChange({
        behavior: "完成步骤已恢复",
        profile: "五步教学成果仍然保留",
        recommendation: "可以重新查看结论，再进入自由实验",
      });
    }
  }

  function closeStartGuide() {
    setShowGuide(false);
  }

  const stageStatus = (() => {
    if (phase === "prediction") return "预测未提交，行为按钮暂时锁定。";
    if (phase === "operation")
      return `运动点赞进度 ${sportLikeCount}/3；继续观看会影响画像，但不计次数。`;
    if (phase === "observation") return "打开前后对比，完成两项观察。";
    if (phase === "explanation")
      return "选择正确顺序，解释行为和推荐怎样互相影响。";
    if (phase === "transfer")
      return recommendationAnimating
        ? "推荐正在重新计算，请观察主页动画。"
        : challengeComplete
        ? "破茧成功，请完成生活情境题。"
        : "解释已完成，现在主动让推荐恢复至少4类主题。";
    if (phase === "free") return "自由探索中：全部操作已经开放。";
    return "五步教学已完成，可以进入自由探索。";
  })();

  const {
    leadingTheme,
    gap: dominantGap,
    hasClearDominant,
    dominant,
  } = getInterestDominance(currentShares);
  const teachingCocoonFormed =
    phase !== "free" && sportLikeCount >= 3 && !challengeComplete;
  const freeCocoonFormed =
    phase === "free" &&
    freeCocoonTheme !== null &&
    freeThemeLikeCounts[freeCocoonTheme] >= 3 &&
    hasClearDominant &&
    leadingTheme.key === freeCocoonTheme;
  const cocoonFormed = teachingCocoonFormed || freeCocoonFormed;
  const breakingTheme =
    isBreaking && phase === "free" && freeCocoonTheme
      ? themeByKey[freeCocoonTheme]
      : null;
  const cocoonTheme =
    freeCocoonFormed && freeCocoonTheme
      ? themeByKey[freeCocoonTheme]
      : teachingCocoonFormed
        ? themeByKey.sport
        : breakingTheme ?? dominant;
  const dominantIndex = cocoonTheme
    ? themes.findIndex((theme) => theme.key === cocoonTheme.key)
    : -1;
  const cocoonProgress = cocoonTheme
    ? Math.min(
        100,
        Math.max(0, ((currentShares[cocoonTheme.key] - 20) / 35) * 100),
      )
    : 0;
  const glassLevel = cocoonFormed ? (isBreaking ? 1 : 3) : breakingTheme ? 1 : 0;
  const gardenState = isBreaking
    ? "breaking"
    : cocoonFormed
      ? "cocooned"
      : dominant
        ? "concentrating"
        : "balanced";
  const visibleLikeTheme =
    phase === "free"
      ? freeCocoonFormed && freeCocoonTheme
        ? themeByKey[freeCocoonTheme]
        : themeByKey[current.theme]
      : themeByKey.sport;
  const visibleLikeCount =
    phase === "free" && visibleLikeTheme
      ? freeThemeLikeCounts[visibleLikeTheme.key]
      : sportLikeCount;
  const likeProgress = Math.min(100, (visibleLikeCount / 3) * 100);

  const cocoonStage = (() => {
    if (isBreaking) return ["破茧中", "主动选择正在改变推荐环境"];
    if (cocoonFormed && cocoonTheme)
      return [`${cocoonTheme.name}视野收拢`, "相似内容更容易排在前面"];
    if (dominant)
      return ["兴趣形成", `系统正在积累${dominant.name}兴趣线索`];
    return ["开放视野", "不同主题都有机会被看见"];
  })();

  const activeGuide: GuideStep | null = (() => {
    if (showGuide || phase === "free") return null;

    const nextGuide = (
      steps: Array<GuideStep & { done?: boolean }>,
    ): GuideStep | null => {
      const next = steps.find(
        (step) =>
          !step.done &&
          !skippedGuideIds.includes(step.id) &&
          !completedGuideIds.includes(step.id),
      );
      if (!next) return null;
      const { done: _done, ...guide } = next;
      return guide;
    };

    if (phase === "prediction") {
      return nextGuide([
        {
          id: "prediction-choice",
          target: "prediction-choice",
          title: "先猜一猜",
          text: "选一个你认为最可能发生的结果。",
          done: Boolean(prediction),
        },
        {
          id: "prediction-submit",
          target: "prediction-submit",
          title: "保存你的预测",
          text: "必须真实选择一个答案后才能提交。",
        },
      ]);
    }
    if (phase === "operation") {
      return nextGuide([
        {
          id: "operation-like-first",
          target: "action-like",
          title: "先体验一次喜欢",
          text: "喜欢会给当前主题加3分，是强正反馈。",
          done: sportLikeCount >= 1,
        },
        {
          id: "operation-stay",
          target: "action-stay",
          title: "体验继续观看",
          text: "继续观看会加1分，是较弱的兴趣线索。",
          done: experiencedBehaviors.includes("stay"),
        },
        {
          id: "operation-next",
          target: "action-next",
          title: "体验普通切换",
          text: "普通切换会减1分，表示兴趣不强。",
          done: experiencedBehaviors.includes("next"),
        },
        {
          id: "operation-reject",
          target: "action-reject",
          title: "体验快速划走",
          text: "1秒内划走会减4分，是明确的不感兴趣。",
          done: experiencedBehaviors.includes("reject"),
        },
        {
          id: "operation-like-second",
          target: "action-like",
          title: `继续喜欢运动内容（${sportLikeCount}/3）`,
          text: "继续积累真实的运动强正反馈。",
          done: sportLikeCount >= 2,
        },
        {
          id: "operation-like-third",
          target: "action-like",
          title: `完成第3次运动喜欢（${sportLikeCount}/3）`,
          text: "真实达到3次后，才会形成教学茧房并进入前后对比。",
          done: sportLikeCount >= 3,
        },
        {
          id: "operation-data-required",
          target: "action-like",
          title: `还缺${Math.max(0, 3 - sportLikeCount)}次真实运动喜欢`,
          text: "跳过指引不会生成实验数据；完成真实操作后才能进入对比。",
          done: sportLikeCount >= 3,
        },
      ]);
    }
    if (phase === "observation") {
      if (showComparison) {
        return nextGuide([
          { id: "observation-one", target: "observation-one", title: "找第一处变化", text: "看看同类运动内容是不是变多了。", done: observationChecks.sportMore },
          { id: "observation-two", target: "observation-two", title: "找第二处变化", text: "其他主题没有消失，只是排到了后面。", done: observationChecks.othersRemain },
          { id: "observation-finish", target: "observation-finish", title: "完成观察", text: "两项真实观察都完成后，点击这里进入解释。", done: false },
        ]);
      }
      return nextGuide([
        { id: "comparison-open", target: "compare-open", title: "打开前后对比", text: "系统保存了操作前后的真实推荐结果。" },
      ]);
    }
    if (phase === "explanation") {
      return nextGuide([
        { id: "explanation-answer", target: "explanation-answer", title: "选出反馈循环", text: "从行为开始，找出一步接一步的正确顺序。", done: Boolean(explanationSelected) },
        { id: "explanation-submit", target: "explanation-submit", title: "提交顺序", text: "系统会马上告诉你这条因果链是否合理。" },
      ]);
    }
    if (phase === "transfer") {
      if (recommendationAnimating) return null;
      if (showReflection)
        return nextGuide([
          { id: "transfer-question", target: "transfer-answer", title: "把方法用到生活中", text: "选出能让信息来源更多元的做法。", done: Boolean(lifeAnswer) },
        ]);
      return nextGuide([
        { id: "explore-theme", target: "explore", title: "先探索新主题", text: "给较少出现的主题一次重新进入推荐的机会。", done: hasExplored },
        { id: "manage-preference", target: "manage", title: hasOpenedManage ? "返回并保存偏好" : "打开管理偏好", text: "在草稿中调整后，点击“保存并查看推荐变化”才算完成。", done: preferenceSavedInTeaching },
        { id: "transfer-explore-required", target: "explore", title: "还需要一次真实探索", text: "跳过提示不会生成探索结果，请实际点击一次。", done: hasExplored },
        { id: "transfer-manage-required", target: "manage", title: "还需要正式保存偏好", text: "打开或改草稿都不算完成，必须点击保存。", done: preferenceSavedInTeaching },
      ]);
    }
    if (phase === "complete")
      return nextGuide([
        { id: "enter-free-mode", target: "enter-free", title: "重置后自由探索", text: "教学已完成，先把实验数据恢复均衡，再自由尝试。" },
      ]);
    return null;
  })();

  function recommendationReason(item: QueueItem) {
    if (item.isExplore) return item.reason;
    if (
      lastSignal?.theme &&
      (lastSignal.kind === "like" || lastSignal.kind === "stay") &&
      item.topics[themeByKey[lastSignal.theme].name] > 0
    ) {
      return `因为你刚才${lastSignal.label}了${themeByKey[lastSignal.theme].name}内容`;
    }
    if (hasIntervened) return "管理偏好或主动探索后，系统重新计算了顺序";
    if (item.baseScore >= 0.8) return "当前内容基础分较高，同时符合你的兴趣画像";
    return "当前兴趣画像与这张内容的主题权重比较匹配";
  }

  return (
    <main
      className={`app-shell phase-${phase} ${teachingCompleted ? "teaching-completed" : ""} ${recommendationAnimating ? "recommendation-animating" : ""}`}
    >
      <header className="topbar">
        <a className="brand" href="#experiment" aria-label="返回实验区域">
          <span className="brand-mark">茧</span>
          <span>
            <strong>破茧</strong>
            <small>推荐算法互动实验室</small>
          </span>
        </a>
        <div className="headline">
          <span className="eyebrow">AI通识 · 交互式数字资源</span>
          <h1>看见行为与推荐怎样形成反馈循环</h1>
        </div>
        <div className="top-actions">
          <span className="simulation-badge">100张原创教学卡</span>
          <button className="icon-button" onClick={() => setShowGuide(true)}>
            使用说明
          </button>
        </div>
      </header>

      <section className="task-strip" aria-label="当前学习任务">
        <div className="phase-progress">
          {(["prediction", "operation", "observation", "explanation", "transfer"] as const).map(
            (item, index) => {
              const currentStep = phaseCopy[phase].number;
              const complete =
                currentStep > index + 1 || phase === "complete" || phase === "free";
              const active =
                phase !== "complete" &&
                phase !== "free" &&
                phaseCopy[item].number === currentStep;
              return (
                <span
                  key={item}
                  className={`${active ? "active" : ""} ${complete ? "complete" : ""}`}
                >
                  <i>{complete ? "✓" : index + 1}</i>
                  {phaseCopy[item].name}
                </span>
              );
            },
          )}
        </div>
        <div
          className={`current-task ${guideIsInDialog ? "guide-behind-dialog" : ""}`}
        >
          <span>
            第{phaseCopy[phase].number}步 · {phaseCopy[phase].name}
          </span>
          <strong>
            现在要做什么：
            {guideIsInDialog
              ? "任务已经在当前学习卡中打开。"
              : phaseCopy[phase].task}
          </strong>
          {phase !== "complete" && phase !== "free" && !guideIsInDialog && (
            <small className="task-hover-note">
              {guideHoverCopy[phase]}
            </small>
          )}
        </div>
      </section>

      <section id="experiment" className="lab-grid">
        <article className="panel feed-panel">
          <div className="panel-heading">
            <div>
              <span className="step-number">01</span>
              <h2>当前内容与行为操作</h2>
            </div>
            <span className="live-pill"><i /> 100张内容池</span>
          </div>

          {phase === "operation" && (
            <>
              {showOperationTransition && (
                <div className="operation-transition" role="status">
                  <span>从多元内容池进入统一实验</span>
                  <p>
                    内容池里原本有很多不同主题。为了看清推荐怎样发生变化，这一轮我们统一连续关注运动内容。
                  </p>
                </div>
              )}
              <div className="operation-cue" aria-live="polite">
                <div>
                  <span>运动正反馈</span>
                  <strong>{sportLikeCount}/3</strong>
                </div>
                <div className="progress-dots">
                  {[1, 2, 3].map((step) => (
                    <i
                      key={step}
                      className={sportLikeCount >= step ? "done" : ""}
                    />
                  ))}
                </div>
                <p>试试看：点击这条运动内容的“喜欢”。</p>
              </div>
            </>
          )}

          <div className="feed-content-stack">
              <div
                className={`video-card ${isDragging ? "dragging" : ""} ${isLeaving ? "leaving" : ""} ${!canOperate ? "locked" : ""}`}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={() => {
                  setIsDragging(false);
                  setDragX(0);
                }}
                style={{
                  background: current.gradient,
                  transform: `translateX(${dragX}px) rotate(${dragX / 24}deg)`,
                  opacity: Math.max(0.18, 1 - Math.abs(dragX) / 560),
                }}
              >
            {current.video ? (
              <video
                key={current.video}
                src={current.video}
                autoPlay
                muted
                loop
                playsInline
                draggable={false}
              />
            ) : (
              <div
                className="poster-visual"
                aria-label={`${current.title}教学示意画面`}
              >
                <span className="poster-orbit" />
                <span className="poster-symbol">{current.emoji}</span>
                <span className="poster-grid" />
              </div>
            )}
            <div className="video-shade" />
            <div className="tag-row">
              {currentTagWeights.map(({ tag, weight }) => (
                <span key={tag}>#{tag} {Math.round(weight * 100)}%</span>
              ))}
            </div>
            <div className="video-copy">
              <span className="creator">
                原创虚构教学卡 · {current.id}
              </span>
              <h3>{current.title}</h3>
              <p>{current.summary}</p>
            </div>
            {canOperate && (
              <div className="swipe-hint">
                <span>←</span> 慢速左划=普通切换 −1；1秒内快速左划=不感兴趣 −4
              </div>
            )}
            <div
              className="swipe-feedback"
              style={{ opacity: Math.min(1, Math.max(0, -dragX - 18) / 90) }}
            >
              <span>×</span>
              <strong>不感兴趣</strong>
              <small>这是强负反馈，但不会批评你的选择</small>
            </div>
              </div>

              <div className="choice-grid four-actions">
                <button
                  className="choice-button next"
                  data-guide-target="action-next"
                  onClick={() => animateAway("next")}
                  disabled={!canOperate || isLeaving || transientActionFeedback !== null}
                  title="轻微降低这类内容的推荐机会"
                >
                  <span>→</span>
                  <strong>普通切换</strong>
                  <small>弱负反馈 −1</small>
                </button>
                <button
                  className="choice-button skip"
                  data-guide-target="action-reject"
                  onClick={() => animateAway("reject")}
                  disabled={!canOperate || isLeaving || transientActionFeedback !== null}
                  title="明确告诉系统暂时不想看这类内容"
                >
                  <span>↤</span>
                  <strong>快速划走／不感兴趣</strong>
                  <small>点击或1秒内快划 · −4</small>
                </button>
                <button
                  className="choice-button watch"
                  data-guide-target="action-stay"
                  onClick={() => applySignal("stay")}
                  disabled={!canOperate || isLeaving || transientActionFeedback !== null}
                  title="会更新画像，但不计入3次点赞"
                >
                  <span>◷</span>
                  <strong>继续观看</strong>
                  <small>弱正反馈 +1</small>
                </button>
                <button
                  className={`choice-button like ${transientActionFeedback === "like" ? "feedback-success" : ""}`}
                  data-guide-target="action-like"
                  onClick={(event) => {
                    event.currentTarget.blur();
                    applySignal("like");
                  }}
                  disabled={
                    !canOperate ||
                    isLeaving ||
                    transientActionFeedback !== null ||
                    (phase === "operation" && sportLikedIds.includes(current.id))
                  }
                  title="你的点击会成为系统判断兴趣的一条线索"
                >
                  <span>♥</span>
                  <strong>喜欢</strong>
                  <small>强正反馈 +3</small>
                </button>
              </div>
              {!canOperate && (
                <p className="locked-note">
                  首轮操作已结束；现在按任务条继续观察。
                </p>
              )}

              <details
                className="tag-weight-card content-analysis-card"
                open={contentAnalysisOpen}
                onToggle={(event) =>
                  setContentAnalysisOpen(event.currentTarget.open)
                }
              >
                <summary>
                  <span>AI怎样理解这条内容</span>
                  {phase !== "free" && <small>查看预设标签与权重</small>}
                </summary>
                {currentTagWeights.map(({ tag, weight }) => (
                  <div className="tag-weight-row" key={tag}>
                    <span>{tag}</span>
                    <div><i style={{ width: `${weight * 100}%` }} /></div>
                    <strong>{Math.round(weight * 100)}%</strong>
                  </div>
                ))}
                <div className="content-match-flow" aria-label="内容分析过程">
                  <span>内容标签</span><i>→</i>
                  <span>对照画像</span><i>→</i>
                  <span>计算顺序</span>
                </div>
                <p>
                  系统会把这些预设标签和你的兴趣画像进行比较，再决定推荐顺序。
                </p>
              </details>
          </div>
        </article>

        <article className="panel garden-panel">
          <div className="panel-heading">
            <div>
              <span className="step-number">02</span>
              <h2>信息温室与推荐变化</h2>
            </div>
            <span className={`stage-badge level-${glassLevel}`}>
              {cocoonStage[0]} · {Math.round(cocoonProgress)}%
            </span>
          </div>

          <div
            className={`greenhouse glass-level-${glassLevel} garden-state-${gardenState}`}
            data-cocoon-theme={cocoonFormed ? cocoonTheme?.key : undefined}
          >
            <div className="sky-glow" />
            <div className="glass glass-left" />
            <div className="glass glass-right" />
            <div className="glass glass-roof-left" />
            <div className="glass glass-roof-right" />
            <div className="glass glass-front" />
            <div className="glass-grid-lines" />
            <div
              className={`cocoon-shell woven-cocoon ${isBreaking ? "breaking" : ""}`}
              style={{
                opacity:
                  glassLevel === 0
                    ? 0
                    : isBreaking
                      ? 0.56
                      : 0.34 + cocoonProgress / 165,
                transform: `translate(-50%, -43%) scale(${isBreaking ? 1.02 : 0.72 + cocoonProgress / 340})`,
              }}
            >
              <i /><i /><i /><i /><i />
              <span className="shell-shine" />
            </div>

            <div className="garden-caption">
              <span>信息温室</span>
              <p>{cocoonStage[1]}</p>
            </div>

            <div className="flower-bed">
              {themes.map((theme, index) => {
                const movement =
                  !cocoonTheme
                    ? 0
                    : cocoonFormed
                      ? 1
                      : Math.min(0.42, dominantGap / 18);
                const basePosition = 12 + index * 19;
                const otherFlowerIndices = themes
                  .map((_, themeIndex) => themeIndex)
                  .filter((themeIndex) => themeIndex !== dominantIndex);
                const sideTargets = [9, 27, 73, 91];
                let targetPosition = basePosition;
                if (cocoonTheme && index === dominantIndex) {
                  targetPosition = 50;
                } else if (cocoonTheme) {
                  const sideOrder = otherFlowerIndices.indexOf(index);
                  targetPosition = sideTargets[sideOrder] ?? basePosition;
                }
                const position =
                  basePosition + (targetPosition - basePosition) * movement;
                const isDominantFlower = cocoonTheme?.key === theme.key;
                const scale =
                  !cocoonTheme
                    ? 0.94
                    : isDominantFlower
                      ? Math.min(
                          1.56,
                          0.96 + Math.max(0, currentShares[theme.key] - 20) / 48,
                        )
                      : Math.max(0.72, 0.94 - movement * 0.2);
                return (
                  <button
                    className={`flower-plant ${isDominantFlower ? "dominant" : cocoonTheme ? "pushed" : "balanced"}`}
                    key={theme.key}
                    title={`${theme.name}当前兴趣占比 ${currentShares[theme.key]}%${phase === "free" ? `，累计喜欢${freeThemeLikeCounts[theme.key]}次` : ""}`}
                    data-theme={theme.key}
                    data-like-count={phase === "free" ? freeThemeLikeCounts[theme.key] : undefined}
                    style={{
                      left: `${position}%`,
                      "--plant-scale": scale,
                      "--plant-opacity":
                        isDominantFlower
                          ? 1
                          : Math.max(0.58, 1 - movement * 0.38),
                      zIndex: isDominantFlower ? 12 : 4,
                    } as CSSProperties}
                  >
                    {dropTheme === theme.key && (
                      <span className="water-drop" key={actionCount}>●</span>
                    )}
                    <span
                      className="flower-head"
                      style={{ "--flower": theme.color } as CSSProperties}
                    >
                      <i /><i /><i /><i /><i /><b>{theme.icon}</b>
                    </span>
                    <span className="stem" />
                    <span className="leaf leaf-left" />
                    <span className="leaf leaf-right" />
                    <strong>{theme.name}</strong>
                  </button>
                );
              })}
            </div>

            <div className="soil"><span /><span /><span /><span /></div>

            <div className="cocoon-meter">
              <div className="meter-label">
                <span>
                  {visibleLikeTheme?.name ?? "当前"}兴趣占比：
                  {visibleLikeTheme ? currentShares[visibleLikeTheme.key] : 20}%
                </span>
                <strong>{Math.min(3, visibleLikeCount)}/3次累计喜欢</strong>
              </div>
              <div className="meter-track">
                <i style={{ width: `${Math.max(3, likeProgress)}%` }} />
              </div>
              <small>
                同一主题累计喜欢3次后，才会出现玻璃边界。
              </small>
            </div>
          </div>

          <div className="recommendation-flow">
            <div className="flow-head">
              <div>
                <span>当前6个推荐位</span>
                <small>匹配内容为主，并保留2个探索位置</small>
              </div>
              <span className="flow-arrow">
                兴趣画像 + 内容权重 + 探索机会 → 排序
              </span>
            </div>
            <div className="mini-card-row six-cards">
              {recommendationQueue.map((item, rank) => {
                const features = getTagWeights(item).slice(0, 2);
                const reason = recommendationReason(item);
                return (
                  <article
                    key={`${item.id}-${rank}`}
                    className={`mini-card ${rank === 0 ? "first" : ""} ${openReasonId === item.id ? "reason-open" : ""}`}
                    role="button"
                    tabIndex={phase === "prediction" || phase === "operation" ? -1 : 0}
                    aria-disabled={phase === "prediction" || phase === "operation"}
                    onClick={() => {
                      if (phase === "prediction" || phase === "operation") return;
                      setCurrentIndex(item.index);
                      setSeenIds((previous) =>
                        [...previous, item.id].slice(-20),
                      );
                    }}
                    onKeyDown={(event) => {
                      if ((event.key === "Enter" || event.key === " ") && phase !== "prediction" && phase !== "operation") {
                        event.preventDefault();
                        setCurrentIndex(item.index);
                      }
                    }}
                  >
                    <span
                      className="mini-thumb"
                      style={{ background: item.gradient }}
                    >
                      {item.emoji}
                    </span>
                    <span>
                      <small>
                        {item.isExplore ? "探索位置" : `推荐位 ${rank + 1}`}
                      </small>
                      <strong>{item.title}</strong>
                      <em>
                        {features
                          .map(
                            (feature) =>
                              `${feature.tag}${Math.round(feature.weight * 100)}%`,
                          )
                          .join(" · ")}
                      </em>
                      <b className="reason-chip">{reason}</b>
                    </span>
                    <button
                      className="why-recommendation"
                      aria-label={`为什么推荐：${item.title}`}
                      aria-expanded={openReasonId === item.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        setOpenReasonId((previous) =>
                          previous === item.id ? null : item.id,
                        );
                      }}
                    >
                      推荐原因
                    </button>
                  </article>
                );
              })}
            </div>
          </div>

          {phase === "observation" && (
            <section className="observation-card compact-observation-launcher">
              <div className="observation-head">
                <div>
                  <span>第3步 · 操作前后对比</span>
                  <h3>系统已经保存两份真实结果</h3>
                </div>
                <button
                  className="primary-task-button"
                  data-guide-target="compare-open"
                  onClick={openComparison}
                >
                  打开前后对比 <span>→</span>
                </button>
              </div>
              <p className="observation-placeholder">
                对比会在弹窗中完成，不会占用温室的观察空间。
              </p>
            </section>
          )}
        </article>

        <aside className="panel explain-panel">
          <div className="panel-heading">
            <div>
              <span className="step-number">03</span>
              <h2>兴趣画像与主动干预</h2>
            </div>
          </div>

          <div className="why-card stage-summary">
            <div className="why-title">
              <span className="spark">{phaseCopy[phase].number}</span>
              <div>
                <small>当前阶段摘要</small>
                <strong>{stageStatus}</strong>
              </div>
            </div>
          </div>

          <div className="profile-card">
            <div className="card-title">
              <span>实时兴趣画像</span>
              <small>系统暂时推测，不是你的真实身份</small>
            </div>
            <div className="profile-bars">
              {themes.map((theme) => (
                <div className="profile-row" key={theme.key}>
                  <span className="profile-name">
                    <i style={{ background: theme.color }} />{theme.name}
                  </span>
                  <div className="bar-track">
                    <i
                      style={{
                        width: `${currentShares[theme.key]}%`,
                        background: theme.color,
                      }}
                    />
                  </div>
                  <strong>{currentShares[theme.key]}%</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="diversity-card">
            <div
              className="diversity-ring"
              style={{ "--score": `${diversity * 3.6}deg` } as CSSProperties}
            >
              <div><strong>{diversity}</strong><small>多样性</small></div>
            </div>
            <div>
              <span>当前推荐流有{visibleThemeCount}类主题</span>
              <strong>
                {diversity >= 75
                  ? "视野比较开阔"
                  : diversity >= 52
                    ? "视野正在收窄"
                    : "可以主动探索"}
              </strong>
              <p>主题越丰富，单一主题占得越少，多样性越高。这个分数只看当前6个真实推荐位。</p>
            </div>
          </div>

          <div className={`challenge-card ${!canIntervene ? "locked" : ""}`}>
            <span className="challenge-label">主动破茧挑战</span>
            <h3>
              {phase === "free"
                ? "自由尝试不同干预方式"
                : challengeComplete
                ? "推荐流已恢复至少4类主题"
                : recommendationAnimating
                  ? "正在播放推荐变化"
                : canIntervene
                  ? "让至少4类主题重新出现"
                  : "完成前四步后开放"}
            </h3>
            <p>
              {recommendationAnimating
                ? "先观察主页变化，动画完成后再继续。"
                : canIntervene
                  ? "主动探索或管理偏好，都可能改变推荐环境。"
                  : "先完成预测、操作、对比和反馈循环解释。"}
            </p>
            {recommendationAnimating && (
              <div className="recommendation-animation-status" role="status">
                <i /> 正在重新计算画像、推荐列表和花园…
              </div>
            )}
            {breakResultMessage && !recommendationAnimating && (
              <div className="break-result-message" role="status">
                <p>{breakResultMessage}</p>
                <button onClick={openManage} disabled={!canIntervene}>
                  调整已保存的偏好
                </button>
              </div>
            )}
            <div className="challenge-actions">
              <button
                onClick={explore}
                data-guide-target="explore"
                disabled={!canIntervene || (phase === "transfer" && hasExplored)}
                title="给低权重主题更多出现机会"
              >
                <span>↗</span>
                探索新主题
                <small>让不同主题重新进入</small>
              </button>
              <button
                onClick={openManage}
                data-guide-target="manage"
                disabled={!canIntervene}
                title="主动调整系统记录的偏好"
              >
                <span>⌘</span>
                管理偏好
                <small>调整主题推荐机会</small>
              </button>
            </div>
            {reflectionShown && phase === "transfer" && !reflectionCompleted && (
              <button
                className="reflection-trigger"
                onClick={() => setShowReflection(true)}
              >
                完成生活题 →
              </button>
            )}
            {reflectionCompleted && (
              <button
                className="reflection-trigger"
                onClick={() => setShowReflection(true)}
              >
                查看学习结论 →
              </button>
            )}
          </div>

          <p className="model-note">
            教学用简化模拟：不采集真实数据，不识别真实视频，也不代表任何真实平台的完整算法。
          </p>
        </aside>

        <section className="instant-cause" aria-live="polite">
          <div className="instant-title">
            <span>刚刚一次行为造成的变化</span>
            <small>每一步都来自本次真实计算</small>
          </div>
          <div className="cause-chain">
            <span>
              <i>1</i>
              <span className="cause-copy">
                <small>本次行为＋画像变化</small>
                {immediateChange.behavior}；{immediateChange.profile}
              </span>
            </span>
            <b>→</b>
            <span>
              <i>2</i>
              <span className="cause-copy">
                <small>推荐变化</small>
                {immediateChange.recommendation}
              </span>
            </span>
          </div>
          <div className="instant-actions">
            <span>已记录{actionCount}次行为</span>
            {phase === "free" ? (
              <>
                <button onClick={resetFreeExperiment}>↻ 重置自由实验</button>
                <button onClick={restartTeaching}>重新开始教学</button>
              </>
            ) : (
              <>
                <button
                  onClick={resetCurrentStep}
                  title="只恢复当前教学步骤，不清除已经完成的前面步骤"
                >
                  ↻ 重置当前步骤
                </button>
                <button
                  onClick={restartTeaching}
                  title="清空本轮预测、画像和学习进度"
                >
                  重新开始教学
                </button>
              </>
            )}
          </div>
        </section>
      </section>

      {showGuide && (
        <ModalShell
          label="开始实验"
          className="guide-card"
          onClose={closeStartGuide}
        >
          <span className="guide-kicker">五步互动学习</span>
          <h2>为什么推荐内容会越看越相似？</h2>
          <p className="guide-intro">
            你会先猜一猜，再累计喜欢3条运动内容，比较推荐变化，最后主动让信息来源恢复多元。
          </p>
          <div className="guide-steps five-steps">
            {["先做预测", "留下信号", "比较变化", "解释循环", "迁移生活"].map(
              (text, index) => (
                <div key={text}>
                  <i>{index + 1}</i>
                  <strong>{text}</strong>
                </div>
              ),
            )}
          </div>
          <div className="simulation-notice">
            <strong>教学用简化模拟</strong>
            <p>
              本作品不采集真实用户数据，不识别真实视频，也不接入真实推荐平台。
            </p>
          </div>
          <button
            className="start-button"
            onClick={closeStartGuide}
          >
            {phase === "prediction" ? "返回预测" : "继续实验"} <span>→</span>
          </button>
        </ModalShell>
      )}

      {predictionModalOpen && !showGuide && (
        <ModalShell
          label="第一步：看标签并预测"
          className="prediction-dialog"
          onClose={keepPredictionOpen}
          showCloseButton={false}
          closeOnEscape={false}
        >
          <span className="guide-kicker">第1步 · 先看标签</span>
          <h2>先看看初始内容池有多丰富</h2>
          <p className="prediction-dialog-intro">
            下面五类内容只用来展示。标签和权重是实验提前设置的，不是网页正在识别真实视频。
          </p>
          <section
            className="prediction-showcase prediction-showcase-modal"
            aria-label="五类代表内容"
          >
            <div className="prediction-card-list">
              {predictionCards.map((card) => {
                const theme = themeByKey[card.theme];
                const featureTags = getTagWeights(card).slice(0, 2);
                return (
                  <article
                    key={card.id}
                    className="prediction-preview"
                    style={
                      {
                        "--preview-color": theme.color,
                        "--preview-soft": theme.soft,
                      } as CSSProperties
                    }
                  >
                    <span
                      className="prediction-preview-visual"
                      style={{ background: card.gradient }}
                      aria-hidden="true"
                    >
                      {card.emoji}
                    </span>
                    <div>
                      <span className="prediction-theme">{theme.name}</span>
                      <strong>{card.title}</strong>
                      <small>
                        {featureTags
                          .map(
                            (item) =>
                              `${item.tag}${Math.round(item.weight * 100)}%`,
                          )
                          .join(" · ")}
                      </small>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
          <section className="prediction-dialog-question">
            <span className="inline-kicker">留下你的猜想</span>
            <h3>如果多次喜欢同一类内容，接下来可能发生什么？</h3>
            <div
              className="prediction-options"
              data-guide-target="prediction-choice"
            >
              {[
                ["more", "同类内容会变多，其他主题可能更难排到前面"],
                ["same", "五类内容会一直完全不变"],
                ["gone", "其他内容会全部消失"],
              ].map(([value, text]) => (
                <label
                  key={value}
                  className={prediction === value ? "selected" : ""}
                >
                  <input
                    type="radio"
                    name="prediction"
                    value={value}
                    checked={prediction === value}
                    onChange={() => {
                      setPrediction(value);
                      setPredictionCloseMessage("");
                      completeGuide("prediction-choice");
                    }}
                  />
                  <span>{text}</span>
                </label>
              ))}
            </div>
            <label className="reason-field">
              <span>可选：用一句话写下理由</span>
              <input
                value={predictionReason}
                maxLength={80}
                onChange={(event) => setPredictionReason(event.target.value)}
                placeholder="例如：系统可能会记住我喜欢的主题"
              />
            </label>
          </section>
          {predictionCloseMessage && (
            <p className="prediction-close-message" role="status">
              {predictionCloseMessage}
            </p>
          )}
          <button
            className="start-button"
            data-guide-target="prediction-submit"
            disabled={!prediction}
            onClick={submitPrediction}
          >
            保存预测并开始实验 <span>→</span>
          </button>
        </ModalShell>
      )}

      {showCocoonNotice && (
        <ModalShell
          label="信息茧房形成提示"
          className="cocoon-notice-card"
          onClose={() => setShowCocoonNotice(false)}
        >
          <span className="guide-kicker">信息视野正在收拢</span>
          <h2>相似内容正在变多</h2>
          <p className="notice-definition">
            当相似内容不断出现，而不同主题越来越难被看见时，我们的信息视野就可能慢慢变窄，这种现象常被称为“信息茧房”。
          </p>
          <div className="gentle-reminder">
            其他内容通常没有消失，只是可能排到了更后面。
          </div>
          <button
            className="start-button"
            data-guide-target="compare-open"
            onClick={openComparison}
          >
            去比较操作前后 <span>→</span>
          </button>
        </ModalShell>
      )}

      {showComparison && afterOperationSnapshot && (
        <ModalShell
          label="操作前后推荐对比"
          className="comparison-dialog"
          onClose={finishObservation}
        >
          <span className="guide-kicker">第3步 · 对比真实结果</span>
          <h2>3次运动点赞前后，什么变了？</h2>
          <div className="comparison-columns">
            <section>
              <span>操作前</span>
              <strong>推荐比较均衡</strong>
              <div className="snapshot-metrics">
                <p><b>{(beforeOperationSnapshot ?? baselineSnapshot).themeCount}类</b><small>推荐流里的主题种类</small></p>
                <p><b>{(beforeOperationSnapshot ?? baselineSnapshot).sportShare}%</b><small>运动兴趣占比</small></p>
                <p><b>{(beforeOperationSnapshot ?? baselineSnapshot).sportSlots}/6</b><small>运动占据的推荐位</small></p>
                <p><b>{(beforeOperationSnapshot ?? baselineSnapshot).diversity}</b><small>推荐流多样性</small></p>
              </div>
            </section>
            <i className="comparison-arrow" aria-hidden="true">➜</i>
            <section>
              <span>操作后</span>
              <strong>运动内容更靠前</strong>
              <div className="snapshot-metrics">
                <p className={afterOperationSnapshot.themeCount < (beforeOperationSnapshot ?? baselineSnapshot).themeCount ? "delta-down" : "delta-same"}><b>{afterOperationSnapshot.themeCount}类</b><small>推荐流里的主题种类</small></p>
                <p className="delta-up"><b>{afterOperationSnapshot.sportShare}%</b><small>运动兴趣占比</small></p>
                <p className="delta-up"><b>{afterOperationSnapshot.sportSlots}/6</b><small>运动占据的推荐位</small></p>
                <p className={afterOperationSnapshot.diversity < (beforeOperationSnapshot ?? baselineSnapshot).diversity ? "delta-down" : "delta-same"}><b>{afterOperationSnapshot.diversity}</b><small>推荐流多样性</small></p>
              </div>
            </section>
          </div>
          <div className="observation-checks comparison-observations">
            <button
              data-guide-target="observation-one"
              className={observationChecks.sportMore ? "selected" : ""}
              onClick={() => toggleObservation("sportMore")}
            >
              <i>{observationChecks.sportMore ? "✓" : ""}</i>
              同类运动内容变多了
            </button>
            <button
              data-guide-target="observation-two"
              className={observationChecks.othersRemain ? "selected" : ""}
              onClick={() => toggleObservation("othersRemain")}
            >
              <i>{observationChecks.othersRemain ? "✓" : ""}</i>
              其他主题没有消失，只是排到了后面
            </button>
          </div>
          {comparisonCloseMessage && (
            <p className="comparison-message" role="status">{comparisonCloseMessage}</p>
          )}
          <button
            className="start-button"
            data-guide-target="observation-finish"
            disabled={!observationCompleted}
            onClick={finishObservation}
          >
            完成观察，解释原因 <span>→</span>
          </button>
        </ModalShell>
      )}

      {showManage && (
        <ModalShell
          label="管理推荐偏好"
          className="manage-card preference-sheet"
          onClose={closeManage}
        >
          <span className="guide-kicker">主动调节推荐环境</span>
          <h2>管理我的推荐偏好</h2>
          <p>
            先在草稿里调整，可以连续修改多个主题。只有点击下方保存，才会正式改变推荐。
          </p>
          <p className="preference-limit-note">
            至少保留一类正常推荐，系统才能继续提供内容。
          </p>
          <div className="preference-draft-note" role="status">
            草稿已调整 {preferenceDraft.filter((theme) => !blockedThemes.includes(theme)).length + blockedThemes.filter((theme) => !preferenceDraft.includes(theme)).length} 项
          </div>
          <div className="manage-list">
            {themes.map((theme) => {
              const reducedInDraft = preferenceDraft.includes(theme.key);
              const keepOneTheme =
                !reducedInDraft && preferenceDraft.length >= 4;
              return (
                <div key={theme.key}>
                  <span style={{ background: theme.soft, color: theme.color }}>
                    {theme.icon}
                  </span>
                  <div>
                    <strong>{theme.name}</strong>
                    <small>当前兴趣占比 {currentShares[theme.key]}%</small>
                  </div>
                  <button
                    className={`${reducedInDraft ? "restore" : ""} ${keepOneTheme ? "keep-one" : ""}`}
                    onClick={() => togglePreferenceDraft(theme.key)}
                    disabled={preferenceSaving || keepOneTheme}
                  >
                    {reducedInDraft
                      ? "恢复推荐"
                      : keepOneTheme
                        ? "至少保留一类"
                        : "减少推荐"}
                  </button>
                </div>
              );
            })}
          </div>
          <button
            className="start-button"
            onClick={savePreferences}
            disabled={!preferenceHasChanges || preferenceSaving}
          >
            {preferenceSaving ? "正在保存…" : "保存并查看推荐变化"}
          </button>
        </ModalShell>
      )}

      {preferenceConflictTheme && (
        <ModalShell
          label="推荐偏好冲突提醒"
          className="manage-card preference-conflict-card"
          onClose={keepReducedPreference}
        >
          <span className="guide-kicker">检测到偏好冲突</span>
          <h2>要恢复这个主题吗？</h2>
          <div className="preference-conflict-icon" aria-hidden="true">
            {themeByKey[preferenceConflictTheme].icon}
          </div>
          <p className="preference-conflict-message">
            你最近对“{themeByKey[preferenceConflictTheme].name}”表现出较强兴趣，
            但它仍处于“减少推荐”状态。是否取消减少推荐？
          </p>
          <div className="preference-conflict-actions">
            <button
              className="start-button"
              onClick={restoreConflictingPreference}
              disabled={preferenceConflictProcessing}
            >
              是，恢复正常推荐
            </button>
            <button
              onClick={keepReducedPreference}
              disabled={preferenceConflictProcessing}
            >
              否，继续减少推荐
            </button>
          </div>
          <small className="preference-conflict-note">
            这次询问只在兴趣占比从不超过50%上升到超过50%时出现。
          </small>
        </ModalShell>
      )}

      {showReflection && (
        <ModalShell
          label="解释与迁移任务"
          className="reflection-card learning-dialog"
          onClose={() => {
            if (phase === "complete") setShowReflection(false);
          }}
        >
          {phase === "explanation" && (
            <>
              <span className="guide-kicker">第4步 · 解释</span>
              <h2>哪条因果顺序最合理？</h2>
              <div className="dialog-step-guide">
                <strong>{phaseCopy.explanation.task}</strong>
                <small>{guideHoverCopy.explanation}</small>
              </div>
              <p className="dialog-lead">
                选出“行为—画像—推荐—再次行为”的正确顺序。
              </p>
              <div
                className="answer-list explanation-options current-guide-target"
                data-guide-target="explanation-answer"
              >
                {[
                  [
                    "correct",
                    "我的行为信号 → 系统更新兴趣画像 → 推荐重新排序 → 我看到更多同类内容 → 更容易产生新的相似行为",
                  ],
                  [
                    "wrong-a",
                    "相似内容先消失 → 系统停止排序 → 我的画像保持不变",
                  ],
                  [
                    "wrong-b",
                    "系统先决定我的全部喜好 → 我的任何行为都不会再产生影响",
                  ],
                ].map(([value, text], index) => (
                  <button
                    key={value}
                    className={explanationSelected === value ? "selected" : ""}
                    onClick={() => {
                      setExplanationSelected(value);
                      setExplanationFeedback("");
                      completeGuide("explanation-answer");
                    }}
                  >
                    <span>{String.fromCharCode(65 + index)}</span>{text}
                  </button>
                ))}
              </div>
              {explanationFeedback && (
                <div
                  className={`answer-feedback ${explanationSelected === "correct" ? "correct" : ""}`}
                >
                  <strong>
                    {explanationSelected === "correct"
                      ? "因果顺序正确"
                      : "换个角度再试一次"}
                  </strong>
                  <p>{explanationFeedback}</p>
                </div>
              )}
              <button
                className="start-button"
                data-guide-target="explanation-submit"
                disabled={!explanationSelected}
                onClick={submitExplanation}
              >
                提交解释
              </button>
              <small className="attempt-note">已尝试 {explanationAttempts} 次</small>
            </>
          )}

          {phase === "transfer" && (
            <>
              <span className="guide-kicker">第5步 · 迁移</span>
              <h2>把规律带到生活中</h2>
              <div className="dialog-step-guide">
                <strong>{phaseCopy.transfer.task}</strong>
                <small>{guideHoverCopy.transfer}</small>
              </div>
              <div className="transfer-task current-guide-target">
                <section className="transfer-question">
                  <span>生活情境 · 信息搜索</span>
                  <h3>如果想看到更多不同的信息，应该怎么做？</h3>
                  <div className="compact-options" data-guide-target="transfer-answer">
                    {[
                      ["right", "主动搜索不同关键词，查看不同来源，并管理推荐偏好"],
                      ["wrong-a", "一直只点最相似的第一条内容"],
                      ["wrong-b", "什么都不做，等所有推荐自动变得完全不同"],
                    ].map(([value, text]) => (
                      <button
                        key={value}
                        className={lifeAnswer === value ? "selected" : ""}
                        onClick={() => {
                          setLifeAnswer(value);
                          completeGuide("transfer-question");
                        }}
                      >
                        {text}
                      </button>
                    ))}
                  </div>
                  {lifeAnswer && (
                    <p
                      className={
                        lifeAnswer === "right" ? "correct" : "incorrect"
                      }
                    >
                      {lifeAnswer === "right"
                        ? "对，主动搜索、换来源和管理偏好，都能增加不同信息出现的机会。"
                        : "这种做法可能让相似内容继续靠前，再试试更主动的办法。"}
                    </p>
                  )}
                </section>
                <button
                  className="start-button"
                  disabled={!lifeAnswer}
                  onClick={completeTransfer}
                >
                  查看学习结论
                </button>
              </div>
            </>
          )}

          {phase === "complete" && (
            <>
              <span className="guide-kicker">本轮学习完成</span>
              <h2>你已经走完五步实验</h2>
              <div className="conclusion-list">
                <p><i>便利</i>推荐可以帮助我们更快找到感兴趣的内容。</p>
                <p><i>风险</i>连续选择同一类内容，可能让看到的内容越来越单一。</p>
                <p><i>行动</i>主动搜索、查看不同来源和管理偏好，可以让信息环境更多元。</p>
              </div>
              <div className="feedback-loop-copy">
                你点了什么，会影响系统下一次推荐什么；系统推荐的新内容，又会影响你接下来想点什么。这样一圈一圈重复，就形成了反馈循环。
              </div>
              <button
                className="start-button"
                data-guide-target="enter-free"
                onClick={() => resetForFreeMode()}
              >
                重置数据，开始自由实验
              </button>
            </>
          )}
        </ModalShell>
      )}
      <LearningGuide
        step={activeGuide}
        onSkip={skipGuide}
      />
    </main>
  );
}
