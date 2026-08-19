import React, { useState, useMemo, useCallback, useRef } from "react";
import {
  Search, Loader2, AlertTriangle, ArrowUpDown, Download, History,
  Cloud, CloudRain, Sun, Wind, CloudSun, ExternalLink, X, SunMoon,
  Radar, Activity, ChevronRight, Tag, Users, ArrowBigUp, Layers, Info,
} from "lucide-react";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, LineChart, Line, Legend,
} from "recharts";

/* ============================================================================
   PART 1 — LIGHTWEIGHT SENTIMENT ENGINE
   No external sentiment package is available in this sandbox, so this is a
   small AFINN-style lexicon + negation/intensifier handling implemented by
   hand. It is intentionally simple (word-scoring, not real NLP) — good
   enough to differentiate tone across headline-style Reddit titles, not a
   research-grade classifier.
============================================================================ */

const LEXICON = {
  // strong positive
  amazing: 3, incredible: 3, breakthrough: 3, brilliant: 3, wonderful: 3,
  fantastic: 3, awesome: 3, phenomenal: 3, historic: 2, groundbreaking: 3,
  love: 2, loves: 2, loved: 2, win: 2, wins: 2, winning: 2, won: 2,
  victory: 3, success: 2, successful: 2, celebrate: 2, celebrates: 2,
  celebration: 2, hope: 1, hopeful: 2, best: 2, better: 1, great: 2,
  good: 1, happy: 2, excited: 2, exciting: 2, joy: 2, beautiful: 2,
  masterpiece: 3, praised: 2, praise: 2, milestone: 2, achievement: 2,
  record: 1, boost: 1, boosts: 1, improve: 1, improves: 1, improved: 1,
  improvement: 1, upgrade: 1, upgrades: 1, launch: 1, launches: 1,
  innovative: 2, innovation: 2, funny: 2, hilarious: 3, fun: 1, cool: 1,
  impressive: 2, stunning: 2, epic: 2, legendary: 3, thrilled: 2,
  relief: 1, relieved: 1, safe: 1, rescued: 2, rescue: 2, recovers: 1,
  recovery: 1, gains: 1, surge: 1, surges: 1, thriving: 2, thrive: 2,
  optimistic: 2, welcome: 1, welcomed: 1, breakthrough2: 0,
  // mild positive
  nice: 1, solid: 1, promising: 1, useful: 1, helpful: 1, easy: 1,
  clean: 1, free: 1, fixed: 1, fix: 1, fixes: 1, works: 1, working: 1,
  // strong negative
  disaster: -3, tragedy: -3, tragic: -3, horrific: -3, horrible: -3,
  terrible: -3, awful: -3, catastrophe: -3, catastrophic: -3, death: -3,
  dead: -2, dies: -2, died: -2, killed: -3, killing: -3, kills: -3,
  murder: -3, murdered: -3, war: -2, attack: -2, attacked: -2,
  attacks: -2, shooting: -3, shot: -2, violence: -3, violent: -3,
  crisis: -2, scandal: -2, corruption: -2, corrupt: -2, fraud: -2,
  banned: -1, ban: -1, bans: -1, fired: -2, fires: -1, layoffs: -2,
  fail: -2, fails: -2, failed: -2, failure: -2, collapse: -2,
  collapses: -2, collapsed: -2, crash: -2, crashes: -2, crashed: -2,
  lawsuit: -1, sued: -1, sues: -1, arrested: -2, arrest: -2, illegal: -2,
  criminal: -2, crime: -2, scam: -2, scammed: -2, hacked: -2, hack: -1,
  breach: -2, leaked: -1, leak: -1, exploit: -1, vulnerability: -1,
  warns: -1, warning: -1, danger: -2, dangerous: -2, threat: -2,
  threatens: -2, fear: -2, scared: -2, sad: -2, sadness: -2, angry: -2,
  anger: -2, outrage: -2, outraged: -2, backlash: -2, controversy: -2,
  controversial: -1, criticized: -1, criticizes: -1, slams: -2, blasts: -2,
  worst: -3, bad: -1, worse: -2, hate: -2, hates: -2, hated: -2,
  broken: -1, bug: -1, bugs: -1, glitch: -1, lawsuit2: 0, sick: -1,
  disease: -2, pandemic: -2, outbreak: -2, drought: -2, famine: -3,
  poverty: -2, homeless: -2, jail: -1, prison: -1, riot: -2, riots: -2,
  protest: -1, protests: -1, drop: -1, drops: -1, dropped: -1,
  plunge: -2, plunges: -2, decline: -1, declines: -1, loses: -1,
  losing: -1, loss: -1, cuts: -1, cut: -1, abuse: -3, abused: -3,
  victim: -2, victims: -2, toxic: -2, disturbing: -2, alarming: -2,
  devastating: -3, devastated: -3, grim: -2, bleak: -2, doom: -2,
  chaos: -2, chaotic: -2,
};

const NEGATIONS = new Set([
  "not", "no", "never", "cannot", "dont", "doesnt", "didnt", "isnt",
  "wasnt", "arent", "werent", "wont", "cant", "couldnt", "wouldnt",
  "shouldnt", "without",
]);

const INTENSIFIERS = {
  very: 1.4, extremely: 1.6, incredibly: 1.6, really: 1.25, super: 1.3,
  totally: 1.3, absolutely: 1.5, utterly: 1.5,
};

const DIMINISHERS = { slightly: 0.5, somewhat: 0.6, barely: 0.4, kinda: 0.6 };

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function analyzeSentiment(text) {
  const tokens = tokenize(text);
  let score = 0;
  let pendingMultiplier = 1;
  let negateWindow = 0;

  tokens.forEach((word) => {
    if (NEGATIONS.has(word)) {
      negateWindow = 3;
      return;
    }
    if (INTENSIFIERS[word]) {
      pendingMultiplier = INTENSIFIERS[word];
      return;
    }
    if (DIMINISHERS[word]) {
      pendingMultiplier = DIMINISHERS[word];
      return;
    }
    if (LEXICON[word] !== undefined) {
      let val = LEXICON[word] * pendingMultiplier;
      if (negateWindow > 0) val = -val;
      score += val;
      pendingMultiplier = 1;
    }
    if (negateWindow > 0) negateWindow -= 1;
  });

  const wordCount = Math.max(tokens.length, 1);
  const comparative = score / wordCount;
  let sentiment = "neutral";
  if (comparative > 0.1) sentiment = "positive";
  else if (comparative < -0.1) sentiment = "negative";

  return { score: Number(score.toFixed(2)), comparative, sentiment };
}

