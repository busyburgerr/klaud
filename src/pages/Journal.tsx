import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import api from "../api";
import { useAsync } from "../hooks";
import { EmptyState, ErrorState, Rule } from "../components";

export default function Journal() {
  const [rubric, setRubric] = useState("Все рубрики");
  const [params, setParams] = useSearchParams();

  // ?status=draft — витрина черновиков для редакции; читателю сервер их не отдаст.
  const status = params.get("status") === "draft" ? "draft" : undefined;
  const { data, loading, error, reload } = useAsync(() => api.articles({ status }), [status]);
  const canEdit = data?.canEdit ?? false;
  const draftsOnly = Boolean(status);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-5 md:px-10 py-32 text-center">
        <span className="mono-label" style={{ color: "#1f232099" }}>Загрузка журнала…</span>
      </div>
    );
  }

  if (error) {
    return <div className="max-w-7xl mx-auto px-5 md:px-10 py-16"><ErrorState error={error} onRetry={reload} /></div>;
  }

  const articles = data?.items ?? [];
  const rubrics = ["Все рубрики", ...(data?.rubrics ?? [])];
  const [lead, ...rest] = articles;
  const filtered = rubric === "Все рубрики" ? rest : rest.filter((a) => a.rubric === rubric);

  // Пустой журнал не обрывает страницу: шапка с кнопкой «Написать материал»
  // нужна редакции именно тогда, когда материалов ещё нет.
  if (!lead) {
    return (
      <div className="max-w-7xl mx-auto px-5 md:px-10">
        <Breadcrumb />
        <Masthead canEdit={canEdit} drafts={data?.drafts ?? 0} draftsOnly={draftsOnly} onAll={() => setParams({})} />
        <div style={{ height: 3, background: "#1f2320" }} />
        <section className="py-10 pb-16">
          <EmptyState
            title={draftsOnly ? "Черновиков нет" : "Материалов пока нет"}
            hint={canEdit ? "Первый материал появится здесь сразу после публикации" : "Редакция готовит первые тексты"}
            action={
              canEdit ? (
                <Link to="/journal/new" className="mono-label" style={{ background: "#1f2320", color: "#efe8da", borderRadius: 999, padding: "14px 32px", textDecoration: "none" }}>
                  Написать материал
                </Link>
              ) : undefined
            }
          />
        </section>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-5 md:px-10">
      <Breadcrumb />
      <Masthead canEdit={canEdit} drafts={data?.drafts ?? 0} draftsOnly={draftsOnly} onAll={() => setParams({})} />

      <div style={{ height: 3, background: "#1f2320" }} />

      {/* Lead article */}
      <section className="py-8">
        <Link to={`/journal/${lead.slug}`} className="grid md:grid-cols-12 gap-8 items-center group" style={{ textDecoration: "none", color: "#1f2320" }}>
          <div className="md:col-span-7 overflow-hidden" style={{ borderRadius: 20, background: "#e1d9c8", aspectRatio: "3/2" }}>
            <img src={lead.img} alt={lead.title} className="lot-img" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </div>
          <div className="md:col-span-5">
            <span className="mono-label" style={{ color: "#1f232099" }}>
              {lead.isDraft ? "Черновик" : "Передовица"} · {lead.rubric}
            </span>
            <h2 className="font-display mt-3" style={{ fontSize: "clamp(30px,4vw,52px)", fontWeight: 800, lineHeight: 0.95, letterSpacing: "-0.02em" }}>{lead.title}</h2>
            <p className="mt-4" style={{ fontSize: 16, lineHeight: 1.6, color: "#1f2320cc" }}>{lead.excerpt}</p>
            <p className="mono-label mt-5" style={{ color: "#1f232099" }}>{lead.author} · {lead.date} · {lead.read}</p>
            <span className="mono-label inline-flex items-center gap-2 mt-5 underline-link" style={{ color: "#1f2320" }}>Читать материал →</span>
          </div>
        </Link>
      </section>

      <Rule />

      {/* Rubric filter */}
      <div className="flex flex-wrap gap-2 py-6">
        {rubrics.map((r) => (
          <button key={r} onClick={() => setRubric(r)} className="mono-label" style={{ background: rubric === r ? "#1f2320" : "transparent", color: rubric === r ? "#efe8da" : "#1f2320", border: "1px solid " + (rubric === r ? "#1f2320" : "#1f232033"), borderRadius: 999, cursor: "pointer", padding: "8px 16px" }}>{r}</button>
        ))}
      </div>

      {/* Grid */}
      <section className="pb-16">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-10">
          {filtered.map((a) => (
            <Link key={a.slug} to={`/journal/${a.slug}`} className="group flex flex-col" style={{ textDecoration: "none", color: "#1f2320" }}>
              <div className="overflow-hidden mb-4" style={{ borderRadius: 16, background: "#e1d9c8", aspectRatio: "3/2" }}>
                <img src={a.img} alt={a.title} className="lot-img" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              </div>
              <span className="mono-label" style={{ color: "#1f232099" }}>
                {a.isDraft && <span style={{ background: "#1f2320", color: "#efe8da", borderRadius: 6, padding: "2px 7px", marginRight: 6 }}>черновик</span>}
                {a.rubric} · {a.read}
              </span>
              <h3 className="font-display mt-2 mb-2" style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.01em" }}>{a.title}</h3>
              <p className="m-0" style={{ fontSize: 14, lineHeight: 1.6, color: "#1f2320cc" }}>{a.excerpt}</p>
              <p className="mono-label mt-3" style={{ color: "#1f232099" }}>{a.author} · {a.date}</p>
            </Link>
          ))}
        </div>
        {filtered.length === 0 && (
          <EmptyState
            title="В этой рубрике пока пусто"
            action={canEdit ? <Link to="/journal/new" className="mono-label" style={{ background: "#1f2320", color: "#efe8da", borderRadius: 999, padding: "14px 32px", textDecoration: "none" }}>Написать материал</Link> : undefined}
          />
        )}
      </section>
    </div>
  );
}

