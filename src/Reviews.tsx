import { Link } from "react-router";
import type { Review, ReviewSummary } from "./api";
import { EmptyState, Rule } from "./components";

/** Пять звёзд с закрашенной частью — оценка сделки. */
export function Stars({ value, size = 15 }: { value: number; size?: number }) {
  return (
    <span aria-label={`Оценка ${value} из 5`} style={{ letterSpacing: 1, fontSize: size, color: "#1f2320" }}>
      {"★".repeat(Math.round(value))}
      <span style={{ color: "#1f232033" }}>{"★".repeat(Math.max(0, 5 - Math.round(value)))}</span>
    </span>
  );
}

/** Сводка: средняя оценка, число сделок и распределение по звёздам. */
export function ReviewSummaryCard({ summary }: { summary: ReviewSummary }) {
  const max = Math.max(1, ...summary.breakdown.map((b) => b.count));

  return (
    <div className="grid sm:grid-cols-12 gap-6 p-6" style={{ border: "1px solid #1f232022", borderRadius: 16, background: "#f6f0e3" }}>
      <div className="sm:col-span-4">
        <p className="font-display m-0" style={{ fontSize: 46, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1 }}>
          {summary.rating ?? "—"}
        </p>
        <div className="mt-2"><Stars value={Number(summary.rating ?? 0)} /></div>
        <p className="mono-label m-0 mt-3" style={{ color: "#1f232099" }}>
          {summary.total} {plural(summary.total, "отзыв", "отзыва", "отзывов")}
        </p>
        <p className="mono-label m-0 mt-1" style={{ color: "#1f232099" }}>
          успешных сделок: {summary.successful}
          {summary.failed > 0 ? ` · неудачных: ${summary.failed}` : ""}
        </p>
      </div>

      <div className="sm:col-span-8 flex flex-col gap-2 justify-center">
        {summary.breakdown.map((b) => (
          <div key={b.star} className="flex items-center gap-3">
            <span className="mono-label" style={{ color: "#1f232099", width: 24 }}>{b.star}★</span>
            <div style={{ flex: 1, height: 8, borderRadius: 999, background: "#1f232011", overflow: "hidden" }}>
              <div style={{ width: `${(b.count / max) * 100}%`, height: "100%", background: "#1f2320", borderRadius: 999 }} />
            </div>
            <span className="mono-label" style={{ color: "#1f232099", width: 24, textAlign: "right" }}>{b.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Список отзывов: кто, по какому лоту и состоялась ли сделка. */
export function ReviewList({ items, empty }: { items: Review[]; empty?: string }) {
  if (!items.length) {
    return <EmptyState title={empty ?? "Отзывов пока нет"} hint="Они появятся после первых сделок" />;
  }

  return (
    <div className="flex flex-col">
      {items.map((r) => (
        <div key={r.id}>
          <div className="py-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center font-display" style={{ width: 38, height: 38, borderRadius: "50%", background: "#1f2320", color: "#efe8da", fontSize: 16, flexShrink: 0 }}>
                  {r.author.name.charAt(0)}
                </div>
                <div>
                  <Link to={`/seller/${r.author.id}`} style={{ fontSize: 15, fontWeight: 600, color: "#1f2320", textDecoration: "none" }} className="underline-link">
                    {r.author.name}
                  </Link>
                  <p className="mono-label m-0 mt-0.5" style={{ color: "#1f232099" }}>{r.age} назад</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Stars value={r.rating} />
                <span className="mono-label" style={{ color: r.dealSuccess ? "#1f232099" : "#a33", border: "1px solid " + (r.dealSuccess ? "#1f232022" : "#a3333344"), borderRadius: 999, padding: "4px 12px" }}>
                  {r.dealSuccess ? "сделка состоялась" : "сделка не состоялась"}
                </span>
              </div>
            </div>

            {r.text && (
              <p className="m-0 mt-3" style={{ fontSize: 15, lineHeight: 1.6, color: "#1f2320dd" }}>{r.text}</p>
            )}

            <Link to={`/lot/${r.listingId}`} className="mono-label underline-link inline-block mt-3" style={{ color: "#1f232099", textDecoration: "none" }}>
              Лот {r.listingLot} · {r.listingTitle} →
            </Link>
          </div>
          <Rule />
        </div>
      ))}
    </div>
  );
}

export function plural(n: number, one: string, few: string, many: string) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