/* ============================================================================
   PART 2 — SMALL HELPERS
============================================================================ */

const STOPWORDS = new Set([
  "this", "that", "with", "from", "have", "will", "your", "about",
  "which", "there", "their", "what", "when", "where", "been", "being",
  "into", "more", "than", "then", "they", "them", "after", "before",
  "over", "under", "just", "some", "such", "only", "also", "were",
  "http", "https", "reddit", "www", "com", "does", "doing", "would",
  "could", "should", "youre", "youve", "theyre", "cant", "dont", "here",
  "still", "even", "make", "made", "into", "like", "gets", "getting",
  "says", "said", "these", "those", "each", "much", "many", "very",
  "amp", "removed", "deleted",
]);

function moodFromValue(v) {
  if (v <= -0.3) return { label: "Stormy", color: "#DC2626", Icon: CloudRain };
  if (v <= -0.08) return { label: "Overcast", color: "#C2410C", Icon: Cloud };
  if (v <= 0.08) return { label: "Calm", color: "#B45309", Icon: Wind };
  if (v <= 0.3) return { label: "Clear", color: "#4D7C0F", Icon: CloudSun };
  return { label: "Sunny", color: "#16A34A", Icon: Sun };
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function timeAgo(unixSeconds) {
  const diffMs = Date.now() - unixSeconds * 1000;
  const hrs = diffMs / 3600000;
  if (hrs < 1) return `${Math.round(hrs * 60)}m ago`;
  if (hrs < 24) return `${Math.round(hrs)}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function downloadCSV(rows, filename) {
  const hasSub = rows.some((r) => r.sourceSub !== undefined);
  const header = hasSub
    ? ["Subreddit", "Title", "Sentiment", "Score", "Upvotes", "Author", "URL", "Created"]
    : ["Title", "Sentiment", "Score", "Upvotes", "Author", "URL", "Created"];
  const escape = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [header, ...rows.map((r) => {
    const base = [r.title, r.sentiment, r.score, r.upvotes, r.author, r.url, new Date(r.created * 1000).toISOString()];
    return hasSub ? [r.sourceSub, ...base] : base;
  })].map((row) => row.map(escape).join(",")).join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const SUGGESTED = ["technology", "gaming", "movies", "python", "worldnews", "memes"];
const SENT_COLORS = { positive: "#16A34A", neutral: "#B45309", negative: "#DC2626" };

/* ============================================================================
   PART 3 — DATA FETCHING
============================================================================ */

function buildAttemptUrl(subreddit) {
  return `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/hot.json?limit=50&raw_json=1`;
}

function parseListing(json) {
  const children = json?.data?.children;
  if (!children || children.length === 0) return [];
  return children
    .filter((c) => c.kind === "t3")
    .map((c) => {
      const d = c.data;
      const sentiment = analyzeSentiment(d.title || "");
      return {
        id: d.id,
        title: d.title,
        upvotes: d.ups ?? d.score ?? 0,
        author: d.author,
        url: `https://reddit.com${d.permalink}`,
        created: d.created_utc,
        ...sentiment,
      };
    });
}

async function fetchSubredditHot(subreddit) {
  let res;
  try {
    res = await fetch(buildAttemptUrl(subreddit));
  } catch (e) {
    throw new Error("NETWORK");
  }

  if (res.status === 429) throw new Error("RATE_LIMIT");
  if (res.status === 403) throw new Error("PRIVATE_OR_BANNED");
  if (res.status === 404) throw new Error("NOT_FOUND");
  if (!res.ok) throw new Error("UNKNOWN");

  let json;
  try {
    json = await res.json();
  } catch (e) {
    throw new Error("UNKNOWN");
  }
  const posts = parseListing(json);
  if (posts.length === 0) throw new Error("EMPTY");
  return posts;
}

const ERROR_COPY = {
  RATE_LIMIT: "Reddit is rate-limiting requests right now. Wait a moment and try again.",
  PRIVATE_OR_BANNED: "This subreddit is private, quarantined, or banned — nothing to read here.",
  NOT_FOUND: "No subreddit found by that name. Check the spelling and try again.",
  EMPTY: "This subreddit has no hot posts to analyze right now.",
  UNKNOWN: "Something went wrong fetching this subreddit. Try again.",
};

const MOCK_TOPICS = {
  technology: ["the new AI model", "the latest chip", "the startup", "the software update", "the new app", "the tech giant"],
  gaming: ["the new game", "the studio", "the big patch", "the next console", "the esports team", "the game mod"],
  movies: ["the sequel", "the director's new film", "the box office numbers", "the trailer", "the lead actor", "the studio"],
  python: ["the new release", "the popular library", "the framework update", "pip", "the tutorial", "the language spec"],
  worldnews: ["the region", "the government", "the economy", "the ongoing talks", "the local crisis", "the new policy"],
  memes: ["this meme format", "the trend", "this post", "the running joke", "the reference", "the community"],
  default: ["the community", "this update", "the project", "the announcement", "this week's event", "the change"],
};

const MOCK_TEMPLATES = {
  positive: [
    "Incredible breakthrough with {topic} just happened",
    "{topic} is absolutely amazing and here's why",
    "This is the best news about {topic} in years",
    "{topic} just achieved something historic",
    "So excited about {topic} — this is fantastic",
    "{topic} celebrates a huge win today",
    "Finally, some good news about {topic}",
    "{topic} just got a brilliant upgrade",
  ],
  neutral: [
    "What do you all think about {topic}?",
    "{topic}, explained: everything you need to know",
    "Discussion thread: {topic} this week",
    "{topic} update — here's what changed",
    "A closer look at {topic}",
    "{topic}: your questions answered",
    "Weekly megathread for {topic}",
    "{topic}, compared side by side",
  ],
  negative: [
    "{topic} is facing a major crisis",
    "This is terrible — {topic} just failed",
    "{topic} scandal leaves people furious",
    "Why {topic} has turned into a disaster",
    "{topic} under fire after major backlash",
    "Bad news: {topic} just fell apart",
    "{topic} accused of serious problems",
    "People are angry about {topic}",
  ],
};

const MOCK_AUTHORS = ["throwaway_2847", "quiet_observer", "night_owl_99", "data_junkie", "regular_lurker", "hot_take_haver", "mod_approved", "just_here_for_this", "casual_scroller", "verified_human"];

