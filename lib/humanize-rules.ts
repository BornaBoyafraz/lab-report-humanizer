/**
 * Rule-based humanizer (no network, no API key).
 * ==============================================
 * Deterministic, conservative transforms that strip the most common AI tells
 * while PROTECTING everything that matters in a lab report:
 *   - numbers, units, ranges, tolerances (e.g. "3.2 ± 0.1 mol/L")
 *   - chemical formulae and equations
 *   - inline citations ("(Smith et al., 2019)", "[3]")
 * We never touch protected spans, so measured data is always preserved.
 *
 * This engine is intentionally gentle: it fixes word-level tells it is sure
 * about. For deep rewrites (sentence restructuring, varied rhythm) the app
 * uses the LLM engine. Think of this as a reliable floor that works offline.
 */

export interface RuleChange {
  from: string;
  to: string;
  rule: string;
  index: number;
}

export interface RuleHumanizeResult {
  text: string;
  changes: RuleChange[];
}

// Spans we must never rewrite. We blank them out with placeholders, run the
// transforms, then restore them.
const PROTECT_PATTERNS: RegExp[] = [
  /\(?[A-Za-z][A-Za-z]*\s+et al\.?,?\s*\d{4}\)?/g, // citations (Smith et al., 2019)
  /\[\d+(?:[-,]\s?\d+)*\]/g, // numeric citations [3], [1,2]
  /\d+(?:\.\d+)?\s*(?:±|\+\/-|\+-)\s*\d+(?:\.\d+)?/g, // tolerances 3.2 ± 0.1
  /\b\d+(?:\.\d+)?(?:\s?(?:mol|mL|L|mg|kg|g|cm|mm|nm|µm|um|°C|K|Pa|kPa|atm|M|mM|nM|%|ppm|Hz|kHz|V|mV|A|mA|W|J|s|min|h))\b/gi, // value+unit
  /\b[A-Z][a-z]?\d*(?:[A-Z][a-z]?\d*)+\b/g, // crude chemical formulae H2O, NaCl, C6H12O6
  /\b\d+(?:\.\d+)?\s?(?:x|×)\s?10\^?-?\d+\b/gi, // scientific notation
];

interface Replacement {
  re: RegExp;
  to: string | ((m: string, ...g: string[]) => string);
  rule: string;
}

// Case-preserving word swap helper.
function preserveCase(source: string, target: string): string {
  if (source.length === 0) return target;
  if (source === source.toUpperCase() && source.length > 1) {
    return target.toUpperCase();
  }
  if (source[0] === source[0].toUpperCase()) {
    return target[0].toUpperCase() + target.slice(1);
  }
  return target;
}

function swap(words: string, replacement: string, rule: string): Replacement {
  const re = new RegExp(`\\b(${words})\\b`, "gi");
  return {
    re,
    to: (m) => preserveCase(m, replacement),
    rule,
  };
}

