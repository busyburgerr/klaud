import type { ArticleBlock } from "./api";

/**
 * Вёрстка тела материала журнала. Используется и на странице материала,
 * и в предпросмотре редактора — чтобы автор видел ровно то, что получит
 * читатель.
 */
export default function ArticleBody({ blocks, compact = false }: { blocks: ArticleBlock[]; compact?: boolean }) {
  const bodySize = compact ? 17 : 19;

  return (
    <>
      {blocks.map((block, i) => {
        switch (block.type) {
          case "heading":
            return (
              <h2
                key={i}
                className="font-display"
                style={{
                  fontSize: compact ? 26 : 34,
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.1,
                  marginTop: i === 0 ? 0 : compact ? 32 : 48,
                  marginBottom: compact ? 14 : 20,
                }}
              >
                {block.text}
              </h2>
            );

          case "list":
            return (
              <ul
                key={i}
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: `${i === 0 ? 0 : 20}px 0 0`,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                {block.items.map((item, j) => (
                  <li key={j} className="flex gap-3" style={{ fontSize: bodySize, lineHeight: 1.65, color: "#1f2320ee" }}>
                    <span aria-hidden style={{ color: "#1f232066", flexShrink: 0, lineHeight: 1.65 }}>•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            );

          case "steps":
            return (
              <ol key={i} style={{ listStyle: "none", padding: 0, margin: `${i === 0 ? 0 : 28}px 0 0` }}>
                {block.items.map((step, j) => (
                  <li
                    key={j}
                    className="flex gap-5 items-baseline"
                    style={{ padding: "18px 0", borderTop: j ? "1px solid #1f232022" : "none" }}
                  >
                    <span
                      className="font-display"
                      style={{ fontSize: compact ? 20 : 24, fontWeight: 700, color: "#1f232055", flexShrink: 0, minWidth: 38 }}
                    >
                      {String(j + 1).padStart(2, "0")}
                    </span>
                    <span>
                      {step.title && (
                        <span
                          className="font-display block"
                          style={{ fontSize: compact ? 18 : 21, fontWeight: 700, letterSpacing: "-0.01em", marginBottom: step.text ? 6 : 0 }}
                        >
                          {step.title}
                        </span>
                      )}
                      {step.text && (
                        <span className="block" style={{ fontSize: compact ? 15 : 16.5, lineHeight: 1.6, color: "#1f2320cc" }}>
                          {step.text}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            );

          case "callout":
            return (
              <aside
                key={i}
                style={{
                  background: "#1f2320",
                  color: "#efe8da",
                  borderRadius: 18,
                  padding: compact ? "20px 22px" : "26px 28px",
                  margin: `${i === 0 ? 0 : 36}px 0 0`,
                }}
              >
                <span className="mono-label" style={{ color: "#efe8da99" }}>{block.label}</span>
                <p className="m-0 mt-3" style={{ fontSize: compact ? 16 : 17.5, lineHeight: 1.6 }}>{block.text}</p>
              </aside>
            );

          default:
            return (
              <p
                key={i}
                style={{ fontSize: bodySize, lineHeight: 1.75, color: "#1f2320ee", margin: `${i === 0 ? 0 : 24}px 0 0` }}
              >
                {block.text}
              </p>
            );
        }
      })}
    </>
  );
}