function generateMockPosts(subreddit) {
  const topics = MOCK_TOPICS[subreddit.toLowerCase()] || MOCK_TOPICS.default;
  const now = Math.floor(Date.now() / 1000);

  let hash = 0;
  for (let i = 0; i < subreddit.length; i++) hash = (hash * 31 + subreddit.charCodeAt(i)) >>> 0;
  const bias = ((hash % 100) / 100 - 0.5) * 1.6;

  const weightedTones = [];
  const positiveWeight = Math.round(3 + Math.max(0, bias) * 6);
  const negativeWeight = Math.round(3 + Math.max(0, -bias) * 6);
  const neutralWeight = 4;
  for (let i = 0; i < positiveWeight; i++) weightedTones.push("positive");
  for (let i = 0; i < neutralWeight; i++) weightedTones.push("neutral");
  for (let i = 0; i < negativeWeight; i++) weightedTones.push("negative");

  return Array.from({ length: 50 }, (_, i) => {
    const tone = weightedTones[Math.floor(Math.random() * weightedTones.length)];
    const template = MOCK_TEMPLATES[tone][Math.floor(Math.random() * MOCK_TEMPLATES[tone].length)];
    const topic = topics[Math.floor(Math.random() * topics.length)];
    const title = template.replace("{topic}", topic).replace(/^./, (c) => c.toUpperCase());
    const sentiment = analyzeSentiment(title);
    return {
      id: `mock-${i}`,
      title,
      upvotes: Math.floor(Math.pow(Math.random(), 3) * 40000) + 20,
      author: `${MOCK_AUTHORS[Math.floor(Math.random() * MOCK_AUTHORS.length)]}${Math.floor(Math.random() * 99)}`,
      url: `https://www.reddit.com/r/${subreddit}`,
      created: now - Math.floor(Math.random() * 60000),
      ...sentiment,
    };
  });
}

/* ============================================================================
   PART 4 — GAUGE (signature element)
============================================================================ */

