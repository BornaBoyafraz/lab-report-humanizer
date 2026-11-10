"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { detect } from "@/lib/detector";
import type { RuleChange } from "@/lib/humanize-rules";
import { SAMPLE_REPORT } from "@/lib/sample";
import { ScoreGauge, BandPill, scoreColor } from "@/components/score-gauge";
import { HighlightedText } from "@/components/highlighted-text";
import {
  AlertIcon,
  ArrowRightIcon,
  CheckIcon,
  CopyIcon,
  DocIcon,
  FlaskIcon,
  GithubIcon,
  InfoIcon,
  LoaderIcon,
  MoonIcon,
  ScanIcon,
  ShuffleIcon,
  SunIcon,
  TrashIcon,
  WandIcon,
} from "@/components/icons";

type Engine = "rules" | "ai";
type Strength = "light" | "balanced" | "thorough";
type Tab = "analysis" | "highlight" | "humanized";

const STRENGTHS: { id: Strength; label: string; hint: string }[] = [
  { id: "light", label: "Light", hint: "Smallest edit — fix only the clearest tells." },
  { id: "balanced", label: "Balanced", hint: "Remove tells and smooth phrasing. Recommended." },
  { id: "thorough", label: "Thorough", hint: "Also restructure sentences for natural rhythm." },
];

