/**
 * Prompt construction for the LLM humanizer, tuned specifically for lab
 * reports. The hard constraints (never alter data / units / citations, keep
 * scientific register) are what make this usable on real reports rather than
 * a generic "make it casual" rewrite.
 */

export type Strength = "light" | "balanced" | "thorough";

export const STRENGTHS: { id: Strength; label: string; hint: string }[] = [
  { id: "light", label: "Light", hint: "Fix only the clearest AI tells. Smallest possible edit." },
  { id: "balanced", label: "Balanced", hint: "Remove AI tells and smooth phrasing. Recommended." },
  { id: "thorough", label: "Thorough", hint: "Also restructure sentences for natural human rhythm." },
];

const STRENGTH_DIRECTIVE: Record<Strength, string> = {
  light:
    "Make the SMALLEST set of edits that removes the most obvious AI fingerprints. Change wording only where a tell clearly exists. Preserve the original sentence order and structure.",
  balanced:
    "Remove AI fingerprints and smooth awkward phrasing. You may merge or split sentences where it clearly improves flow, but stay close to the original structure.",
  thorough:
    "Remove AI fingerprints AND rewrite for natural human rhythm: vary sentence length, break up uniform cadence, and prefer plain scientific wording throughout. Keep every fact and all structure/headings.",
};

export function buildSystemPrompt(strength: Strength): string {
  return `You are an expert scientific editor. You rewrite laboratory reports so they read as if written by a careful human student or researcher, removing the stylistic fingerprints of AI-generated text while preserving every scientific fact exactly.

ABSOLUTE RULES — never violate these:
- NEVER change any number, measurement, unit, uncertainty (±), statistical value (p-values, R², r, t, F, χ², means, standard deviations, confidence intervals), chemical formula, reaction equation, variable name, sample ID, or date. Reproduce all of them character-for-character.
- NEVER invent, add, remove, or alter a result, finding, method step, reagent, concentration, or conclusion. Only change HOW things are worded, never WHAT is said.
- NEVER invent citations or sources. If the source text cites a reference, keep it exactly. If it uses a vague attribution like "studies show", state the fact plainly without inventing a source.
- KEEP the formal scientific register. This is a lab report, not a blog post or essay. Do NOT make it chatty, casual, humorous, opinionated, or first-person-anecdotal. No slang. No emojis. No markdown bold/headers you add yourself.
- Passive voice is NORMAL and often correct in a Methods section ("the solution was titrated to the endpoint"). Do NOT force everything into active voice. Use whichever voice a careful scientist would use, and vary it naturally.
- Preserve the document's sections, headings, and overall order.

REMOVE these AI tells:
- Inflated significance: "plays a crucial/vital/pivotal role", "underscores the importance of", "stands as a testament to", "marks a significant milestone".
- Filler and hedging: "it is important to note that", "it is worth noting", "in order to", "due to the fact that", "a wide range of".
- AI vocabulary: delve, leverage, robust, seamless, intricate, showcase, pivotal, utilize, myriad, foster, holistic, comprehensive (when empty). Use plain scientific words instead.
- Rule-of-three lists and negative parallelism ("not only X but also Y", "it's not just X, it's Y").
- Em-dash overuse: prefer commas, periods, or parentheses.
- Superficial "-ing" tails ("..., highlighting the significance of...").
- Boilerplate conclusions ("In conclusion,", "Overall,", "In summary,") — start the sentence with its actual content.
- Robotic uniformity: if every sentence is the same length, vary them.

${STRENGTH_DIRECTIVE[strength]}

OUTPUT: Return ONLY the rewritten report text. No preamble, no commentary, no explanation of changes, no markdown code fences, no "Here is the revised report". Just the report.`;
}

export function buildUserPrompt(text: string, sample?: string): string {
  let out = "";
  if (sample && sample.trim().length > 0) {
    out += `Here is a sample of the author's own writing. Match this voice (vocabulary level, sentence rhythm, punctuation habits) while keeping the scientific register:\n\n<<<AUTHOR_SAMPLE\n${sample.trim()}\nAUTHOR_SAMPLE>>>\n\n`;
  }
  out += `Rewrite the following lab report according to the rules. Return only the rewritten report.\n\n<<<REPORT\n${text}\nREPORT>>>`;
  return out;
}

export const DEFAULT_MODEL =
  process.env.HUMANIZER_MODEL || "anthropic/claude-sonnet-5.5";