function VibeGauge({ value, size = 220, label, sublabel }) {
  const v = clamp(value, -1, 1);
  const cx = size / 2;
  const cy = size / 2 + size * 0.06;
  const r = size * 0.4;
  const needleAngle = v * 88; // -88..88 degrees from vertical

  const polar = (angleDeg, radius) => {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  };
  const arcPath = (startDeg, endDeg, radius) => {
    const s = polar(startDeg, radius);
    const e = polar(endDeg, radius);
    const large = endDeg - startDeg <= 180 ? 0 : 1;
    return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${large} 1 ${e.x} ${e.y}`;
  };

  const zones = [
    { from: -90, to: -30, color: "#FF5D5D" },
    { from: -30, to: -8, color: "#F2994A" },
    { from: -8, to: 8, color: "#F5C453" },
    { from: 8, to: 30, color: "#7FD989" },
    { from: 30, to: 90, color: "#3DDC84" },
  ];

  const needleEnd = polar(needleAngle, r - 14);
  const mood = moodFromValue(v);

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size * 0.68} viewBox={`0 0 ${size} ${size * 0.68}`}>
        {zones.map((z, i) => (
          <path
            key={i}
            d={arcPath(z.from, z.to, r)}
            fill="none"
            stroke={z.color}
            strokeWidth={size * 0.045}
            strokeLinecap="butt"
            opacity="0.85"
          />
        ))}
        {/* tick marks */}
        {[-90, -45, 0, 45, 90].map((deg, i) => {
          const p1 = polar(deg, r + size * 0.03);
          const p2 = polar(deg, r - size * 0.015);
          return <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#6B7280" strokeWidth="1.5" />;
        })}
        {/* needle */}
        <line
          x1={cx} y1={cy} x2={needleEnd.x} y2={needleEnd.y}
          stroke={mood.color} strokeWidth={size * 0.018} strokeLinecap="round"
          style={{ transition: "all 0.9s cubic-bezier(0.34, 1.56, 0.64, 1)" }}
        />
        <circle cx={cx} cy={cy} r={size * 0.035} fill={mood.color} />
        <circle cx={cx} cy={cy} r={size * 0.018} fill="#FFFFFF" />
      </svg>
      <div className="flex items-center gap-2 mt-1">
        <mood.Icon size={20} color={mood.color} strokeWidth={2.2} />
        <span className="font-mono text-lg tracking-wide" style={{ color: mood.color }}>{mood.label}</span>
      </div>
      {label && <div className="text-xs text-slate-900 mt-0.5 font-mono">{label}</div>}
      {sublabel && <div className="text-[11px] text-slate-700 mt-0.5">{sublabel}</div>}
    </div>
  );
}

/* ============================================================================
   PART 5 — SMALL PRESENTATIONAL PIECES
============================================================================ */

function StatCard({ icon: Icon, label, value, color, sub }) {
  return (
    <div className="rounded-xl border border-slate-300 bg-white backdrop-blur-sm p-4 flex flex-col gap-1 hover:border-slate-400 transition-colors">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-widest text-slate-700 font-mono font-semibold">{label}</span>
        <Icon size={16} color={color} strokeWidth={2.4} />
      </div>
      <div className="text-2xl font-bold tabular-nums" style={{ color }}>{value}</div>
      {sub && <div className="text-[11px] text-slate-700">{sub}</div>}
    </div>
  );
}

function ChartCard({ title, children, icon: Icon }) {
  return (
    <div className="rounded-xl border border-slate-300 bg-white backdrop-blur-sm p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon size={15} className="text-amber-600" />
        <h3 className="text-xs uppercase tracking-widest text-slate-100 font-mono font-bold">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border-2 border-slate-800 shadow-lg rounded-lg px-3 py-2 text-xs">
      {label !== undefined && <div className="text-slate-900 mb-1 font-mono">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || p.fill }}>{p.name}: {p.value}</div>
      ))}
    </div>
  );
}

function SentimentPill({ sentiment }) {
  const color = SENT_COLORS[sentiment];
  return (
    <span
      className="text-[11px] px-2 py-0.5 rounded-full font-mono font-bold capitalize border"
      style={{ color, borderColor: color + "80", backgroundColor: color + "26" }}
    >
      {sentiment}
    </span>
  );
}

/* ============================================================================
   PART 6 — MAIN APP
============================================================================ */

const SECTIONS = [
  { id: "overview", label: "Overview", icon: Radar },
  { id: "charts", label: "Charts", icon: Activity },
  { id: "trends", label: "Trending Words", icon: Tag },
  { id: "table", label: "Post Table", icon: Layers },
];

export default function SubredditVibeCheck() {
  const [inputValue, setInputValue] = useState("");
  const [theme, setTheme] = useState(() => (typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? 'dark' : 'light'));
  const [headerCompact, setHeaderCompact] = useState(() => {
    try { return localStorage.getItem('vibe-header-compact') === '1'; } catch (e) { return false; }
  });
  const [subreddit, setSubreddit] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [compareOn, setCompareOn] = useState(false);
  const [inputValue2, setInputValue2] = useState("");
  const [subreddit2, setSubreddit2] = useState(null);
  const [posts2, setPosts2] = useState([]);
  const [loading2, setLoading2] = useState(false);
  const [error2, setError2] = useState(null);

  const [history, setHistory] = useState([]);
  const [isMock, setIsMock] = useState(false);
  const [isMock2, setIsMock2] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: "upvotes", dir: "desc" });
  const [filterSentiment, setFilterSentiment] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeSection, setActiveSection] = useState("overview");
  const sectionRefs = useRef({});

  const runFetch = useCallback(async (name, slot) => {
    const clean = name.trim().replace(/^\/?(r\/)??/i, "");
    if (!clean || !/^[a-zA-Z0-9_]{2,21}$/.test(clean)) {
      const msg = "Enter a valid subreddit name — letters, numbers, and underscores only.";
      if (slot === 1) setError(msg); else setError2(msg);
      return;
    }
    if (slot === 1) { setLoading(true); setError(null); }
    else { setLoading2(true); setError2(null); }

    try {
      const result = await fetchSubredditHot(clean);
      if (slot === 1) {
        setPosts(result);
        setSubreddit(clean);
        setIsMock(false);
        setHistory((h) => [clean, ...h.filter((x) => x !== clean)].slice(0, 6));
      } else {
        setPosts2(result);
        setSubreddit2(clean);
        setIsMock2(false);
      }
    } catch (e) {
      if (e.message === "NETWORK") {
        const sample = generateMockPosts(clean);
        if (slot === 1) {
          setPosts(sample);
          setSubreddit(clean);
          setIsMock(true);
          setError(null);
          setHistory((h) => [clean, ...h.filter((x) => x !== clean)].slice(0, 6));
        } else {
          setPosts2(sample);
          setSubreddit2(clean);
          setIsMock2(true);
          setError2(null);
        }
      } else {
        const msg = ERROR_COPY[e.message] || ERROR_COPY.UNKNOWN;
        if (slot === 1) { setError(msg); setPosts([]); setSubreddit(null); }
        else { setError2(msg); setPosts2([]); setSubreddit2(null); }
      }
    } finally {
      if (slot === 1) setLoading(false); else setLoading2(false);
    }
  }, []);

  // theme toggle effect
  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [theme]);

  React.useEffect(() => {
    try { localStorage.setItem('vibe-header-compact', headerCompact ? '1' : '0'); } catch (e) {}
  }, [headerCompact]);

  const isComparing = compareOn && !!subreddit2 && posts2.length > 0;
  const SUB_COLORS = { a: "#1D4ED8", b: "#EA580C" };

  const stats = useMemo(() => computeStats(posts), [posts]);
  const stats2 = useMemo(() => computeStats(posts2), [posts2]);

  const trendingWords = useMemo(() => computeTrending(posts), [posts]);
  const trendingWords2 = useMemo(() => computeTrending(posts2), [posts2]);

  const groupedBarData = useMemo(() => {
    if (!isComparing) return null;
    return ["positive", "neutral", "negative"].map((key) => ({
      name: key.charAt(0).toUpperCase() + key.slice(1),
      [subreddit]: stats[key],
      [subreddit2]: stats2[key],
    }));
  }, [isComparing, subreddit, subreddit2, stats, stats2]);

  const combinedLineData = useMemo(() => {
    if (!isComparing) return null;
    const len = Math.max(posts.length, posts2.length);
    return Array.from({ length: len }, (_, i) => ({
      index: i + 1,
      [subreddit]: posts[i]?.score,
      [subreddit2]: posts2[i]?.score,
    }));
  }, [isComparing, subreddit, subreddit2, posts, posts2]);

  const tableRows = useMemo(() => {
    if (isComparing) {
      return [
        ...posts.map((p) => ({ ...p, sourceSub: subreddit })),
        ...posts2.map((p) => ({ ...p, sourceSub: subreddit2 })),
      ];
    }
    return posts.map((p) => ({ ...p, sourceSub: subreddit }));
  }, [isComparing, posts, posts2, subreddit, subreddit2]);

  const filteredSorted = useMemo(() => {
    let rows = tableRows;
    if (filterSentiment !== "all") rows = rows.filter((p) => p.sentiment === filterSentiment);
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      rows = rows.filter((p) => p.title.toLowerCase().includes(q) || p.author.toLowerCase().includes(q));
    }
    const { key, dir } = sortConfig;
    const sorted = [...rows].sort((a, b) => {
      let av = a[key], bv = b[key];
      if (typeof av === "string") { av = av.toLowerCase(); bv = bv.toLowerCase(); }
      if (av < bv) return dir === "asc" ? -1 : 1;
      if (av > bv) return dir === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [tableRows, filterSentiment, searchTerm, sortConfig]);

  const toggleSort = (key) => {
    setSortConfig((prev) => prev.key === key
      ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
      : { key, dir: "desc" });
  };

  const scrollTo = (id) => {
    setActiveSection(id);
    sectionRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen app-bg text-slate-900" style={{ fontFamily: "'IBM Plex Sans', ui-sans-serif, system-ui" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        .font-mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: #FFFFFF; }
        ::-webkit-scrollbar-thumb { background: #94A3B8; border-radius: 4px; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px);} to { opacity:1; transform:translateY(0);} }
        .fade-up { animation: fadeUp 0.4s ease-out both; }
      `}</style>

      {/* ================= HEADER ================= */}
      <header className={`sticky top-0 z-30 border-b bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm ${headerCompact ? 'shadow-sm' : ''}`}>
        <div className={`max-w-[1400px] mx-auto px-3 md:px-6 ${headerCompact ? 'py-1' : 'py-2'} flex items-center justify-between gap-3`}>
          <div className="flex items-center gap-2.5">
            <div className={`${headerCompact ? 'w-7 h-7' : 'w-8 h-8'} rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center`}>
              <Radar size={headerCompact ? 15 : 17} className="text-slate-950" strokeWidth={2.5} />
            </div>
            <div>
              <div className={`${headerCompact ? 'text-sm' : 'text-base'} font-bold tracking-tight leading-none text-black dark:text-white`}>Subreddit Vibe Check</div>
              {!headerCompact && (
                <div className="text-[10px] text-slate-700 dark:text-slate-300 font-mono leading-none mt-1">emotional weather station</div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setHeaderCompact((c) => !c)}
              className="btn-secondary"
              title="Toggle compact header"
            >
              {headerCompact ? '▢' : '▤'}
            </button>
            <button
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              className="btn-secondary"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? '🌙' : '☀️'}
            </button>
            {subreddit && (
              <div className={`hidden md:flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded-full border
                ${isMock ? "border-amber-500/40 text-amber-700" : "border-slate-300 text-slate-700"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isMock ? "bg-amber-500" : "bg-emerald-600 animate-pulse"}`} />
                {isMock ? `sample data for r/${subreddit}` : `reading r/${subreddit}`}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto flex">
        {/* ================= SIDEBAR ================= */}
        <aside className="sidebar hidden lg:flex flex-col w-56 shrink-0 border-r border-white/10 min-h-[calc(100vh-57px)] px-3 py-6 gap-1 sticky top-[57px] self-start">
          {SECTIONS.map((s) => (
              <button
              key={s.id}
              onClick={() => scrollTo(s.id)}
              disabled={!subreddit}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left disabled:opacity-30 disabled:cursor-not-allowed
                ${activeSection === s.id ? "bg-amber-600 text-white font-bold" : "text-slate-100 font-semibold hover:text-white/95 hover:bg-white/10"}`}
            >
              <s.icon size={15} />
              {s.label}
            </button>
          ))}

          {history.length > 0 && (
              <div className="mt-6">
              <div className="flex items-center gap-1.5 px-3 text-[10px] uppercase tracking-widest text-slate-200 font-mono mb-2">
                <History size={12} /> Recent scans
              </div>
              <div className="flex flex-col gap-0.5">
                {history.map((h) => (
                  <button
                    key={h}
                    onClick={() => { setInputValue(h); runFetch(h, 1); }}
                    className="text-left px-3 py-1.5 rounded-lg text-xs text-slate-200 font-semibold hover:text-white hover:bg-white/5 font-mono truncate"
                  >
                    r/{h}
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* ================= MAIN ================= */}
        <main className="flex-1 px-4 md:px-6 py-6 min-w-0">
          {/* ---- Subreddit selector ---- */}
          <section className="mb-8">
            <SearchBox
              inputValue={inputValue} setInputValue={setInputValue}
              onSubmit={() => runFetch(inputValue, 1)} loading={loading}
            />
            <div className="flex flex-wrap gap-2 mt-3">
              {SUGGESTED.map((s) => (
                <button
                  key={s}
                  onClick={() => { setInputValue(s); runFetch(s, 1); }}
                  className="text-xs font-mono font-bold px-3 py-1.5 rounded-full border-2 border-slate-900 bg-slate-900 text-white hover:text-amber-300 hover:bg-black transition-colors"
                >
                  r/{s}
                </button>
              ))}
              <button
                onClick={() => scrollTo("charts")}
                className="text-xs font-mono font-semibold px-3 py-1.5 rounded-full border transition-colors bg-white text-slate-900 hover:bg-slate-100 flex items-center gap-1.5"
              >
                <Radar size={12} /> Go to Charts
              </button>
              <button
                onClick={() => setCompareOn((c) => !c)}
                className={`text-xs font-mono font-semibold px-3 py-1.5 rounded-full border transition-colors flex items-center gap-1.5
                  ${compareOn ? "border-amber-500 text-amber-700 bg-amber-500/20" : "border-slate-900 bg-slate-900 text-white hover:bg-black"}`}
              >
                <Layers size={12} /> Compare mode
              </button>
            </div>

            {compareOn && (
              <div className="mt-3 max-w-md">
                {!subreddit ? (
                  <p className="text-xs text-slate-700 font-medium mb-2">
                    Scan your first subreddit above, then add a second one here to compare them.
                  </p>
                ) : (
                  <SearchBox
                    inputValue={inputValue2} setInputValue={setInputValue2}
                    onSubmit={() => runFetch(inputValue2, 2)} loading={loading2}
                    placeholder="Second subreddit to compare…" compact
                  />
                )}
              </div>
            )}

            {error && <ErrorBanner message={error} onRetry={() => runFetch(inputValue, 1)} />}
            {compareOn && error2 && <ErrorBanner message={error2} onRetry={() => runFetch(inputValue2, 2)} />}
          </section>

          {!subreddit && !loading && <EmptyState />}
          {loading && <LoadingState subreddit={inputValue} />}

          {subreddit && !loading && posts.length > 0 && (
            <>
              {isMock && (
                <div className="mb-6 flex items-start gap-3 text-sm text-amber-900 bg-amber-50 border-2 border-amber-400 rounded-lg px-4 py-3 max-w-2xl fade-up">
                  <Info size={18} className="shrink-0 mt-0.5 text-amber-600" />
                  <div>
                    <p className="leading-snug">
                      <strong>Showing sample data.</strong> This preview environment blocks live browser requests to
                      reddit.com, so these 50 posts are realistic stand-ins (built with the same sentiment engine) —
                      not r/{subreddit}'s actual current posts. Everything else on this page works exactly as it
                      would with live data.
                    </p>
                    <button
                      onClick={() => runFetch(subreddit, 1)}
                      className="mt-2 text-xs font-bold text-amber-900 underline decoration-amber-600 underline-offset-2 hover:text-black"
                    >
                      Try live fetch anyway
                    </button>
                  </div>
                </div>
              )}

              {/* ---- OVERVIEW ---- */}
              <section id="overview" ref={(el) => (sectionRefs.current.overview = el)} className="mb-10 fade-up">
                <SectionHeader title="Overview" subtitle={`r/${subreddit} · ${posts.length} hot posts analyzed`} />

                <div className={`grid gap-4 ${isComparing ? "md:grid-cols-2" : "md:grid-cols-[280px_1fr]"}`}>
                  <div className="rounded-xl border border-slate-300 bg-white backdrop-blur-sm p-5 flex flex-col items-center justify-center">
                    <VibeGauge
                      value={stats.moodValue}
                      label={`r/${subreddit}${isMock ? " (sample)" : ""}`}
                      sublabel={`avg score ${stats.avgScore.toFixed(2)}`}
                    />
                    {isComparing && (
                      <div className="mt-2 pt-4 border-t border-slate-300 w-full flex justify-center">
                        <VibeGauge
                          value={stats2.moodValue} size={170}
                          label={`r/${subreddit2}${isMock2 ? " (sample)" : ""}`}
                          sublabel={`avg score ${stats2.avgScore.toFixed(2)}`}
                        />
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 content-start">
                    <StatCard icon={Sun} label="Positive" value={stats.positive} color={SENT_COLORS.positive}
                      sub={`${stats.positivePct}% of posts`} />
                    <StatCard icon={Wind} label="Neutral" value={stats.neutral} color={SENT_COLORS.neutral}
                      sub={`${stats.neutralPct}% of posts`} />
                    <StatCard icon={CloudRain} label="Negative" value={stats.negative} color={SENT_COLORS.negative}
                      sub={`${stats.negativePct}% of posts`} />
                    <StatCard icon={Activity} label="Avg Score" value={stats.avgScore.toFixed(2)} color="#1D4ED8"
                      sub="per-title sentiment" />
                    <div className="col-span-2 md:col-span-4 rounded-xl border border-slate-300 bg-white p-4 flex items-start gap-2.5">
                      <Info size={15} className="text-slate-700 shrink-0 mt-0.5" />
                      <p className="text-xs text-slate-700 leading-relaxed">
                        Each title is scored by a lexicon-based reader (negation + intensifier aware): words like
                        "amazing" or "breakthrough" push it positive, words like "crisis" or "disaster" push it
                        negative, and titles with no strong charged words — most headlines — land neutral. It's a
                        fast read on tone from the title alone, not a certified sentiment model.
                      </p>
                    </div>
                  </div>
                </div>

                {isComparing && (
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mt-4">
                    <CompareStat label="Positive" a={stats.positive} b={stats2.positive} nameA={subreddit} nameB={subreddit2} color={SENT_COLORS.positive} />
                    <CompareStat label="Neutral" a={stats.neutral} b={stats2.neutral} nameA={subreddit} nameB={subreddit2} color={SENT_COLORS.neutral} />
                    <CompareStat label="Negative" a={stats.negative} b={stats2.negative} nameA={subreddit} nameB={subreddit2} color={SENT_COLORS.negative} />
                  </div>
                )}
              </section>

              {/* ---- CHARTS ---- */}
              <section id="charts" ref={(el) => (sectionRefs.current.charts = el)} className="mb-10 fade-up">
                <SectionHeader
                  title="Charts"
                  subtitle={isComparing ? `r/${subreddit} vs r/${subreddit2}` : "distribution, breakdown, and trajectory"}
                />
                <div className={`grid gap-4 mb-4 ${isComparing ? "md:grid-cols-2" : "md:grid-cols-2"}`}>
                  <ChartCard title="Sentiment Distribution" icon={Radar}>
                    {isComparing ? (
                      <div className="grid grid-cols-2 gap-2">
                        {[{ sub: subreddit, data: stats.pieData }, { sub: subreddit2, data: stats2.pieData }].map((g) => (
                          <div key={g.sub}>
                            <div className="h-40">
                              <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                  <Pie data={g.data} dataKey="value" nameKey="name" innerRadius={32} outerRadius={55} paddingAngle={3}>
                                    {g.data.map((entry, i) => (
                                      <Cell key={i} fill={SENT_COLORS[entry.key]} stroke="#FFFFFF" strokeWidth={2} />
                                    ))}
                                  </Pie>
                                  <Tooltip content={<ChartTooltip />} />
                                </PieChart>
                              </ResponsiveContainer>
                            </div>
                            <div className="text-center text-[11px] font-mono font-bold text-slate-900 -mt-1">r/{g.sub}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="h-56">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={stats.pieData} dataKey="value" nameKey="name"
                              innerRadius={50} outerRadius={80} paddingAngle={3}
                            >
                              {stats.pieData.map((entry, i) => (
                                <Cell key={i} fill={SENT_COLORS[entry.key]} stroke="#FFFFFF" strokeWidth={2} />
                              ))}
                            </Pie>
                            <Tooltip content={<ChartTooltip />} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </ChartCard>

                  <ChartCard title="Posts by Sentiment" icon={Activity}>
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={isComparing ? groupedBarData : stats.barData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#CBD5E1" vertical={false} />
                          <XAxis dataKey="name" tick={{ fill: "#334155", fontSize: 11 }} axisLine={{ stroke: "#CBD5E1" }} tickLine={false} />
                          <YAxis tick={{ fill: "#334155", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                          <Tooltip content={<ChartTooltip />} cursor={{ fill: "#CBD5E166" }} />
                          {isComparing ? (
                            <>
                              <Legend wrapperStyle={{ fontSize: 11, fontFamily: "IBM Plex Mono" }} />
                              <Bar dataKey={subreddit} name={`r/${subreddit}`} fill={SUB_COLORS.a} radius={[6, 6, 0, 0]} />
                              <Bar dataKey={subreddit2} name={`r/${subreddit2}`} fill={SUB_COLORS.b} radius={[6, 6, 0, 0]} />
                            </>
                          ) : (
                            <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                              {stats.barData.map((entry, i) => (
                                <Cell key={i} fill={SENT_COLORS[entry.key]} />
                              ))}
                            </Bar>
                          )}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </ChartCard>
                </div>

                <ChartCard title={isComparing ? "Sentiment Score: Both Subreddits" : "Sentiment Score Across 50 Posts"} icon={ArrowUpDown}>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={isComparing ? combinedLineData : stats.lineData} margin={{ left: -20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#CBD5E1" vertical={false} />
                        <XAxis dataKey="index" tick={{ fill: "#334155", fontSize: 10 }} axisLine={{ stroke: "#CBD5E1" }} tickLine={false} />
                        <YAxis tick={{ fill: "#334155", fontSize: 11 }} axisLine={false} tickLine={false} />
                        <Tooltip content={<ChartTooltip />} />
                        {isComparing ? (
                          <>
                            <Legend wrapperStyle={{ fontSize: 11, fontFamily: "IBM Plex Mono" }} />
                            <Line type="monotone" dataKey={subreddit} name={`r/${subreddit}`} stroke={SUB_COLORS.a} strokeWidth={2} dot={false} connectNulls />
                            <Line type="monotone" dataKey={subreddit2} name={`r/${subreddit2}`} stroke={SUB_COLORS.b} strokeWidth={2} dot={false} connectNulls />
                          </>
                        ) : (
                          <Line type="monotone" dataKey="score" stroke="#B45309" strokeWidth={2.5} dot={{ r: 2.5, fill: "#B45309" }} activeDot={{ r: 5 }} />
                        )}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </ChartCard>
              </section>

              {/* ---- TRENDING WORDS ---- */}
              <section id="trends" ref={(el) => (sectionRefs.current.trends = el)} className="mb-10 fade-up">
                <SectionHeader
                  title="Trending Words"
                  subtitle={isComparing ? `r/${subreddit} vs r/${subreddit2}` : "most frequent significant words in titles"}
                />
                {isComparing ? (
                  <div className="grid md:grid-cols-2 gap-4">
                    {[{ sub: subreddit, words: trendingWords, color: SUB_COLORS.a }, { sub: subreddit2, words: trendingWords2, color: SUB_COLORS.b }].map((g) => (
                      <div key={g.sub} className="rounded-xl border border-slate-300 bg-white backdrop-blur-sm p-5">
                        <div className="text-xs font-mono font-bold mb-3" style={{ color: g.color }}>r/{g.sub}</div>
                        <div className="flex flex-wrap gap-2.5 items-center justify-center min-h-[120px]">
                          {g.words.length === 0 && <span className="text-sm text-slate-700">Not enough distinct words to chart.</span>}
                          {g.words.map((w) => (
                            <span
                              key={w.word}
                              className="font-mono capitalize transition-transform hover:scale-110"
                              style={{
                                fontSize: `${11 + w.weight * 16}px`,
                                color: g.color,
                                opacity: 0.5 + w.weight * 0.5,
                                fontWeight: 500 + Math.round(w.weight * 400),
                              }}
                              title={`${w.count} mentions`}
                            >
                              {w.word}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-300 bg-white backdrop-blur-sm p-6 flex flex-wrap gap-3 items-center justify-center min-h-[140px]">
                    {trendingWords.length === 0 && <span className="text-sm text-slate-700">Not enough distinct words to chart.</span>}
                    {trendingWords.map((w) => (
                      <span
                        key={w.word}
                        className="font-mono capitalize transition-transform hover:scale-110"
                        style={{
                          fontSize: `${12 + w.weight * 20}px`,
                          color: `hsl(${38 - w.weight * 20}, 90%, ${42 - w.weight * 15}%)`,
                          opacity: 0.55 + w.weight * 0.45,
                        }}
                        title={`${w.count} mentions`}
                      >
                        {w.word}
                      </span>
                    ))}
                  </div>
                )}
              </section>

              {/* ---- TABLE ---- */}
              <section id="table" ref={(el) => (sectionRefs.current.table = el)} className="mb-10 fade-up">
                <SectionHeader
                  title="Post Analysis"
                  subtitle={isComparing
                    ? `${filteredSorted.length} of ${tableRows.length} posts shown · both subreddits`
                    : `${filteredSorted.length} of ${posts.length} posts shown`}
                />

                <div className="flex flex-col sm:flex-row gap-2 mb-3">
                  <div className="relative flex-1">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-700" />
                    <input
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Filter by keyword or author…"
                      className="w-full bg-white border border-slate-300 rounded-lg pl-8 pr-3 py-2 text-sm text-slate-900 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-amber-500/60"
                    />
                  </div>
                  <select
                    value={filterSentiment}
                    onChange={(e) => setFilterSentiment(e.target.value)}
                    className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-500/60"
                  >
                    <option value="all">All sentiments</option>
                    <option value="positive">Positive</option>
                    <option value="neutral">Neutral</option>
                    <option value="negative">Negative</option>
                  </select>
                  <button
                    onClick={() => downloadCSV(filteredSorted, isComparing ? `${subreddit}-vs-${subreddit2}-vibe-check.csv` : `${subreddit}-vibe-check.csv`)}
                    className="flex items-center justify-center gap-1.5 bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-700 hover:text-amber-700 hover:border-amber-500/50 transition-colors"
                  >
                    <Download size={14} /> Export CSV
                  </button>
                </div>

                <div className="rounded-xl border border-slate-300 overflow-hidden">
                  <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-100 sticky top-0 z-10 border-b-2 border-slate-300">
                        <tr className="text-left text-[11px] uppercase tracking-widest text-slate-900 font-mono font-bold">
                          {isComparing && <Th label="Subreddit" onClick={() => toggleSort("sourceSub")} active={sortConfig.key === "sourceSub"} />}
                          <Th label="Title" onClick={() => toggleSort("title")} active={sortConfig.key === "title"} />
                          <Th label="Sentiment" onClick={() => toggleSort("sentiment")} active={sortConfig.key === "sentiment"} />
                          <Th label="Score" onClick={() => toggleSort("score")} active={sortConfig.key === "score"} />
                          <Th label="Upvotes" onClick={() => toggleSort("upvotes")} active={sortConfig.key === "upvotes"} />
                          <Th label="Author" onClick={() => toggleSort("author")} active={sortConfig.key === "author"} />
                        </tr>
                      </thead>
                      <tbody>
                        {filteredSorted.map((p) => (
                          <tr key={`${p.sourceSub}-${p.id}`} className="border-t border-slate-300/70 hover:bg-white transition-colors group">
                            {isComparing && (
                              <td className="px-3 py-2.5 font-mono text-xs font-bold" style={{ color: p.sourceSub === subreddit ? SUB_COLORS.a : SUB_COLORS.b }}>
                                r/{p.sourceSub}
                              </td>
                            )}
                            <td className="px-3 py-2.5 max-w-md">
                              <a href={p.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-slate-700 group-hover:text-amber-700">
                                <span className="truncate">{p.title}</span>
                                <ExternalLink size={11} className="shrink-0 opacity-0 group-hover:opacity-60" />
                              </a>
                              <span className="text-[10px] text-slate-700 font-mono">{timeAgo(p.created)}</span>
                            </td>
                            <td className="px-3 py-2.5"><SentimentPill sentiment={p.sentiment} /></td>
                            <td className="px-3 py-2.5 font-mono tabular-nums" style={{ color: SENT_COLORS[p.sentiment] }}>
                              {p.score > 0 ? `+${p.score}` : p.score}
                            </td>
                            <td className="px-3 py-2.5 font-mono tabular-nums text-slate-900">
                              <span className="inline-flex items-center gap-1"><ArrowBigUp size={12} />{p.upvotes.toLocaleString()}</span>
                            </td>
                            <td className="px-3 py-2.5 text-slate-700 font-mono text-xs">u/{p.author}</td>
                          </tr>
                        ))}
                        {filteredSorted.length === 0 && (
                          <tr><td colSpan={isComparing ? 6 : 5} className="text-center text-slate-700 py-8 text-sm">No posts match this filter.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

/* ============================================================================
   PART 7 — SUB-COMPONENTS USED ABOVE
============================================================================ */

function SearchBox({ inputValue, setInputValue, onSubmit, loading, placeholder, compact }) {
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className={compact ? "" : "max-w-xl"}>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-700 font-mono text-sm select-none">r/</span>
        <input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={placeholder || "Enter a subreddit, e.g. technology"}
          className="w-full bg-white border-2 border-slate-300 rounded-xl pl-8 pr-24 py-3 text-sm text-black placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-500 transition-colors"
        />
        <button
          type="submit"
          disabled={loading}
          className="absolute right-1.5 top-1.5 bottom-1.5 px-4 rounded-lg bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-slate-950 text-sm font-bold flex items-center gap-1.5 transition-colors shadow-lg shadow-amber-500/20"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          Scan
        </button>
      </div>
    </form>
  );
}

function SectionHeader({ title, subtitle }) {
  return (
    <div className="flex items-baseline justify-between mb-4">
      <h2 className="text-lg font-bold text-black flex items-center gap-2">
        <ChevronRight size={17} className="text-amber-600" strokeWidth={3} /> {title}
      </h2>
      <span className="text-xs text-slate-700 font-mono">{subtitle}</span>
    </div>
  );
}

function Th({ label, onClick, active }) {
  return (
    <th className="px-3 py-2.5 select-none">
      <button onClick={onClick} className={`flex items-center gap-1 hover:text-slate-700 transition-colors ${active ? "text-amber-700" : ""}`}>
        {label} <ArrowUpDown size={11} />
      </button>
    </th>
  );
}

function ErrorBanner({ message, onRetry }) {
  return (
    <div className="mt-3 flex items-start gap-3 text-sm text-red-900 bg-red-50 border-2 border-red-400 rounded-lg px-4 py-3 max-w-xl">
      <AlertTriangle size={18} className="shrink-0 mt-0.5 text-red-600" />
      <div className="flex-1">
        <p className="leading-snug font-medium">{message}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-2 text-xs font-bold text-red-900 underline decoration-red-600 underline-offset-2 hover:text-black"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mt-16 flex flex-col items-center text-center gap-3 fade-up">
      <SunMoon size={40} strokeWidth={1.3} className="text-amber-600/70" />
      <p className="text-sm max-w-sm text-slate-900 leading-relaxed">
        Pick a subreddit above and Vibe Check will read the room — pulling its 50 hottest
        titles and measuring the tone of the conversation.
      </p>
    </div>
  );
}

function LoadingState({ subreddit }) {
  return (
    <div className="mt-16 flex flex-col items-center text-center gap-3 fade-up">
      <Loader2 size={32} className="animate-spin text-amber-600" />
      <p className="text-sm text-slate-700 font-mono">
        {subreddit ? `reading r/${subreddit.replace(/^\/?(r\/)??/i, "")}…` : "reading…"}
      </p>
    </div>
  );
}

function CompareStat({ label, a, b, nameA, nameB, color }) {
  const max = Math.max(a, b, 1);
  return (
    <div className="col-span-3 md:col-span-2 rounded-xl border border-slate-300 bg-white p-3">
      <div className="text-[10px] uppercase tracking-widest text-slate-700 font-mono mb-2">{label}</div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[10px] w-16 truncate text-slate-700 font-mono">r/{nameA}</span>
        <div className="flex-1 h-2 rounded-full bg-slate-200 overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${(a / max) * 100}%`, backgroundColor: color }} />
        </div>
        <span className="text-xs font-mono font-bold text-black tabular-nums w-6 text-right">{a}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] w-16 truncate text-slate-700 font-mono">r/{nameB}</span>
        <div className="flex-1 h-2 rounded-full bg-slate-200 overflow-hidden">
          <div className="h-full rounded-full opacity-60" style={{ width: `${(b / max) * 100}%`, backgroundColor: color }} />
        </div>
        <span className="text-xs font-mono font-bold text-black tabular-nums w-6 text-right">{b}</span>
      </div>
    </div>
  );
}

/* ============================================================================
   PART 8 — AGGREGATION HELPERS
============================================================================ */

function computeStats(posts) {
  if (!posts.length) {
    return {
      positive: 0, neutral: 0, negative: 0, positivePct: 0, neutralPct: 0, negativePct: 0,
      avgScore: 0, moodValue: 0, pieData: [], barData: [], lineData: [],
    };
  }
  const positive = posts.filter((p) => p.sentiment === "positive").length;
  const neutral = posts.filter((p) => p.sentiment === "neutral").length;
  const negative = posts.filter((p) => p.sentiment === "negative").length;
  const total = posts.length;
  const avgScore = posts.reduce((s, p) => s + p.score, 0) / total;
  const avgComparative = posts.reduce((s, p) => s + p.comparative, 0) / total;
  const moodValue = clamp(avgComparative / 1.2, -1, 1);

  return {
    positive, neutral, negative,
    positivePct: Math.round((positive / total) * 100),
    neutralPct: Math.round((neutral / total) * 100),
    negativePct: Math.round((negative / total) * 100),
    avgScore, moodValue,
    pieData: [
      { name: "Positive", key: "positive", value: positive },
      { name: "Neutral", key: "neutral", value: neutral },
      { name: "Negative", key: "negative", value: negative },
    ].filter((d) => d.value > 0),
    barData: [
      { name: "Positive", key: "positive", count: positive },
      { name: "Neutral", key: "neutral", count: neutral },
      { name: "Negative", key: "negative", count: negative },
    ],
    lineData: posts.map((p, i) => ({ index: i + 1, score: p.score })),
  };
}

function computeTrending(posts) {
  const freq = {};
  posts.forEach((p) => {
    tokenize(p.title).forEach((w) => {
      if (w.length < 4 || STOPWORDS.has(w) || /^\d+$/.test(w)) return;
      freq[w] = (freq[w] || 0) + 1;
    });
  });
  const entries = Object.entries(freq).filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1]).slice(0, 16);
  const max = entries.length ? entries[0][1] : 1;
  return entries.map(([word, count]) => ({ word, count, weight: count / max }));
}
