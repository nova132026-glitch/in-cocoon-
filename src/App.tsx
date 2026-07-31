
import { PointerEvent, useMemo, useRef, useState } from "react";
import contentCards from "./data/content_cards.json";

type ThemeKey = "art" | "tech" | "sport" | "nature" | "history";
type InterestMap = Record<ThemeKey, number>;
type Behavior = "like" | "stay" | "next" | "reject";

type RawCard = {
  id: string;
  topic: string;
  title: string;
  summary: string;
  tags: string[];
  hot: number;
  sourceStatus: string;
};

type ContentCard = RawCard & {
  theme: ThemeKey;
  emoji: string;
  gradient: string;
  video?: string;
};

type ExperimentLog = {
  id: number;
  action: string;
  text: string;
  metric: string;
};

const themeKeys: Record<string, ThemeKey> = {
  艺术: "art",
  科技: "tech",
  运动: "sport",
  自然: "nature",
  历史: "history",
};

const themes: {
  key: ThemeKey;
  name: string;
  icon: string;
  color: string;
  soft: string;
  gradients: string[];
}[] = [
  {
    key: "art",
    name: "艺术",
    icon: "✦",
    color: "#ff806b",
    soft: "#ffe0da",
    gradients: [
      "linear-gradient(145deg, #ff8f70, #f6c777 52%, #7a85e6)",
      "linear-gradient(145deg, #3b4e86, #ab7fa0 52%, #f0c8aa)",
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
    key: "sport",
    name: "运动",
    icon: "●",
    color: "#f4ad42",
    soft: "#ffebc9",
    gradients: [
      "linear-gradient(145deg, #e57a3d, #f5b448 55%, #fff0b7)",
      "linear-gradient(145deg, #f09c3d, #ffd070 48%, #77cfa9)",
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
];

const contents: ContentCard[] = (contentCards as RawCard[]).map((card) => {
  const theme = themes.find((item) => item.key === themeKeys[card.topic]) ?? themes[0];
  const sequence = Number(card.id.split("-")[1] ?? 1);
  return {
    ...card,
    theme: theme.key,
    emoji: theme.icon,
    gradient: theme.gradients[(sequence - 1) % theme.gradients.length],
    video: card.id === "art-04" ? "/videos/piano.mp4" : undefined,
  };
});

const initialInterests: InterestMap = {
  art: 1,
  tech: 1,
  sport: 1,
  nature: 1,
  history: 1,
};

const initialEvidence: InterestMap = {
  art: 0,
  tech: 0,
  sport: 0,
  nature: 0,
  history: 0,
};

const stageCopy = [
  ["开放视野", "五类内容都有机会被看见"],
  ["玻璃出现", "重复选择正在留下第一道边界"],
  ["视野收窄", "同类内容聚在一起，其他主题被推远"],
  ["信息茧房", "玻璃闭合，单一主题占主要视野"],
] as const;

const behaviorRules: Record<
  Behavior,
  { amount: number; label: string; evidence: number }
> = {
  like: { amount: 3, label: "喜欢", evidence: 1 },
  stay: { amount: 1, label: "继续观看", evidence: 0.5 },
  next: { amount: -1, label: "看下一条", evidence: -0.25 },
  reject: { amount: -4, label: "快速划走", evidence: -1.5 },
};

function scoreCard(
  card: ContentCard,
  topicInterests: InterestMap,
  tagInterests: Record<string, number>,
) {
  const tagScore = card.tags.reduce((sum, tag, index) => {
    const weight = index === 0 ? 0.72 : 0.28 / Math.max(1, card.tags.length - 1);
    return sum + (tagInterests[tag] ?? 0) * weight;
  }, 0);
  return topicInterests[card.theme] * 0.72 + tagScore * 0.2 + card.hot / 100;
}

export default function Home() {
  const initialIndex = Math.max(
    0,
    contents.findIndex((card) => card.id === "art-04"),
  );
  const [interests, setInterests] = useState<InterestMap>(initialInterests);
  const [tagInterests, setTagInterests] = useState<Record<string, number>>({});
  const [evidence, setEvidence] = useState<InterestMap>(initialEvidence);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [seenIds, setSeenIds] = useState<string[]>([contents[initialIndex].id]);
  const [actionCount, setActionCount] = useState(0);
  const [narration, setNarration] = useState(
    "先看视频标签：内容进入推荐系统前，就已经带着可以计算的特征。",
  );
  const [narrationMetric, setNarrationMetric] = useState("实验一｜内容怎样被 AI 表示");
  const [logs, setLogs] = useState<ExperimentLog[]>([]);
  const [dropTheme, setDropTheme] = useState<ThemeKey | null>(null);
  const [showGuide, setShowGuide] = useState(true);
  const [showManage, setShowManage] = useState(false);
  const [showReflection, setShowReflection] = useState(false);
  const [reflectionAnswer, setReflectionAnswer] = useState<string | null>(null);
  const [blockedThemes, setBlockedThemes] = useState<ThemeKey[]>([]);
  const [hasIntervened, setHasIntervened] = useState(false);
  const [isBreaking, setIsBreaking] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const pointerStart = useRef({ x: 0, time: 0 });
  const logId = useRef(0);
  const current = contents[currentIndex];

  const total = Object.values(interests).reduce((sum, value) => sum + value, 0);
  const dominant = themes.reduce((best, item) =>
    interests[item.key] > interests[best.key] ? item : best,
  );
  const dominantIndex = themes.findIndex((theme) => theme.key === dominant.key);
  const dominance = interests[dominant.key] / total;
  const dominantEvidence = evidence[dominant.key];
  const cocoonProgress = Math.max(
    0,
    Math.min(100, ((dominantEvidence - 2) / 4) * 100),
  );
  const cocoonLevel =
    cocoonProgress === 0
      ? 0
      : cocoonProgress < 38
        ? 1
        : cocoonProgress < 88
          ? 2
          : 3;
  const diversity = Math.max(
    10,
    Math.round((1 - Math.max(0, dominance - 0.2) / 0.8) * 100),
  );

  const recommendationQueue = useMemo(() => {
    const eligible = contents
      .map((item, index) => ({
        ...item,
        index,
        score: scoreCard(item, interests, tagInterests),
        isExplore: false,
      }))
      .filter(
        (item) =>
          item.index !== currentIndex && !blockedThemes.includes(item.theme),
      )
      .sort((a, b) => b.score - a.score || b.hot - a.hot);

    if (hasIntervened) {
      const byTheme: typeof eligible = [];
      const orderedThemes = themes
        .filter((theme) => !blockedThemes.includes(theme.key))
        .sort((a, b) => interests[b.key] - interests[a.key]);
      for (const theme of orderedThemes.slice(0, 4)) {
        const candidate = eligible.find(
          (item) =>
            item.theme === theme.key &&
            !byTheme.some((picked) => picked.id === item.id),
        );
        if (candidate) byTheme.push({ ...candidate, isExplore: theme.key !== dominant.key });
      }
      const extras = eligible.filter(
        (item) => !byTheme.some((picked) => picked.id === item.id),
      );
      return [...byTheme, ...extras].slice(0, 4);
    }

    const personalized = eligible.slice(0, 4);
    const exploreThemes = themes
      .filter(
        (theme) =>
          theme.key !== dominant.key && !blockedThemes.includes(theme.key),
      )
      .sort((a, b) => interests[a.key] - interests[b.key]);
    const exploreCards = exploreThemes
      .map((theme) =>
        eligible.find(
          (item) =>
            item.theme === theme.key &&
            !personalized.some((picked) => picked.id === item.id),
        ),
      )
      .filter((item): item is (typeof eligible)[number] => Boolean(item))
      .slice(0, 2)
      .map((item) => ({ ...item, isExplore: true }));
    return [...personalized, ...exploreCards].slice(0, 4);
  }, [
    blockedThemes,
    currentIndex,
    dominant.key,
    hasIntervened,
    interests,
    tagInterests,
  ]);

  const visibleThemeCount = new Set(
    recommendationQueue.map((item) => item.theme),
  ).size;
  const challengeComplete = hasIntervened && visibleThemeCount >= 4;

  function addLog(action: string, text: string, metric: string) {
    logId.current += 1;
    const entry = { id: logId.current, action, text, metric };
    setNarration(text);
    setNarrationMetric(metric);
    setLogs((previous) => [entry, ...previous].slice(0, 4));
  }

  function chooseNext(
    nextInterests: InterestMap,
    nextTags: Record<string, number>,
    nextBlocked: ThemeKey[] = blockedThemes,
    forceExplore = false,
  ) {
    const recent = new Set(seenIds.slice(-5));
    let candidates = contents
      .map((item, index) => ({
        item,
        index,
        score: scoreCard(item, nextInterests, nextTags),
      }))
      .filter(
        ({ item, index }) =>
          index !== currentIndex &&
          !nextBlocked.includes(item.theme) &&
          !recent.has(item.id),
      );
    if (candidates.length === 0) {
      candidates = contents
        .map((item, index) => ({
          item,
          index,
          score: scoreCard(item, nextInterests, nextTags),
        }))
        .filter(
          ({ item, index }) =>
            index !== currentIndex && !nextBlocked.includes(item.theme),
        );
    }

    if (forceExplore || (actionCount + 1) % 5 === 0) {
      const lowTheme = themes
        .filter((theme) => !nextBlocked.includes(theme.key))
        .sort((a, b) => nextInterests[a.key] - nextInterests[b.key])[0];
      const exploratory = candidates
        .filter(({ item }) => item.theme === lowTheme.key)
        .sort((a, b) => b.item.hot - a.item.hot)[0];
      if (exploratory) return exploratory.index;
    }

    return candidates.sort((a, b) => b.score - a.score)[0]?.index ?? initialIndex;
  }

  function applySignal(kind: Behavior) {
    const rule = behaviorRules[kind];
    const previousShare = Math.round((interests[current.theme] / total) * 100);
    const nextInterests = {
      ...interests,
      [current.theme]: Math.max(0.25, interests[current.theme] + rule.amount),
    };
    const nextTags = { ...tagInterests };
    current.tags.forEach((tag, index) => {
      const tagWeight =
        index === 0 ? 0.72 : 0.28 / Math.max(1, current.tags.length - 1);
      nextTags[tag] = Math.max(
        0,
        (nextTags[tag] ?? 0) + rule.amount * tagWeight,
      );
    });
    const nextEvidence = {
      ...evidence,
      [current.theme]: Math.max(
        0,
        evidence[current.theme] + rule.evidence,
      ),
    };
    const nextTotal = Object.values(nextInterests).reduce(
      (sum, value) => sum + value,
      0,
    );
    const nextShare = Math.round(
      (nextInterests[current.theme] / nextTotal) * 100,
    );

    let message = "";
    if (kind === "like") {
      message = `你点赞了“${current.title}”，系统把“${current.topic}”理解为明确兴趣。`;
      setDropTheme(current.theme);
      window.setTimeout(() => setDropTheme(null), 900);
    } else if (kind === "stay") {
      message = `你继续观看了这条内容，“${current.topic}”获得一次温和加分。`;
    } else if (kind === "next") {
      message = `你正常切换到下一条，系统稍微降低了“${current.topic}”的排序。`;
    } else {
      message = `你在1秒内快速划走，系统把它理解为明确的不感兴趣。`;
    }

    setInterests(nextInterests);
    setTagInterests(nextTags);
    setEvidence(nextEvidence);
    setActionCount((count) => count + 1);
    if (kind === "like" || kind === "stay") setIsBreaking(false);
    addLog(
      rule.label,
      message,
      `${current.topic}占比 ${previousShare}% → ${nextShare}%｜行为权重 ${rule.amount > 0 ? "+" : ""}${rule.amount}`,
    );

    const nextIndex = chooseNext(nextInterests, nextTags);
    setCurrentIndex(nextIndex);
    setSeenIds((previous) => [...previous, contents[nextIndex].id].slice(-12));
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (isLeaving) return;
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
    if (isLeaving) return;
    setIsDragging(false);
    setIsLeaving(true);
    setDragX(-620);
    window.setTimeout(() => {
      applySignal(kind);
      setIsLeaving(false);
      setDragX(0);
    }, 360);
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!isDragging || isLeaving) return;
    const elapsed = event.timeStamp - pointerStart.current.time;
    const distance = pointerStart.current.x - event.clientX;
    setIsDragging(false);
    if (distance >= 46) {
      animateAway(elapsed <= 1000 ? "reject" : "next");
    } else {
      setDragX(0);
    }
  }

  function handlePointerCancel() {
    if (isLeaving) return;
    setIsDragging(false);
    setDragX(0);
  }

  function explore() {
    const ordered = themes
      .filter((theme) => !blockedThemes.includes(theme.key))
      .map((theme) => ({ key: theme.key, value: interests[theme.key] }))
      .sort((a, b) => a.value - b.value);
    const nextInterests = { ...interests };
    nextInterests[dominant.key] = Math.max(
      1,
      nextInterests[dominant.key] - 3,
    );
    for (const item of ordered.slice(0, 3)) nextInterests[item.key] += 2;
    const nextEvidence = {
      ...evidence,
      [dominant.key]: Math.max(0, evidence[dominant.key] - 2.5),
    };
    setInterests(nextInterests);
    setEvidence(nextEvidence);
    setHasIntervened(true);
    setIsBreaking(true);
    const nextIndex = chooseNext(
      nextInterests,
      tagInterests,
      blockedThemes,
      true,
    );
    setCurrentIndex(nextIndex);
    setSeenIds((previous) => [...previous, contents[nextIndex].id].slice(-12));
    addLog(
      "主动探索",
      "你主动打开了陌生主题：玻璃先裂开并向两侧松动，其他内容正在重新流入。",
      "三个低权重主题获得探索补偿 +2",
    );
    window.setTimeout(() => setShowReflection(true), 1050);
  }

  function toggleBlock(theme: ThemeKey) {
    const isBlocked = blockedThemes.includes(theme);
    const nextBlocked = isBlocked
      ? blockedThemes.filter((item) => item !== theme)
      : [...blockedThemes, theme];
    setBlockedThemes(nextBlocked);
    setHasIntervened(true);
    if (!isBlocked) setIsBreaking(true);

    if (isBlocked) {
      addLog(
        "恢复主题",
        `你恢复了“${themes.find((item) => item.key === theme)?.name}”主题，它可以重新参与推荐。`,
        "管理偏好｜恢复推荐资格",
      );
    } else {
      const nextInterests = {
        ...interests,
        [theme]: 0.25,
      };
      const nextEvidence = { ...evidence, [theme]: 0 };
      setInterests(nextInterests);
      setEvidence(nextEvidence);
      addLog(
        "管理偏好",
        `你主动减少了“${themes.find((item) => item.key === theme)?.name}”推荐，系统立即修改了画像。`,
        "管理偏好｜该主题退出普通推荐",
      );
      if (current.theme === theme) {
        const nextIndex = chooseNext(
          nextInterests,
          tagInterests,
          nextBlocked,
          true,
        );
        setCurrentIndex(nextIndex);
      }
    }
  }

  function reset() {
    setInterests(initialInterests);
    setTagInterests({});
    setEvidence(initialEvidence);
    setCurrentIndex(initialIndex);
    setSeenIds([contents[initialIndex].id]);
    setActionCount(0);
    setNarration(
      "实验已重置。先观察视频标签，再决定你要留下什么行为信号。",
    );
    setNarrationMetric("五个主题重新获得平等机会");
    setLogs([]);
    setBlockedThemes([]);
    setHasIntervened(false);
    setIsBreaking(false);
    setReflectionAnswer(null);
  }

  const currentTagWeights = current.tags.map((tag, index) => ({
    tag,
    weight:
      index === 0 ? 0.72 : 0.28 / Math.max(1, current.tags.length - 1),
  }));

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#experiment" aria-label="返回实验首页">
          <span className="brand-mark">茧</span>
          <span>
            <strong>破茧</strong>
            <small>推荐算法互动实验室</small>
          </span>
        </a>
        <div className="headline">
          <span className="eyebrow">AI 入门 · 互动实验</span>
          <h1>看看你的每一次选择，怎样慢慢改变你看到的世界</h1>
        </div>
        <div className="top-actions">
          <span className="simulation-badge">教学用简化模拟</span>
          <button className="icon-button" onClick={() => setShowGuide(true)}>
            使用说明
          </button>
        </div>
      </header>

      <section id="experiment" className="lab-grid">
        <article className="panel feed-panel">
          <div className="panel-heading">
            <div>
              <span className="step-number">01</span>
              <h2>内容是怎么进来的</h2>
            </div>
            <span className="live-pill"><i /> 100条内容</span>
          </div>

          <div
            className={`video-card ${isDragging ? "dragging" : ""} ${isLeaving ? "leaving" : ""}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
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
              <div className="poster-visual" aria-label={`${current.title}示意画面`}>
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
              <span className="creator">{current.id}</span>
              <h3>{current.title}</h3>
              <p>{current.summary}</p>
            </div>
            <div className="swipe-hint">
              <span>←</span> 慢划是换下一条，1秒内快划是不感兴趣
            </div>
            <div
              className="swipe-feedback"
              style={{ opacity: Math.min(1, Math.max(0, -dragX - 18) / 90) }}
            >
              <span>×</span>
              <strong>不感兴趣</strong>
              <small>快速划走会写入强负反馈</small>
            </div>
          </div>

          <div className="choice-grid four-actions">
            <button
              className="choice-button next"
              onClick={() => animateAway("next")}
              disabled={isLeaving}
            >
              <span>→</span>
              <strong>换下一条</strong>
              <small>弱负反馈 −1</small>
            </button>
            <button
              className="choice-button skip"
              onClick={() => animateAway("reject")}
              disabled={isLeaving}
            >
              <span>↤</span>
              <strong>快速划走</strong>
              <small>不感兴趣 −4</small>
            </button>
            <button className="choice-button watch" onClick={() => applySignal("stay")}>
              <span>◷</span>
              <strong>继续观看</strong>
              <small>弱兴趣 +1</small>
            </button>
            <button className="choice-button like" onClick={() => applySignal("like")}>
              <span>♥</span>
              <strong>喜欢</strong>
              <small>很感兴趣 +3</small>
            </button>
          </div>

          <div className="tag-weight-card">
            <div className="tag-weight-title">
              <span>实验一｜预设内容标签</span>
              <small>这些内容会真的参与计算</small>
            </div>
            {currentTagWeights.map(({ tag, weight }) => (
              <div className="tag-weight-row" key={tag}>
                <span>{tag}</span>
                <div><i style={{ width: `${weight * 100}%` }} /></div>
                <strong>{weight.toFixed(2)}</strong>
              </div>
            ))}
            <p>标签越相似，两条内容越可能被放进同一组推荐。</p>
          </div>
        </article>

        <article className="panel garden-panel">
          <div className="panel-heading">
            <div>
              <span className="step-number">02</span>
              <h2>看看茧房怎样一步步形成</h2>
            </div>
            <span className={`stage-badge level-${cocoonLevel}`}>
              {stageCopy[cocoonLevel][0]} · {Math.round(cocoonProgress)}%
            </span>
          </div>

          <div className={`greenhouse glass-level-${cocoonLevel}`}>
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
                  isBreaking
                    ? 0.88
                    : cocoonProgress === 0
                    ? 0
                    : 0.12 + (cocoonProgress / 100) * 0.82,
                transform: `translate(-50%, -43%) scale(${isBreaking ? 1.03 : 0.55 + (cocoonProgress / 100) * 0.48})`,
              }}
            >
              <i /><i /><i /><i /><i />
              <span className="shell-shine" />
            </div>

            <div className="garden-caption">
              <span>信息温室</span>
              <p>{stageCopy[cocoonLevel][1]}</p>
            </div>

            <div className="flower-bed">
              {themes.map((theme, index) => {
                const strength = interests[theme.key];
                const movement = cocoonProgress / 100;
                const basePosition = 12 + index * 19;
                const leftCount = dominantIndex;
                const rightCount = themes.length - dominantIndex - 1;
                let targetPosition = 50;

                if (index < dominantIndex) {
                  targetPosition =
                    leftCount === 1
                      ? 11
                      : 5 + (index / Math.max(1, leftCount - 1)) * 25;
                } else if (index > dominantIndex) {
                  const order = index - dominantIndex - 1;
                  targetPosition =
                    rightCount === 1
                      ? 89
                      : 70 + (order / Math.max(1, rightCount - 1)) * 25;
                }

                const position =
                  basePosition + (targetPosition - basePosition) * movement;
                const baseScale = Math.min(1.22, 0.72 + strength / 10);
                const scale =
                  index === dominantIndex
                    ? Math.min(1.68, baseScale * (1 + movement * 0.48))
                    : Math.max(0.58, baseScale * (1 - movement * 0.28));

                return (
                  <div
                    className={`flower-plant ${dominant.key === theme.key ? "dominant" : "pushed"}`}
                    key={theme.key}
                    style={{
                      left: `${position}%`,
                      "--plant-scale": scale,
                      "--plant-opacity":
                        index === dominantIndex
                          ? 1
                          : Math.max(0.42, 1 - movement * 0.55),
                      zIndex: index === dominantIndex ? 12 : 4,
                    } as React.CSSProperties}
                  >
                    {dropTheme === theme.key && (
                      <span className="water-drop" key={actionCount}>●</span>
                    )}
                    <div
                      className="flower-head"
                      style={{ "--flower": theme.color } as React.CSSProperties}
                    >
                      <i /><i /><i /><i /><i /><b>{theme.icon}</b>
                    </div>
                    <span className="stem" />
                    <span className="leaf leaf-left" />
                    <span className="leaf leaf-right" />
                    <strong>{theme.name}</strong>
                  </div>
                );
              })}
            </div>

            <div className="soil"><span /><span /><span /><span /></div>

            <div className="cocoon-meter">
              <div className="meter-label">
                <span>同类偏好证据：{dominantEvidence.toFixed(1)} / 6</span>
                <strong>{Math.round(cocoonProgress)}%</strong>
              </div>
              <div className="meter-track">
                <i style={{ width: `${Math.max(3, cocoonProgress)}%` }} />
              </div>
              <small>前2次只让花生长，第3次才出现第一道玻璃。</small>
            </div>
          </div>

          <div className="recommendation-flow">
            <div className="flow-head">
              <div>
                <span>重新排序后的推荐列表</span>
                <small>主要推你喜欢的，偶尔也放一点别的内容</small>
              </div>
              <span className="flow-arrow">你的喜好 + 内容标签 + 探索机会 → 排序</span>
            </div>
            <div className="mini-card-row six-cards">
              {recommendationQueue.map((item, rank) => (
                <button
                  key={`${item.id}-${rank}`}
                  className={rank === 0 ? "mini-card first" : "mini-card"}
                  onClick={() => {
                    setCurrentIndex(item.index);
                    setSeenIds((previous) => [...previous, item.id].slice(-12));
                  }}
                >
                  <span className="mini-thumb" style={{ background: item.gradient }}>{item.emoji}</span>
                  <span>
                    <small>{item.isExplore ? "探索内容" : `推荐位 ${rank + 1}`}</small>
                    <strong>{item.title}</strong>
                    <em>#{item.topic}</em>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </article>

        <aside className="panel explain-panel">
          <div className="panel-heading">
            <div>
              <span className="step-number">03</span>
              <h2>AI 正在怎么理解你</h2>
            </div>
          </div>

          <div className="why-card active-explanation">
            <div className="why-title">
              <span className="spark">✦</span>
              <div>
                <small>实验二｜刚刚发生了什么</small>
                <strong>{narration}</strong>
              </div>
            </div>
            <div className="logic-chain">
              <span>内容标签</span><i>→</i>
              <span>行为强度</span><i>→</i>
              <span>兴趣画像</span><i>→</i>
              <span>重新排序</span>
            </div>
            <p>
              当前内容的主要标签是 <b>#{current.tags[0]} 0.72</b>。行为越明确，这个标签对画像的影响越大。
            </p>
          </div>

          <div className="profile-card">
            <div className="card-title">
              <span>实时兴趣画像</span>
              <small>不是你的真实身份，只是一次实验分数</small>
            </div>
            <div className="profile-bars">
              {themes.map((theme) => {
                const max = Math.max(...Object.values(interests));
                return (
                  <div className="profile-row" key={theme.key}>
                    <span className="profile-name">
                      <i style={{ background: theme.color }} />{theme.name}
                    </span>
                    <div className="bar-track">
                      <i
                        style={{
                          width: `${Math.max(7, interests[theme.key] / max * 100)}%`,
                          background: theme.color,
                        }}
                      />
                    </div>
                    <strong>{interests[theme.key].toFixed(1)}</strong>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="diversity-card">
            <div
              className="diversity-ring"
              style={{ "--score": `${diversity * 3.6}deg` } as React.CSSProperties}
            >
              <div><strong>{diversity}</strong><small>多样性</small></div>
            </div>
            <div>
              <span>当前推荐流含 {visibleThemeCount} 类主题</span>
              <strong>
                {diversity > 75
                  ? "视野比较开阔"
                  : diversity > 48
                    ? "视野正在收窄"
                    : "需要主动破茧"}
              </strong>
              <p>推荐让寻找内容更方便，也可能让不同主题逐渐消失。</p>
            </div>
          </div>

          <div className="challenge-card">
            <span className="challenge-label">破茧挑战</span>
            <h3>
              {challengeComplete
                ? "推荐流已恢复至少4类主题"
                : "让至少4类主题重新出现"}
            </h3>
            <p>
              使用探索或管理偏好，主动改变算法对你的判断。
            </p>
            <div className="challenge-actions">
              <button onClick={explore}>
                <span>↗</span>
                探索新主题
                <small>增加陌生内容出现机会</small>
              </button>
              <button onClick={() => setShowManage(true)}>
                <span>⌘</span>
                管理偏好
                <small>直接修改你的喜好账本</small>
              </button>
            </div>
            {challengeComplete && (
              <button
                className="reflection-trigger"
                onClick={() => setShowReflection(true)}
              >
                回答反思题，完成实验 →
              </button>
            )}
          </div>

        </aside>

        <section className="experiment-narrator" aria-live="polite">
          <div className="narrator-main">
            <span className="narrator-icon">⌁</span>
            <div>
              <small>AI 实验解说 · 每次操作都会留下说明</small>
              <strong>{narration}</strong>
              <p>{narrationMetric}</p>
            </div>
          </div>
          <div className="log-list">
            {logs.length === 0 ? (
              <div className="log-empty">完成第一次操作后，这里会保留最近的实验记录。</div>
            ) : (
              logs.slice(0, 3).map((log) => (
                <div className="log-item" key={log.id}>
                  <span>{log.action}</span>
                  <p>{log.text}</p>
                  <small>{log.metric}</small>
                </div>
              ))
            )}
          </div>
        </section>
      </section>

      <footer className="bottom-bar">
        <div className="lesson-route">
          <span className="active"><i>1</i> 看懂标签</span><b />
          <span className={actionCount >= 1 ? "active" : ""}><i>2</i> 留下信号</span><b />
          <span className={cocoonProgress > 0 ? "active" : ""}><i>3</i> 编织茧房</span><b />
          <span className={challengeComplete ? "active" : ""}><i>4</i> 主动破茧</span><b />
          <span className={reflectionAnswer ? "active" : ""}><i>5</i> 完成反思</span>
        </div>
        <div className="bottom-actions">
          <span>已记录 {actionCount} 次选择</span>
          <button onClick={reset}>↻ 重新实验</button>
        </div>
      </footer>

      {showGuide && (
        <div className="guide-backdrop" role="dialog" aria-modal="true" aria-label="实验使用说明">
          <div className="guide-card">
            <button className="guide-close" onClick={() => setShowGuide(false)} aria-label="关闭说明">×</button>
            <span className="guide-kicker">60秒互动实验</span>
            <h2>为什么短视频越刷越像？</h2>
            <p className="guide-intro">
              推荐算法会把内容标签和你的行为组合起来，猜测你想看什么。亲手做几次选择，看看一座信息茧房怎样被逐次编织。
            </p>
            <div className="guide-steps">
              <div><i>1</i><strong>先看标签</strong><p>内容进入系统前，已经带着主题和权重。</p></div>
              <div><i>2</i><strong>连续选择</strong><p>点赞、观看和划走会写入不同强度的信号。</p></div>
              <div><i>3</i><strong>观察茧房</strong><p>前两次不出现玻璃，第3次开始逐道编织。</p></div>
              <div><i>4</i><strong>主动破茧</strong><p>探索和管理偏好，让至少4类内容重新出现。</p></div>
            </div>
            <button className="start-button" onClick={() => setShowGuide(false)}>
              从标签实验开始 <span>→</span>
            </button>
            <small>所有内容均为本地教学数据，本实验不会上传任何个人信息。</small>
          </div>
        </div>
      )}

      {showManage && (
        <div className="guide-backdrop" role="dialog" aria-modal="true" aria-label="管理推荐偏好">
          <div className="manage-card">
            <button className="guide-close" onClick={() => setShowManage(false)} aria-label="关闭偏好管理">×</button>
            <span className="guide-kicker">主动调整算法</span>
            <h2>管理我的推荐偏好</h2>
            <p>这不是删除真实账号数据，而是模拟”主动告诉系统少推荐某些内容”。</p>
            <div className="manage-list">
              {themes.map((theme) => {
                const blocked = blockedThemes.includes(theme.key);
                return (
                  <div key={theme.key}>
                    <span style={{ background: theme.soft, color: theme.color }}>{theme.icon}</span>
                    <div><strong>{theme.name}</strong><small>当前分数 {interests[theme.key].toFixed(1)}</small></div>
                    <button
                      className={blocked ? "restore" : ""}
                      onClick={() => toggleBlock(theme.key)}
                    >
                      {blocked ? "恢复推荐" : "减少推荐"}
                    </button>
                  </div>
                );
              })}
            </div>
            <button className="start-button" onClick={() => setShowManage(false)}>保存并返回实验</button>
          </div>
        </div>
      )}

      {showReflection && (
        <div className="guide-backdrop" role="dialog" aria-modal="true" aria-label="实验反思题">
          <div className="reflection-card">
            <button className="guide-close" onClick={() => setShowReflection(false)} aria-label="关闭反思题">×</button>
            <span className="guide-kicker">完成与反思</span>
            <h2>为什么连续喜欢同一类内容后，推荐会越来越单一？</h2>
            <div className="answer-list">
              {[
                ["A", "因为平台里的其他内容突然消失了"],
                ["B", "因为连续行为加强了你的喜好账本，新的推荐又继续强化这种行为"],
                ["C", "因为每条视频的标签都完全相同"],
              ].map(([key, text]) => (
                <button
                  key={key}
                  className={reflectionAnswer === key ? "selected" : ""}
                  onClick={() => setReflectionAnswer(key)}
                >
                  <span>{key}</span>{text}
                </button>
              ))}
            </div>
            {reflectionAnswer && (
              <div className={reflectionAnswer === "B" ? "answer-feedback correct" : "answer-feedback"}>
                <strong>{reflectionAnswer === "B" ? "回答正确" : "再想一想"}</strong>
                <p>
                  {reflectionAnswer === "B"
                    ? "算法把行为当成兴趣证据，再用推荐结果影响下一次行为，这就是不断自我加强的反馈循环。"
                    : "其他内容并没有消失，真正改变的是它们在推荐队列中的位置。观察“行为→画像→推荐→再行为”的循环。"}
                </p>
              </div>
            )}
            <button className="start-button" onClick={() => setShowReflection(false)}>
              返回实验
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
