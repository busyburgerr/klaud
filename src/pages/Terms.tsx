import { Link } from "react-router";
import api from "../api";
import { useAsync } from "../hooks";
import { ErrorState, Rule } from "../components";
import ArticleBody from "../ArticleBody";

/**
 * Пользовательское соглашение.
 *
 * Разделы собираются из тех же блоков, что и материалы журнала, — вёрстка
 * общая (`ArticleBody`), поэтому документ читается так же, как статья.
 */
export default function Terms() {
  const { data, loading, error, reload } = useAsync(() => api.terms(), []);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-5 md:px-10 py-32 text-center">
        <span className="mono-label" style={{ color: "#1f232099" }}>Загрузка…</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-7xl mx-auto px-5 md:px-10 py-16">
        <ErrorState error={error!} onRetry={reload} />
      </div>
    );
  }

  const { document: doc, support } = data;

  return (
    <div className="max-w-7xl mx-auto px-5 md:px-10">
      <div className="flex items-center gap-2 py-5 mono-label" style={{ color: "#1f232099" }}>
        <Link to="/" style={{ color: "#1f232099", textDecoration: "none" }} className="underline-link">Клауд</Link>
        <span>/</span><span style={{ color: "#1f2320" }}>{doc.title}</span>
      </div>

      {/* Шапка документа */}
      <section className="pt-4 pb-10">
        <span className="mono-label" style={{ color: "#1f232099" }}>
          Редакция {doc.version} · от {doc.updated}
        </span>
        <h1 className="font-display mt-5" style={{ fontSize: "clamp(38px,7vw,88px)", fontWeight: 900, lineHeight: 0.9, letterSpacing: "-0.04em", maxWidth: 900 }}>
          {doc.title}
        </h1>
        <p className="mt-7" style={{ fontSize: "clamp(16px,1.9vw,20px)", lineHeight: 1.6, color: "#1f2320dd", maxWidth: 620 }}>
          {doc.lead}
        </p>
      </section>

      <div style={{ height: 3, background: "#1f2320" }} />

      {/* Оглавление */}
      <nav className="py-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-3">
        {doc.sections.map((section) => (
          <a
            key={section.n}
            href={`#${section.n}`}
            className="flex items-baseline gap-3 underline-link"
            style={{ color: "#1f2320", textDecoration: "none", fontSize: 15 }}
          >
            <span className="mono-label" style={{ color: "#1f232066" }}>{section.n}</span>
            {section.title}
          </a>
        ))}
      </nav>

      <Rule />

      {/* Разделы */}
      {doc.sections.map((section) => (
        <section key={section.n} id={section.n} className="grid md:grid-cols-12 gap-6 md:gap-10 py-10" style={{ scrollMarginTop: 120 }}>
          <div className="md:col-span-4">
            <span className="mono-label" style={{ color: "#1f232066" }}>{section.n}</span>
            <h2 className="font-display m-0 mt-3" style={{ fontSize: "clamp(24px,3vw,34px)", fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.05 }}>
              {section.title}
            </h2>
          </div>
          <div className="md:col-span-8">
            <ArticleBody blocks={section.blocks} />
          </div>
        </section>
      ))}

      <Rule />

      {/* Контакты */}
      <section className="py-10 pb-16 grid md:grid-cols-12 gap-6 md:gap-10">
        <div className="md:col-span-4">
          <h2 className="mono-label" style={{ color: "#1f232099" }}>Вопросы по соглашению</h2>
        </div>
        <div className="md:col-span-8">
          <p className="m-0" style={{ fontSize: 16, lineHeight: 1.7, color: "#1f2320dd", maxWidth: 560 }}>
            Напишите в поддержку — разберём и ответим: <strong>{support.email}</strong>,
            телефон <strong>{support.phone}</strong>. {support.hours}
          </p>
          <div className="flex gap-3 flex-wrap mt-6">
            <Link to="/help" className="mono-label" style={{ border: "1px solid #1f2320", color: "#1f2320", borderRadius: 999, padding: "14px 26px", textDecoration: "none" }}>
              Раздел «Помощь»
            </Link>
            <Link to="/register" className="mono-label" style={{ background: "#1f2320", color: "#efe8da", borderRadius: 999, padding: "14px 26px", textDecoration: "none" }}>
              Создать аккаунт →
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