export function Workspace() {
  const [input, setInput] = useState("");
  const [engine, setEngine] = useState<Engine>("rules");
  const [strength, setStrength] = useState<Strength>("balanced");
  const [sample, setSample] = useState("");
  const [showSample, setShowSample] = useState(false);

  const [tab, setTab] = useState<Tab>("analysis");
  const [output, setOutput] = useState("");
  const [changes, setChanges] = useState<RuleChange[]>([]);
  const [outputEngine, setOutputEngine] = useState<Engine | null>(null);
  const [busy, setBusy] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  const outRef = useRef<HTMLDivElement>(null);

  // Live, client-side detection (same engine as the API).
  const deferred = useDeferredValue(input);
  const detection = useMemo(() => detect(deferred), [deferred]);
  const outDetection = useMemo(
    () => (output ? detect(output) : null),
    [output]
  );

  useEffect(() => {
    try {
      const saved = localStorage.getItem("lrh-theme");
      if (saved === "light" || saved === "dark") setTheme(saved);
      else
        setTheme(
          document.documentElement.getAttribute("data-theme") === "light"
            ? "light"
            : "dark"
        );
    } catch {}
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try {
        localStorage.setItem("lrh-theme", next);
      } catch {}
      return next;
    });
  }, []);

  const humanize = useCallback(async () => {
    if (!input.trim() || busy) return;
    setBusy(true);
    setError(null);
    setOutput("");
    setChanges([]);
    setOutputEngine(engine);
    setTab("humanized");

    try {
      const res = await fetch("/api/humanize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: input, engine, strength, sample }),
      });

      if (!res.ok) {
        let msg = `Request failed (${res.status}).`;
        try {
          const j = await res.json();
          if (j?.error) msg = j.error;
        } catch {}
        setError(msg);
        return;
      }

      const ct = res.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        const j = await res.json();
        setOutput(j.text ?? "");
        setChanges(Array.isArray(j.changes) ? j.changes : []);
        return;
      }

      // Streamed plain-text (AI engine).
      if (!res.body) {
        setError("Empty response from server.");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      setStreaming(true);
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setOutput(acc);
        if (outRef.current) outRef.current.scrollTop = outRef.current.scrollHeight;
      }
      acc += decoder.decode();
      setOutput(acc);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setStreaming(false);
      setBusy(false);
    }
  }, [input, engine, strength, sample, busy]);

  const copyOutput = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  }, [output]);

  const delta =
    outDetection && input ? detection.score - outDetection.score : null;

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <FlaskIcon width={21} height={21} />
          </span>
          <span style={{ minWidth: 0 }}>
            <span className="brand-title">Lab Report Humanizer</span>
            <br />
            <span className="brand-sub">detect · highlight · humanize</span>
          </span>
        </div>
        <span className="topbar-spacer" />
        <button
          className="btn btn-icon"
          onClick={toggleTheme}
          aria-label="Toggle color theme"
          title="Toggle theme"
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>
        <a
          className="btn btn-icon"
          href="https://github.com/BornaBoyafraz/lab-report-humanizer"
          target="_blank"
          rel="noreferrer"
          aria-label="View source on GitHub"
          title="Source on GitHub"
        >
          <GithubIcon />
        </a>
      </header>

      <main className="app-shell">
        <section className="hero">
          <h1>
            Make an AI-written lab report read like{" "}
            <span className="grad">a human wrote it.</span>
          </h1>
          <p>
            Paste a report to see an estimated AI-likeness score and the exact
            phrases that give it away, then rewrite them without ever changing
            your numbers, units, or citations.
          </p>
        </section>

        <div className="workspace">
          {/* ---------------- LEFT: input ---------------- */}
          <div className="panel">
            <div className="panel-head">
              <span className="dot" />
              <h2>Your report</h2>
            </div>
            <div className="panel-body">
              <textarea
                className="editor"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Paste your lab report here — introduction, methods, results, discussion, conclusion…"
                spellCheck={false}
                aria-label="Lab report input"
              />
              <div className="editor-meta">
                <span>
                  <b>{detection.stats.words}</b> words
                </span>
                <span>
                  <b>{detection.stats.sentences}</b> sentences
                </span>
                <span>
                  <b>{detection.hits.length}</b> tells
                </span>
                <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                  <button
                    className="btn"
                    onClick={() => setInput(SAMPLE_REPORT)}
                    type="button"
                  >
                    <ShuffleIcon /> Example
                  </button>
                  <button
                    className="btn"
                    onClick={() => {
                      setInput("");
                      setOutput("");
                      setError(null);
                    }}
                    type="button"
                    disabled={!input}
                  >
                    <TrashIcon /> Clear
                  </button>
                </span>
              </div>

              <div className="controls">
                <div className="control-group">
                  <span className="control-label">Engine</span>
                  <div className="seg" role="tablist" aria-label="Humanizer engine">
                    <button
                      data-active={engine === "rules"}
                      onClick={() => setEngine("rules")}
                      type="button"
                    >
                      Rule-based
                    </button>
                    <button
                      data-active={engine === "ai"}
                      onClick={() => setEngine("ai")}
                      type="button"
                    >
                      AI (Gateway)
                    </button>
                  </div>
                </div>

                {engine === "ai" && (
                  <div className="control-group">
                    <span className="control-label">Strength</span>
                    <div className="seg" aria-label="Rewrite strength">
                      {STRENGTHS.map((s) => (
                        <button
                          key={s.id}
                          data-active={strength === s.id}
                          onClick={() => setStrength(s.id)}
                          title={s.hint}
                          type="button"
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="control-group" style={{ marginLeft: "auto" }}>
                  <span className="control-label">&nbsp;</span>
                  <button
                    className="btn btn-primary"
                    onClick={humanize}
                    disabled={busy || !input.trim()}
                    type="button"
                  >
                    {busy ? (
                      <>
                        <LoaderIcon className="spin" /> Humanizing…
                      </>
                    ) : (
                      <>
                        <WandIcon /> Humanize report
                      </>
                    )}
                  </button>
                </div>
              </div>

              {engine === "ai" && (
                <>
                  <button
                    type="button"
                    className="btn"
                    style={{ marginTop: 12, fontSize: 13 }}
                    onClick={() => setShowSample((v) => !v)}
                  >
                    {showSample ? "– " : "+ "}Match my writing voice (optional)
                  </button>
                  {showSample && (
                    <textarea
                      className="editor"
                      style={{ minHeight: 110, marginTop: 10 }}
                      value={sample}
                      onChange={(e) => setSample(e.target.value)}
                      placeholder="Paste a paragraph of your own previous writing. The AI engine will match its rhythm and vocabulary."
                      aria-label="Writing voice sample"
                    />
                  )}
                  <div className="notice info">
                    <InfoIcon style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>
                      The AI engine needs an AI Gateway key. Without one it stays
                      disabled on the server and the Rule-based engine (no key
                      needed) is used instead — see the README.
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ---------------- RIGHT: results ---------------- */}
          <div className="panel">
            <div className="panel-head">
              <span className="dot" />
              <h2>Analysis</h2>
              <span style={{ marginLeft: "auto" }}>
                <div className="tabs">
                  <button data-active={tab === "analysis"} onClick={() => setTab("analysis")}>
                    Score
                  </button>
                  <button data-active={tab === "highlight"} onClick={() => setTab("highlight")}>
                    Highlights
                  </button>
                  <button data-active={tab === "humanized"} onClick={() => setTab("humanized")}>
                    Humanized
                  </button>
                </div>
              </span>
            </div>
            <div className="panel-body">
              {!input.trim() ? (
                <div className="empty">
                  <ScanIcon width={40} height={40} />
                  <div>
                    <strong style={{ color: "var(--text)" }}>Nothing to analyze yet</strong>
                    <div style={{ fontSize: 13, marginTop: 4 }}>
                      Paste a report or load the example to begin.
                    </div>
                  </div>
                </div>
              ) : tab === "analysis" ? (
                <AnalysisView detection={detection} />
              ) : tab === "highlight" ? (
                <HighlightView detection={detection} input={input} />
              ) : (
                <HumanizedView
                  busy={busy}
                  streaming={streaming}
                  error={error}
                  output={output}
                  changes={changes}
                  outputEngine={outputEngine}
                  inScore={detection.score}
                  outScore={outDetection?.score ?? null}
                  outBand={outDetection?.band ?? "Low"}
                  delta={delta}
                  copied={copied}
                  onCopy={copyOutput}
                  outRef={outRef}
                  switchEngine={() => {
                    setEngine("rules");
                  }}
                />
              )}
            </div>
          </div>
        </div>

        <footer className="footer">
          <span>
            Detection estimates writing <em>style</em>, not authorship — no tool
            can prove text was AI-generated. Use it as a lens, not a verdict.
          </span>
          <span>Built with Next.js · AI SDK · Vercel AI Gateway</span>
        </footer>
      </main>
    </>
  );
}

/* ------------------------------------------------------------------ */

function AnalysisView({ detection }: { detection: ReturnType<typeof detect> }) {
  return (
    <>
      <div className="gauge-wrap">
        <ScoreGauge score={detection.score} band={detection.band} />
        <div className="gauge-summary">
          <BandPill score={detection.score} band={detection.band} />
          <p>{detection.summary}</p>
        </div>
      </div>

      <div className="stats">
        <Stat v={detection.stats.words} k="Words" />
        <Stat v={detection.stats.sentences} k="Sentences" />
        <Stat v={detection.stats.avgSentenceLength} k="Avg length" />
        <Stat v={detection.stats.signalsPer100Words} k="Tells / 100w" />
        <Stat v={detection.stats.emDashPer1000Words} k="Em-dash / 1k" />
        <Stat v={detection.stats.lengthVariation} k="Length variety" />
      </div>

      {detection.categories.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div className="control-label" style={{ marginBottom: 12 }}>
            Top contributors
          </div>
          <div className="cats">
            {detection.categories.slice(0, 6).map((c) => (
              <div className="cat-row" key={c.category}>
                <span className="cat-name">{c.label}</span>
                <span className="cat-count">
                  {c.count} · {c.contribution}%
                </span>
                <span className="cat-track">
                  <span className="cat-fill" style={{ width: `${c.contribution}%` }} />
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function HighlightView({
  detection,
  input,
}: {
  detection: ReturnType<typeof detect>;
  input: string;
}) {
  if (detection.hits.length === 0) {
    return (
      <div className="empty">
        <CheckIcon width={38} height={38} style={{ color: "var(--accent)" }} />
        <div>
          <strong style={{ color: "var(--text)" }}>No tells found</strong>
          <div style={{ fontSize: 13, marginTop: 4 }}>
            This text reads as human-written. Nothing to highlight.
          </div>
        </div>
      </div>
    );
  }
  return (
    <>
      <HighlightedText text={input} hits={detection.hits} />
      <div className="legend">
        <span>
          <i style={{ background: "var(--amber)" }} /> phrasing / structure
        </span>
        <span>
          <i style={{ background: "var(--purple)" }} /> AI vocabulary
        </span>
        <span>
          <i style={{ background: "var(--cyan)" }} /> formatting
        </span>
        <span>
          <i style={{ background: "var(--red)" }} /> tone / artifacts
        </span>
      </div>
      <div className="notice info" style={{ marginTop: 16 }}>
        <InfoIcon style={{ flexShrink: 0, marginTop: 1 }} />
        <span>Hover any highlight to see why it reads as AI.</span>
      </div>
    </>
  );
}

function HumanizedView(props: {
  busy: boolean;
  streaming: boolean;
  error: string | null;
  output: string;
  changes: RuleChange[];
  outputEngine: Engine | null;
  inScore: number;
  outScore: number | null;
  outBand: string;
  delta: number | null;
  copied: boolean;
  onCopy: () => void;
  outRef: React.RefObject<HTMLDivElement | null>;
  switchEngine: () => void;
}) {
  const {
    busy,
    streaming,
    error,
    output,
    changes,
    outputEngine,
    inScore,
    outScore,
    outBand,
    delta,
    copied,
    onCopy,
    outRef,
    switchEngine,
  } = props;

  if (error) {
    return (
      <>
        <div className="notice warn">
          <AlertIcon style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{error}</span>
        </div>
        <button className="btn" style={{ marginTop: 14 }} onClick={switchEngine} type="button">
          Switch to Rule-based engine
        </button>
      </>
    );
  }

  if (busy && !output) {
    return (
      <div className="empty">
        <LoaderIcon width={34} height={34} className="spin" style={{ color: "var(--accent)" }} />
        <div style={{ fontSize: 13 }}>Rewriting your report…</div>
      </div>
    );
  }

  if (!output) {
    return (
      <div className="empty">
        <DocIcon width={38} height={38} />
        <div>
          <strong style={{ color: "var(--text)" }}>No rewrite yet</strong>
          <div style={{ fontSize: 13, marginTop: 4 }}>
            Press “Humanize report” to generate a cleaned version here.
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {outScore !== null && (
        <div className="compare">
          <div className="leg">
            <span className="n" style={{ color: scoreColor(inScore) }}>
              {inScore}%
            </span>
            <span className="l">Before</span>
          </div>
          <ArrowRightIcon className="arrow" />
          <div className="leg">
            <span className="n" style={{ color: scoreColor(outScore) }}>
              {outScore}%
            </span>
            <span className="l">After · {outBand}</span>
          </div>
          {delta !== null && delta > 0 && (
            <span className="delta">−{delta} pts AI-like</span>
          )}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span className="control-label">
          {outputEngine === "ai" ? "AI rewrite" : "Rule-based rewrite"}
          {streaming ? " · streaming" : ""}
        </span>
        <button
          className="btn"
          style={{ marginLeft: "auto" }}
          onClick={onCopy}
          type="button"
          disabled={streaming}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <div
        ref={outRef}
        className={`output-doc${streaming ? " streaming" : ""}`}
      >
        {output}
      </div>

      {outputEngine === "rules" && changes.length > 0 && (
        <div className="changes-list">
          <div className="control-label">{changes.length} edits applied</div>
          {changes.slice(0, 40).map((c, i) => (
            <div className="change" key={i}>
              <span className="swap">
                {c.from && c.to !== "(removed)" ? (
                  <>
                    <s>{c.from}</s> <ArrowRightIcon width={12} height={12} /> <b>{c.to}</b>
                  </>
                ) : (
                  <b>{c.rule}</b>
                )}
              </span>
              <span className="rule" style={{ marginLeft: "auto" }}>
                {c.rule}
              </span>
            </div>
          ))}
        </div>
      )}

      {outputEngine === "rules" && changes.length === 0 && (
        <div className="notice info" style={{ marginTop: 14 }}>
          <InfoIcon style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            The rule-based engine found no safe word-level fixes. For deeper
            rewriting, try the AI engine.
          </span>
        </div>
      )}
    </>
  );
}

function Stat({ v, k }: { v: number; k: string }) {
  return (
    <div className="stat">
      <div className="v">{v}</div>
      <div className="k">{k}</div>
    </div>
  );
}
