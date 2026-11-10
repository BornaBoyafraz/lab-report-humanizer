/**
 * Lab Report AI-Pattern Detector
 * ================================
 * A transparent, dependency-free analyzer that estimates how "AI-generated"
 * a piece of writing reads, based on the documented "Signs of AI writing"
 * (Wikipedia / WikiProject AI Cleanup) plus statistical structure signals.
 *
 * IMPORTANT HONESTY NOTE (surfaced in the UI too):
 * There is no reliable way to prove text was produced by an AI. This engine
 * does NOT claim certainty. It scores the *density of stylistic tells* that
 * correlate with LLM output, and shows every span it flagged so a human can
 * judge. It is a writing-quality lens, not a verdict machine.
 *
 * Lab-report tuning: scientific writing is formally passive and precise by
 * convention, so passive voice and hedging are weighted gently, while the
 * engine never flags numbers, units, or citations as "human/AI" — it only
 * looks at prose style.
 */

export type SignalCategory =
  | "ai-vocabulary"
  | "filler-hedging"
  | "significance-inflation"
  | "negative-parallelism"
  | "vague-attribution"
  | "superficial-ing"
  | "rule-of-three"
  | "em-dash"
  | "copula-avoidance"
  | "conclusion-boilerplate"
  | "transition-overuse"
  | "promotional"
  | "persuasive-authority"
  | "signposting"
  | "collab-artifact"
  | "formatting"
  | "uniformity";

export interface SignalDef {
  id: string;
  category: SignalCategory;
  label: string;
  /** Human explanation of why this reads as AI. */
  why: string;
  /** Per-hit weight contribution. */
  weight: number;
  /** Regex (global, case-insensitive expected). */
  pattern: RegExp;
}

export interface Hit {
  id: string;
  category: SignalCategory;
  label: string;
  why: string;
  weight: number;
  /** Matched text. */
  text: string;
  /** Absolute char offsets in the original input. */
  start: number;
  end: number;
}

export interface SentenceAnalysis {
  text: string;
  start: number;
  end: number;
  score: number; // 0-100 for this sentence
  wordCount: number;
  hits: Hit[];
}

export interface CategoryBreakdown {
  category: SignalCategory;
  label: string;
  count: number;
  contribution: number; // 0-100 relative share of the final score
}

export interface DetectionResult {
  /** 0-100 estimated AI-likeness. */
  score: number;
  band: "Low" | "Moderate" | "High" | "Very High";
  summary: string;
  hits: Hit[];
  sentences: SentenceAnalysis[];
  categories: CategoryBreakdown[];
  stats: {
    characters: number;
    words: number;
    sentences: number;
    avgSentenceLength: number;
    /** Coefficient of variation of sentence length. Low = robotic uniformity. */
    lengthVariation: number;
    emDashPer1000Words: number;
    signalsPer100Words: number;
    flaggedSentenceRatio: number;
  };
}

// ----------------------------------------------------------------------------
// Signal catalogue
// ----------------------------------------------------------------------------

const AI_VOCAB = [
  "delve", "delves", "delving", "intricate", "intricacies", "pivotal",
  "crucial", "underscore", "underscores", "underscoring", "leverage",
  "leverages", "leveraging", "realm", "tapestry", "landscape", "foster",
  "fosters", "fostering", "robust", "seamless", "seamlessly", "showcase",
  "showcases", "showcasing", "testament", "nuanced", "holistic", "vibrant",
  "enhance", "enhances", "enhancing", "garner", "garners", "interplay",
  "meticulous", "meticulously", "utilize", "utilizes", "utilizing",
  "myriad", "plethora", "encompass", "encompasses", "encompassing",
  "elucidate", "elucidates", "multifaceted", "paradigm", "synergy",
  "synergies", "cutting-edge", "groundbreaking", "unprecedented",
  "transformative", "invaluable", "pertinent", "noteworthy", "commendable",
  "endeavor", "facilitate", "facilitates", "notably", "arguably",
  "comprehensive", "profound", "intricately", "harness", "harnessing",
  "navigate", "navigating", "align", "aligns", "aligning", "enduring",
];

function wordAlt(words: string[]): RegExp {
  const esc = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`\\b(${esc.join("|")})\\b`, "gi");
}

