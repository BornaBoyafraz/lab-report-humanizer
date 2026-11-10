import { Fragment } from "react";
import type { Hit } from "@/lib/detector";

/**
 * Renders the source text with each detected tell wrapped in a <mark> that
 * shows its category + explanation on hover. Overlapping hits are resolved by
 * keeping the earliest-starting one.
 */
export function HighlightedText({ text, hits }: { text: string; hits: Hit[] }) {
  if (!text) return null;

  const sorted = [...hits].sort((a, b) => a.start - b.start || b.end - a.end);
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  for (const h of sorted) {
    if (h.start < cursor) continue; // skip overlap
    if (h.start > cursor) {
      nodes.push(<Fragment key={key++}>{text.slice(cursor, h.start)}</Fragment>);
    }
    nodes.push(
      <mark
        key={key++}
        className="tell"
        data-cat={h.category}
        title={`${h.label} — ${h.why}`}
      >
        {text.slice(h.start, h.end)}
      </mark>
    );
    cursor = h.end;
  }
  if (cursor < text.length) {
    nodes.push(<Fragment key={key++}>{text.slice(cursor)}</Fragment>);
  }

  return <div className="highlight-doc">{nodes}</div>;
}