// Ordered list of transforms. Phrase-level first, then single words.
const REPLACEMENTS: Replacement[] = [
  // --- filler / hedging removal ---
  {
    re: /\bit is (?:important|worth|essential|crucial) to note that\s+/gi,
    to: "",
    rule: "Remove filler “it is important to note that”",
  },
  {
    re: /\bit(?:'|’)s (?:important|worth|essential) to note that\s+/gi,
    to: "",
    rule: "Remove filler “it’s important to note that”",
  },
  {
    re: /\bit should be noted that\s+/gi,
    to: "",
    rule: "Remove filler “it should be noted that”",
  },
  {
    re: /\bneedless to say,?\s+/gi,
    to: "",
    rule: "Remove filler “needless to say”",
  },
  {
    re: /\bin order to\b/gi,
    to: "to",
    rule: "“in order to” → “to”",
  },
  {
    re: /\bdue to the fact that\b/gi,
    to: "because",
    rule: "“due to the fact that” → “because”",
  },
  {
    re: /\bat (?:this|the present) point in time\b/gi,
    to: "now",
    rule: "“at this point in time” → “now”",
  },
  {
    re: /\bin the event that\b/gi,
    to: "if",
    rule: "“in the event that” → “if”",
  },
  {
    re: /\bhas the ability to\b/gi,
    to: "can",
    rule: "“has the ability to” → “can”",
  },
  {
    re: /\ba (?:wide|broad) (?:range|variety) of\b/gi,
    to: "many",
    rule: "“a wide range of” → “many”",
  },
  // --- significance inflation ---
  {
    re: /\bplays? an? (?:crucial|vital|significant|pivotal|key|central|important) role in\b/gi,
    to: "is important for",
    rule: "De-inflate “plays a crucial role in”",
  },
  {
    re: /\bserves? as\b/gi,
    to: "is",
    rule: "“serves as” → “is” (copula)",
  },
  {
    re: /\bstands? as\b/gi,
    to: "is",
    rule: "“stands as” → “is” (copula)",
  },
  {
    re: /\bunderscores the (?:importance|significance) of\b/gi,
    to: "emphasizes",
    rule: "De-inflate “underscores the importance of”",
  },
  {
    re: /\bunderscore the (?:importance|significance) of\b/gi,
    to: "emphasize",
    rule: "De-inflate “underscore the importance of”",
  },
  {
    re: /\bhighlights the (?:importance|significance) of\b/gi,
    to: "emphasizes",
    rule: "De-inflate “highlights the importance of”",
  },
  {
    re: /\bunderscoring the (?:importance|significance) of\b/gi,
    to: "emphasizing",
    rule: "De-inflate “underscoring the importance of”",
  },
  // --- AI vocabulary (science-safe synonyms) ---
];

// Science-safe single-word swaps. We keep "demonstrate/observe/measure" etc.
// intact (they're legitimate lab-report verbs) and only swap puffy words.
const WORD_SWAPS: Array<[string, string, string]> = [
  ["utilize|utilise", "use", "“utilize” → “use”"],
  ["utilizes|utilises", "uses", "“utilizes” → “uses”"],
  ["utilized|utilised", "used", "“utilized” → “used”"],
  ["utilizing|utilising", "using", "“utilizing” → “using”"],
  ["commence", "begin", "“commence” → “begin”"],
  ["commenced", "began", "“commenced” → “began”"],
  ["numerous", "many", "“numerous” → “many”"],
  ["a myriad of|myriad", "many", "“myriad” → “many”"],
  ["a plethora of|plethora of", "many", "“plethora of” → “many”"],
  ["leverage", "use", "“leverage” → “use”"],
  ["leverages", "uses", "“leverages” → “uses”"],
  ["leveraging", "using", "“leveraging” → “using”"],
  ["facilitate", "help", "“facilitate” → “help”"],
  ["facilitates", "helps", "“facilitates” → “helps”"],
  ["endeavor|endeavour", "effort", "“endeavor” → “effort”"],
  ["delve into", "examine", "“delve into” → “examine”"],
  ["delves into", "examines", "“delves into” → “examines”"],
  ["subsequent to", "after", "“subsequent to” → “after”"],
  ["prior to", "before", "“prior to” → “before”"],
  ["in close proximity to", "near", "“in close proximity to” → “near”"],
  ["a significant number of", "many", "“a significant number of” → “many”"],
  ["the vast majority of", "most", "“the vast majority of” → “most”"],
  ["pivotal", "key", "“pivotal” → “key”"],
  ["robust", "reliable", "“robust” → “reliable”"],
  ["intricate", "complex", "“intricate” → “complex”"],
  ["intricacies", "details", "“intricacies” → “details”"],
  ["showcase", "show", "“showcase” → “show”"],
  ["showcases", "shows", "“showcases” → “shows”"],
  ["showcased", "showed", "“showcased” → “showed”"],
  ["showcasing", "showing", "“showcasing” → “showing”"],
  ["leveraged", "used", "“leveraged” → “used”"],
  ["enduring", "lasting", "“enduring” → “lasting”"],
  ["elucidate", "explain", "“elucidate” → “explain”"],
  ["delineate", "describe", "“delineate” → “describe”"],
  ["multifaceted", "complex", "“multifaceted” → “complex”"],
];

for (const [from, to, rule] of WORD_SWAPS) {
  REPLACEMENTS.push(swap(from, to, rule));
}

export function humanizeWithRules(input: string): RuleHumanizeResult {
  let text = input ?? "";
  const changes: RuleChange[] = [];

  // 1) Protect data spans.
  const vault: string[] = [];
  for (const p of PROTECT_PATTERNS) {
    text = text.replace(p, (m) => {
      const token = `\u0000${vault.length}\u0000`;
      vault.push(m);
      return token;
    });
  }

  // 2) Normalize typographic tells.
  const curlyBefore = text;
  text = text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");
  if (text !== curlyBefore) {
    changes.push({
      from: "“ ” ‘ ’",
      to: '" \'',
      rule: "Straighten curly quotes",
      index: 0,
    });
  }

  // 3) Em dashes -> comma / sentence (conservative: use comma).
  const emBefore = text;
  text = text.replace(/\s*—\s*/g, ", ");
  if (text !== emBefore) {
    const count = (emBefore.match(/—/g) || []).length;
    changes.push({
      from: "—",
      to: ",",
      rule: `Replace ${count} em dash${count > 1 ? "es" : ""} with commas`,
      index: 0,
    });
  }

  // 4) Apply phrase/word replacements.
  for (const r of REPLACEMENTS) {
    text = text.replace(r.re, (...args) => {
      const m = args[0] as string;
      const to =
        typeof r.to === "function"
          ? (r.to as (m: string, ...g: string[]) => string)(...(args as [string]))
          : r.to;
      if (to !== m) {
        changes.push({ from: m, to, rule: r.rule, index: 0 });
      }
      return to;
    });
  }

  // 5) Thin out stacked transition openers (keep the first, drop extras that
  //    open consecutive sentences). We down-rank the most robotic ones.
  const transitionOpeners =
    /(^|[.?!]\s+)(Moreover|Furthermore|Additionally|Consequently|Notably|Importantly),?\s+/g;
  let transitionCount = 0;
  text = text.replace(transitionOpeners, (full, pre, word) => {
    transitionCount++;
    // Drop every transition opener after the first; lowercase-continue the sentence.
    if (transitionCount > 1) {
      changes.push({
        from: `${word},`,
        to: "(removed)",
        rule: "Trim stacked transition opener",
        index: 0,
      });
      return pre;
    }
    return full;
  });

  // 6) Collapse double spaces introduced by removals, fix orphan capitals.
  text = text.replace(/ {2,}/g, " ").replace(/\s+([.,;:])/g, "$1");
  // Re-capitalize sentence starts that lost their leading word.
  text = text.replace(/([.?!]\s+)([a-z])/g, (_m, p, c) => p + c.toUpperCase());
  text = text.replace(/^(\s*)([a-z])/, (_m, s, c) => s + c.toUpperCase());

  // 7) Restore protected spans.
  text = text.replace(/\u0000(\d+)\u0000/g, (_m, i) => vault[Number(i)] ?? "");

  return { text: text.trimStart(), changes };
}
