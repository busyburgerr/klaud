import { useMemo, useState } from "react";
import { Link } from "react-router";
import api from "../api";
import { useAsync } from "../hooks";
import { EmptyState, ErrorState, Rule } from "../components";

const ALL = "Все вопросы";

/** Куда ведёт каждый раздел справки — на страницу, где вопрос решается. */
const TOPIC_LINKS: Record<string, string> = {
  "how-to-buy": "/catalog",
  delivery: "/journal",
  returns: "/journal",
  "safe-deal": "/journal",
  "how-to-sell": "/new",
  business: "/business",
};

export default function Help() {
  const { data, loading, error, reload } = useAsync(() => api.help(), []);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(ALL);
  const [open, setOpen] = useState<number | null>(null);

  const questions = data?.questions ?? [];

  // Поиск идёт и по вопросу, и по ответу — список небольшой, фильтруем на месте.
  const found = useMemo(() => {
    const q = query.trim().toLowerCase();
    return questions.filter((item) => {
      const byCategory = category === ALL || item.category === category;
      const byQuery = !q || item.question.toLowerCase().includes(q) || item.answer.toLowerCase().includes(q);
      return byCategory && byQuery;
    });
  }, [questions, query, category]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-5 md:px-10 py-32 text-center">
        <span className="mono-label" style={{ color: "#1f232099" }}>Загрузка справки…</span>
      </div>
    );
  }

  if (error || !data) {
    return <div className="max-w-7xl mx-auto px-5 md:px-10 py-16"><ErrorState error={error!} onRetry={reload} /></div>;
  }

  const categories = [ALL, ...data.categories];

  return (
    <div className="max-w-7xl mx-auto px-5 md:px-10">
      <div className="flex items-center gap-2 py-5 mono-label" style={{ color: "#1f232099" }}>
        <Link to="/" style={{ color: "#1f232099", textDecoration: "none" }} className="underline-link">Клауд</Link>
        <span>/</span><span style={{ color: "#1f2320" }}>Помощь</span>
      </div>

      {/* ── Шапка с поиском ── */}
      <section className="text-center pt-6 pb-10">
        <span className="mono-label" style={{ color: "#1f232099" }}>Справочная служба · Изд. № 417</span>
        <h1 className="font-display mx-auto mt-4" style={{ fontSize: "clamp(46px,9vw,120px)", fontWeight: 900, lineHeight: 0.85, letterSpacing: "-0.04em" }}>
          Чем помочь?
        </h1>
        <p className="mx-auto mt-5" style={{ fontSize: 16, lineHeight: 1.6, color: "#1f2320cc", maxWidth: 460 }}>
          Ответы на вопросы о покупке, оплате, доставке и продаже лотов. Не нашли нужное — напишите нам.
        </p>

        <form
          className="flex items-center gap-3 mx-auto mt-8 px-5"
          onSubmit={(e) => e.preventDefault()}
          style={{ maxWidth: 560, border: "1px solid #1f232033", borderRadius: 999, background: "#f6f0e3" }}
        >
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="8.5" cy="8.5" r="5.5" stroke="#1f232099" strokeWidth="1.6" />
            <path d="M13.5 13.5L18 18" stroke="#1f232099" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(null); }}
            placeholder="Поиск по вопросам..."
            aria-label="Поиск по вопросам"
            className="flex-1 py-4 outline-none"
            style={{ border: "none", background: "none", color: "#1f2320", fontFamily: "'JetBrains Mono', monospace", fontSize: 13, letterSpacing: "0.02em" }}
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Очистить" className="mono-label" style={{ background: "none", border: "none", cursor: "pointer", color: "#1f232099" }}>
              ✕
            </button>
          )}
        </form>
      </section>

      <div style={{ height: 3, background: "#1f2320" }} />

      {/* ── Разделы справки ── */}
      <section className="py-10">
        <h2 className="mono-label mb-5" style={{ color: "#1f232099" }}>Разделы справки</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px" style={{ background: "#1f232022", border: "1px solid #1f232022", borderRadius: 18, overflow: "hidden" }}>
          {data.topics.map((t) => (
            <Link
              key={t.slug}
              to={TOPIC_LINKS[t.slug] ?? "/catalog"}
              className="index-row flex gap-4 p-6"
              style={{ background: "#f6f0e3", textDecoration: "none", color: "#1f2320" }}
            >
              <span className="mono-label" style={{ color: "#1f232066", flexShrink: 0 }}>{t.n}</span>
              <span>
                <span className="font-display block" style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em" }}>{t.title}</span>
                <span className="block mt-2" style={{ fontSize: 14, lineHeight: 1.55, color: "#1f2320cc" }}>{t.blurb}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Частые вопросы ── */}
      <section className="grid md:grid-cols-12 gap-8 py-8">
        <div className="md:col-span-4 min-w-0">
          <div className="md:sticky md:top-40 min-w-0">
            <h2 className="font-display mb-6" style={{ fontSize: "clamp(30px,4vw,44px)", fontWeight: 800, lineHeight: 1, letterSpacing: "-0.02em" }}>
              Частые вопросы
            </h2>
            <div className="flex md:flex-col gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "thin" }}>
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => { setCategory(c); setOpen(null); }}
                  className="mono-label"
                  style={{
                    background: category === c ? "#1f2320" : "transparent",
                    color: category === c ? "#efe8da" : "#1f2320",
                    border: "1px solid " + (category === c ? "#1f2320" : "#1f232033"),
                    borderRadius: 999,
                    cursor: "pointer",
                    padding: "12px 20px",
                    textAlign: "left",
                    whiteSpace: "nowrap",
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="md:col-span-8">
          {found.length === 0 ? (
            <EmptyState
              title="Ничего не нашлось"
              hint="Попробуйте другой запрос или напишите в службу заботы"
              action={
                <button onClick={() => { setQuery(""); setCategory(ALL); }} className="mono-label" style={{ background: "#1f2320", color: "#efe8da", border: "none", borderRadius: 999, padding: "14px 32px", cursor: "pointer" }}>
                  Показать все вопросы
                </button>
              }
            />
          ) : (
            <div className="flex flex-col">
              <Rule />
              {found.map((item) => {
                const isOpen = open === item.id;
                return (
                  <div key={item.id}>
                    <button
                      onClick={() => setOpen(isOpen ? null : item.id)}
                      aria-expanded={isOpen}
                      className="w-full flex items-start justify-between gap-4 text-left py-5"
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#1f2320" }}
                    >
                      <span className="font-display" style={{ fontSize: "clamp(18px,2.4vw,22px)", fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1.25 }}>
                        {item.question}
                      </span>
                      <span className="mono-label" style={{ color: "#1f232099", fontSize: 18, lineHeight: 1, flexShrink: 0, marginTop: 4 }}>
                        {isOpen ? "✕" : "+"}
                      </span>
                    </button>
                    {isOpen && (
                      <p className="m-0 pb-6" style={{ fontSize: 16, lineHeight: 1.7, color: "#1f2320dd", maxWidth: 620 }}>
                        {item.answer}
                      </p>
                    )}
                    <Rule />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ── Служба заботы ── */}
      <section className="pb-16">
        <div className="grid md:grid-cols-12 gap-8 items-center" style={{ background: "#1f2320", color: "#efe8da", borderRadius: 20, padding: "clamp(28px,4vw,48px)" }}>
          <div className="md:col-span-7">
            <span className="mono-label" style={{ color: "#efe8da99" }}>Не нашли ответ?</span>
            <h2 className="font-display mt-3" style={{ fontSize: "clamp(28px,4vw,44px)", fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1 }}>
              Служба заботы на связи
            </h2>
            <p className="mt-4 m-0" style={{ fontSize: 15, lineHeight: 1.6, color: "#efe8dabb", maxWidth: 420 }}>
              {data.support.hours} {data.support.responseTime}
            </p>
          </div>

          <div className="md:col-span-5 flex flex-col gap-3">
            <Link to="/messages" className="mono-label flex items-center justify-between gap-3" style={contactStyle}>
              Написать в чат <span aria-hidden>→</span>
            </Link>
            <a href={`mailto:${data.support.email}`} className="mono-label flex items-center justify-between gap-3" style={contactStyle}>
              {data.support.email} <span aria-hidden>→</span>
            </a>
            <a href={`tel:${data.support.phone.replace(/[^\d+]/g, "")}`} className="mono-label flex items-center justify-between gap-3" style={contactStyle}>
              {data.support.phone} <span aria-hidden>→</span>
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

const contactStyle = {
  background: "transparent",
  border: "1px solid #efe8da44",
  borderRadius: 999,
  padding: "16px 24px",
  color: "#efe8da",
  textDecoration: "none",
} as const;