function Breadcrumb() {
  return (
    <div className="flex items-center gap-2 py-5 mono-label" style={{ color: "#1f232099" }}>
      <Link to="/" style={{ color: "#1f232099", textDecoration: "none" }} className="underline-link">Клауд</Link>
      <span>/</span><span style={{ color: "#1f2320" }}>Журнал</span>
    </div>
  );
}

/** Шапка журнала. Редакции показывает кнопку публикации и счётчик черновиков. */
function Masthead({
  canEdit,
  drafts,
  draftsOnly,
  onAll,
}: {
  canEdit: boolean;
  drafts: number;
  draftsOnly: boolean;
  onAll: () => void;
}) {
  return (
    <section className="text-center pt-4 pb-8">
      <span className="mono-label" style={{ color: "#1f232099" }}>Редакционные материалы · Изд. № 417</span>
      <h1 className="font-display mx-auto mt-4" style={{ fontSize: "clamp(48px,9vw,120px)", fontWeight: 900, lineHeight: 0.85, letterSpacing: "-0.04em" }}>Журнал</h1>
      <p className="mx-auto mt-5" style={{ fontSize: 16, lineHeight: 1.6, color: "#1f2320cc", maxWidth: 460 }}>
        Гиды, репортажи и мастерская для тех, кто продаёт и покупает вещи с историей.
      </p>
      {canEdit && (
        <div className="flex items-center justify-center gap-3 mt-7 flex-wrap">
          <Link to="/journal/new" className="mono-label" style={{ background: "#1f2320", color: "#efe8da", borderRadius: 999, padding: "14px 32px", textDecoration: "none" }}>
            + Написать материал
          </Link>
          {draftsOnly ? (
            <button onClick={onAll} className="mono-label" style={{ border: "1px solid #1f232033", background: "transparent", borderRadius: 999, padding: "13px 22px", color: "#1f232099", cursor: "pointer" }}>
              ✕ показать все материалы
            </button>
          ) : (
            drafts > 0 && (
              <Link to="/journal?status=draft" className="mono-label" style={{ border: "1px solid #1f232033", borderRadius: 999, padding: "13px 22px", color: "#1f232099", textDecoration: "none" }}>
                черновиков: {drafts}
              </Link>
            )
          )}
        </div>
      )}
    </section>
  );
}