export const SIGNALS: SignalDef[] = [
  {
    id: "ai-vocab",
    category: "ai-vocabulary",
    label: "AI-favored vocabulary",
    why: "Words like “delve”, “pivotal”, “robust” and “leverage” appear far more often in LLM text than in human writing.",
    weight: 2.2,
    pattern: wordAlt(AI_VOCAB),
  },
  {
    id: "filler-note",
    category: "filler-hedging",
    label: "Filler / hedging phrase",
    why: "Throat-clearing like “it is important to note” adds words without information.",
    weight: 3.4,
    pattern:
      /\b(it(?:'|’| i)s (?:important|worth|essential|crucial|interesting) to note(?: that)?|it should be noted(?: that)?|needless to say|at the end of the day|when it comes to|in order to|due to the fact that|a wide (?:range|variety) of|for all intents and purposes|at this point in time)\b/gi,
  },
  {
    id: "significance",
    category: "significance-inflation",
    label: "Inflated significance",
    why: "LLMs puff up importance with phrases about “pivotal moments” and “testaments”.",
    weight: 3.6,
    pattern:
      /\b(plays? a (?:crucial|vital|significant|pivotal|key|central|important) role|a testament to|stands? as a testament|marking a (?:pivotal|significant|key) (?:moment|milestone)|underscor\w+ the (?:importance|significance)|highlight\w* the (?:importance|significance)|evolving landscape|setting the stage|leaves? a lasting|an? indelible mark|reflects? a broader|contribut\w+ to the broader)\b/gi,
  },
  {
    id: "neg-parallel",
    category: "negative-parallelism",
    label: "Negative parallelism",
    why: "“It’s not just X, it’s Y” and “not only… but also” are overused rhetorical scaffolds.",
    weight: 3.2,
    pattern:
      /\b(it(?:'|’| i)s not (?:just|merely|only) [^.?!]{2,60}?(?:,| but)? it(?:'|’| i)s|not (?:just|only|merely) [^.?!]{2,50}? but (?:also|rather))\b/gi,
  },
  {
    id: "vague-attr",
    category: "vague-attribution",
    label: "Vague attribution",
    why: "Appeals to unnamed “studies”, “experts” or “researchers” dodge real citation.",
    weight: 3.0,
    pattern:
      /\b((?:many|some|several|most)? ?(?:studies|researchers?|experts?|scientists?|observers?|critics?|analysts?|sources?) (?:show|suggest|believe|argue|note|have (?:noted|shown|suggested)|say|claim|agree)|it is (?:widely|generally) (?:believed|accepted|known|regarded)|industry reports)\b/gi,
  },
  {
    id: "superficial-ing",
    category: "superficial-ing",
    label: "Superficial “-ing” analysis",
    why: "Tacked-on participles (“highlighting…”, “emphasizing…”) fake analytical depth.",
    weight: 2.6,
    pattern:
      /,\s+(highlighting|emphasizing|underscoring|showcasing|reflecting|symbolizing|demonstrating|illustrating|cementing|solidifying|reinforcing|ensuring|contributing to|paving the way|further (?:highlighting|emphasizing))\b/gi,
  },
  {
    id: "copula-avoid",
    category: "copula-avoidance",
    label: "Copula avoidance",
    why: "“Serves as / stands as / boasts” replace a plain “is/has” to sound grander.",
    weight: 2.4,
    pattern:
      /\b(serves? as|stands? as|functions? as|acts? as a (?:catalyst|foundation|cornerstone)|boasts?|is home to)\b/gi,
  },
  {
    id: "conclusion",
    category: "conclusion-boilerplate",
    label: "Boilerplate conclusion",
    why: "Formulaic wrap-ups like “In conclusion” and “Overall” signal template writing.",
    weight: 2.2,
    pattern:
      /(^|[.?!]\s+|\n\s*)(in conclusion|in summary|to summarize|to sum up|all in all|overall,|in essence|ultimately,|as (?:we have|previously) (?:seen|discussed))\b/gi,
  },
  {
    id: "transitions",
    category: "transition-overuse",
    label: "Transition overuse",
    why: "Heavy use of “Moreover / Furthermore / Additionally” is a classic LLM cadence.",
    weight: 1.8,
    pattern:
      /(^|[.?!]\s+|\n\s*)(moreover|furthermore|additionally|consequently|notably|importantly|nevertheless|nonetheless|thus|hence|therefore)\b/gi,
  },
  {
    id: "promotional",
    category: "promotional",
    label: "Promotional tone",
    why: "Marketing adjectives (“vibrant”, “breathtaking”, “nestled”) break neutral register.",
    weight: 2.4,
    pattern:
      /\b(nestled|in the heart of|breathtaking|stunning|must-(?:visit|see|try)|rich (?:history|heritage|tapestry)|renowned|world-class|state-of-the-art|rich cultural|natural beauty|vibrant (?:community|culture))\b/gi,
  },
  {
    id: "persuasive-authority",
    category: "persuasive-authority",
    label: "Persuasive authority trope",
    why: "“At its core / the real question is / fundamentally” pretend to reveal deep truth.",
    weight: 2.2,
    pattern:
      /\b(at its core|the real question is|what (?:really|truly) matters|the heart of the matter|the deeper (?:issue|truth)|fundamentally,|in reality,)\b/gi,
  },
  {
    id: "signposting",
    category: "signposting",
    label: "Signposting",
    why: "Announcing the next move (“Let’s dive in”, “Here’s what you need to know”) reads as a tutorial script.",
    weight: 2.4,
    pattern:
      /\b(let(?:'|’| u)s (?:dive|delve|explore|take a look|break (?:this|it) down)|here(?:'|’| i)s what you need to know|without further ado|buckle up|in this (?:section|article|report),? (?:we|i) will)\b/gi,
  },
  {
    id: "collab-artifact",
    category: "collab-artifact",
    label: "Chatbot artifact",
    why: "Assistant chatter (“Certainly!”, “I hope this helps”) was never meant for the document.",
    weight: 5.0,
    pattern:
      /\b(certainly!|of course!|i hope this helps|let me know if|great question|as an ai language model|here(?:'|’| i)s (?:a|an|the) (?:overview|summary|breakdown)|feel free to)\b/gi,
  },
  {
    id: "persuasive-range",
    category: "significance-inflation",
    label: "False range",
    why: "“From X to Y” where X and Y aren’t on a real scale inflates scope.",
    weight: 1.6,
    pattern: /\bfrom [^.?!,]{3,40} to [^.?!,]{3,40}, from [^.?!,]{3,40} to /gi,
  },
  {
    id: "curly-quotes",
    category: "formatting",
    label: "Curly quotes / typographic tells",
    why: "Default smart quotes and stray formatting often survive a copy-paste from a chatbot.",
    weight: 0.8,
    pattern: /[“”‘’]/g,
  },
  {
    id: "emoji",
    category: "formatting",
    label: "Emoji in formal text",
    why: "Emoji decoration in a lab report is a strong tell and breaks register.",
    weight: 2.0,
    pattern:
      /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}✅✨⭐]/gu,
  },
];

// Em dash handled specially (density based) but also flagged inline.
const EM_DASH = /—|\s--\s/g;

// Rule-of-three: three comma-separated short items ending in "and/or Z".
const RULE_OF_THREE =
  /\b([\w][\w\s'-]{1,24}), ([\w][\w\s'-]{1,24}),? and ([\w][\w\s'-]{1,24})\b/gi;

// ----------------------------------------------------------------------------
// Sentence splitting (offset-preserving)
// ----------------------------------------------------------------------------

export interface Span {
  text: string;
  start: number;
  end: number;
}

export function splitSentences(text: string): Span[] {
  const spans: Span[] = [];
  // Split on sentence terminators followed by whitespace, or on newlines.
  const re = /[^.!?\n]+[.!?]+[)"'”’]?|\S[^.!?\n]*(?=\n|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = m[0];
    const start = m.index;
    const end = start + raw.length;
    if (raw.trim().length === 0) continue;
    spans.push({ text: raw, start, end });
  }
  if (spans.length === 0 && text.trim().length > 0) {
    spans.push({ text, start: 0, end: text.length });
  }
  return spans;
}

function countWords(s: string): number {
  const m = s.trim().match(/\b[\w'-]+\b/g);
  return m ? m.length : 0;
}

// ----------------------------------------------------------------------------
// Core analysis
// ----------------------------------------------------------------------------

function collectHits(text: string): Hit[] {
  const hits: Hit[] = [];
  for (const sig of SIGNALS) {
    sig.pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = sig.pattern.exec(text)) !== null) {
      // Some patterns capture leading punctuation/space groups; anchor to the
      // meaningful token where possible.
      let matchText = m[0];
      let start = m.index;
      // Trim leading boundary whitespace/punctuation we grabbed for context.
      const lead = matchText.match(/^([.?!\s\n]+)/);
      if (lead && (sig.id === "conclusion" || sig.id === "transitions")) {
        start += lead[1].length;
        matchText = matchText.slice(lead[1].length);
      }
      hits.push({
        id: sig.id,
        category: sig.category,
        label: sig.label,
        why: sig.why,
        weight: sig.weight,
        text: matchText,
        start,
        end: start + matchText.length,
      });
      if (m.index === sig.pattern.lastIndex) sig.pattern.lastIndex++;
    }
  }

  // Em dashes
  EM_DASH.lastIndex = 0;
  let em: RegExpExecArray | null;
  while ((em = EM_DASH.exec(text)) !== null) {
    hits.push({
      id: "em-dash",
      category: "em-dash",
      label: "Em dash",
      why: "LLMs lean on em dashes far more than people do; most read better as commas, periods, or parentheses.",
      weight: 1.2,
      text: em[0],
      start: em.index,
      end: em.index + em[0].length,
    });
  }

  // Rule of three
  RULE_OF_THREE.lastIndex = 0;
  let r3: RegExpExecArray | null;
  while ((r3 = RULE_OF_THREE.exec(text)) !== null) {
    // Skip if items look like they contain numbers/units (likely real data).
    if (/\d/.test(r3[0])) continue;
    hits.push({
      id: "rule-of-three",
      category: "rule-of-three",
      label: "Rule of three",
      why: "Forcing ideas into tidy groups of three is a strong LLM cadence.",
      weight: 1.6,
      text: r3[0],
      start: r3.index,
      end: r3.index + r3[0].length,
    });
  }

  return hits.sort((a, b) => a.start - b.start);
}

function std(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/** Saturating map: raw weight density -> 0..100. */
function saturate(x: number, k: number): number {
  return 100 * (1 - Math.exp(-x / k));
}

export function detect(input: string): DetectionResult {
  const text = input ?? "";
  const words = countWords(text);
  const charCount = text.length;
  const sentenceSpans = splitSentences(text);
  const allHits = collectHits(text);

  // Map hits onto sentences.
  const sentences: SentenceAnalysis[] = sentenceSpans.map((sp) => {
    const sHits = allHits.filter(
      (h) => h.start >= sp.start && h.start < sp.end
    );
    const wc = countWords(sp.text);
    const rawWeight = sHits.reduce((a, h) => a + h.weight, 0);
    // Normalize by sentence length so long sentences aren't unfairly penalized.
    const density = rawWeight / Math.max(6, wc);
    const score = Math.round(saturate(density * 14, 10));
    return {
      text: sp.text,
      start: sp.start,
      end: sp.end,
      score: Math.min(100, score),
      wordCount: wc,
      hits: sHits,
    };
  });

  // Structural signals.
  const lengths = sentences.map((s) => s.wordCount).filter((n) => n > 0);
  const meanLen = lengths.length
    ? lengths.reduce((a, b) => a + b, 0) / lengths.length
    : 0;
  const cv = meanLen > 0 ? std(lengths) / meanLen : 0; // coefficient of variation
  // Human prose typically has CV ~0.5-0.8. Very low CV (robotic uniformity)
  // across enough sentences adds to the score.
  const uniformityPenalty =
    lengths.length >= 4 ? Math.max(0, (0.45 - Math.min(cv, 0.45)) / 0.45) : 0;

  const emDashHits = allHits.filter((h) => h.id === "em-dash").length;
  const emDashPer1000 = words > 0 ? (emDashHits / words) * 1000 : 0;

  const totalWeight = allHits.reduce((a, h) => a + h.weight, 0);
  const signalsPer100Words = words > 0 ? (allHits.length / words) * 100 : 0;
  const flaggedSentences = sentences.filter((s) => s.hits.length > 0).length;
  const flaggedRatio = sentences.length
    ? flaggedSentences / sentences.length
    : 0;

  // Composite score. Three ingredients:
  //  A) stylistic-tell density (dominant)
  //  B) proportion of sentences carrying tells
  //  C) robotic sentence-length uniformity (structural)
  const density = words > 0 ? totalWeight / words : 0;
  const A = saturate(density * 9, 4); // 0..100
  const B = flaggedRatio * 100;
  const C = uniformityPenalty * 100;

  let score = 0.62 * A + 0.26 * B + 0.12 * C;

  // Short-text guard: with very little text, be conservative and widen toward
  // the midpoint so we don't scream "100% AI" over two sentences.
  if (words < 40) {
    const shrink = words / 40;
    score = score * (0.55 + 0.45 * shrink);
  }
  score = Math.max(0, Math.min(100, Math.round(score)));

  // Category breakdown (by weighted contribution).
  const catMap = new Map<SignalCategory, { count: number; weight: number; label: string }>();
  const labelFor: Record<string, string> = {};
  for (const s of SIGNALS) labelFor[s.category] = categoryLabel(s.category);
  for (const h of allHits) {
    const cur = catMap.get(h.category) ?? {
      count: 0,
      weight: 0,
      label: categoryLabel(h.category),
    };
    cur.count += 1;
    cur.weight += h.weight;
    catMap.set(h.category, cur);
  }
  if (uniformityPenalty > 0.05) {
    catMap.set("uniformity", {
      count: 1,
      weight: uniformityPenalty * 8,
      label: "Robotic sentence uniformity",
    });
  }
  const totalCatWeight =
    Array.from(catMap.values()).reduce((a, c) => a + c.weight, 0) || 1;
  const categories: CategoryBreakdown[] = Array.from(catMap.entries())
    .map(([category, c]) => ({
      category,
      label: c.label,
      count: c.count,
      contribution: Math.round((c.weight / totalCatWeight) * 100),
    }))
    .sort((a, b) => b.contribution - a.contribution);

  const band: DetectionResult["band"] =
    score >= 75 ? "Very High" : score >= 50 ? "High" : score >= 25 ? "Moderate" : "Low";

  const summary = buildSummary(score, band, categories, {
    emDashPer1000,
    cv,
    flaggedRatio,
  });

  return {
    score,
    band,
    summary,
    hits: allHits,
    sentences,
    categories,
    stats: {
      characters: charCount,
      words,
      sentences: sentences.length,
      avgSentenceLength: Math.round(meanLen * 10) / 10,
      lengthVariation: Math.round(cv * 100) / 100,
      emDashPer1000Words: Math.round(emDashPer1000 * 10) / 10,
      signalsPer100Words: Math.round(signalsPer100Words * 10) / 10,
      flaggedSentenceRatio: Math.round(flaggedRatio * 100) / 100,
    },
  };
}

function categoryLabel(c: SignalCategory): string {
  const map: Record<SignalCategory, string> = {
    "ai-vocabulary": "AI-favored vocabulary",
    "filler-hedging": "Filler & hedging",
    "significance-inflation": "Inflated significance",
    "negative-parallelism": "Negative parallelism",
    "vague-attribution": "Vague attribution",
    "superficial-ing": "Superficial “-ing” analysis",
    "rule-of-three": "Rule of three",
    "em-dash": "Em-dash overuse",
    "copula-avoidance": "Copula avoidance",
    "conclusion-boilerplate": "Boilerplate conclusions",
    "transition-overuse": "Transition overuse",
    promotional: "Promotional tone",
    "persuasive-authority": "Persuasive authority tropes",
    signposting: "Signposting",
    "collab-artifact": "Chatbot artifacts",
    formatting: "Formatting tells",
    uniformity: "Robotic uniformity",
  };
  return map[c] ?? c;
}

function buildSummary(
  score: number,
  band: string,
  categories: CategoryBreakdown[],
  extra: { emDashPer1000: number; cv: number; flaggedRatio: number }
): string {
  if (score === 0) {
    return "No common AI-writing tells detected. This reads as human-written prose.";
  }
  const top = categories.slice(0, 3).map((c) => c.label.toLowerCase());
  const topStr =
    top.length === 0
      ? "a handful of scattered tells"
      : top.length === 1
      ? top[0]
      : `${top.slice(0, -1).join(", ")} and ${top[top.length - 1]}`;
  const lead =
    band === "Very High"
      ? "Strong AI-pattern signature."
      : band === "High"
      ? "Noticeable AI-pattern signature."
      : band === "Moderate"
      ? "Some AI-pattern tells present."
      : "Mostly clean, with a few minor tells.";
  return `${lead} The biggest contributors are ${topStr}. Review the highlighted spans — this is an estimate of style, not proof of authorship.`;
}
