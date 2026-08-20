import { Link } from "react-router";
import api from "../api";
import { useAsync } from "../hooks";
import { ErrorState, Rule } from "../components";

export default function About() {
  const { data, loading, error, reload } = useAsync(() => api.about(), []);
  const { data: meta } = useAsync(() => api.meta(), []);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-5 md:px-10 py-32 text-center">
        <span className="mono-label" style={{ color: "#1f232099" }}>Загрузка…</span>
      </div>
    );
  }

  if (error || !data) {
    return <div className="max-w-7xl mx-auto px-5 md:px-10 py-16"><ErrorState error={error!} onRetry={reload} /></div>;
  }

  const { project, principles, milestones, team, metrics } = data;
  const issue = meta?.issue ?? "417";

  // Витрина считается по базе: пока цифры не набраны, показываем прочерк,
  // а не выдуманные миллионы.
  const dash = (value: number | string | null) =>
    value === null || value === 0 || value === "0" ? "—" : String(value);

  const STATS = [
    { v: dash(metrics.activeListings), k: "активных лотов" },
    { v: dash(metrics.sold), k: "состоявшихся сделок" },
    { v: dash(metrics.cities), k: "городов с объявлениями" },
    { v: metrics.rating ? `${metrics.rating} ★` : "—", k: "средняя оценка" },
  ];

  return (
    <div className="max-w-7xl mx-auto px-5 md:px-10">
      <div className="flex items-center gap-2 py-5 mono-label" style={{ color: "#1f232099" }}>
        <Link to="/" style={{ color: "#1f232099", textDecoration: "none" }} className="underline-link">Клауд</Link>
        <span>/</span><span style={{ color: "#1f2320" }}>О проекте</span>
      </div>

      {/* ── Колофон ── */}
      <section className="pt-4 pb-10">
        <span className="mono-label" style={{ color: "#1f232099" }}>
          Колофон · издаётся с {project.since} года
        </span>
        <h1 className="font-display mt-5" style={{ fontSize: "clamp(44px,8vw,104px)", fontWeight: 900, lineHeight: 0.88, letterSpacing: "-0.04em", maxWidth: 900 }}>
          {project.title}
        </h1>
        <p className="mt-7" style={{ fontSize: "clamp(17px,2vw,21px)", lineHeight: 1.55, color: "#1f2320dd", maxWidth: 620 }}>
          {project.lead}
        </p>
      </section>

      <div style={{ height: 3, background: "#1f2320" }} />

      {/* ── Показатели ── */}
      <section className="py-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px" style={{ background: "#1f232022", border: "1px solid #1f232022", borderRadius: 18, overflow: "hidden" }}>
          {STATS.map((s) => (
            <div key={s.k} className="p-6" style={{ background: "#f6f0e3" }}>
              <p className="font-display m-0" style={{ fontSize: "clamp(26px,3.4vw,40px)", fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1 }}>{s.v}</p>
              <p className="mono-label m-0 mt-2" style={{ color: "#1f232099" }}>{s.k}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Принципы ── */}
      <section className="py-12">
        <h2 className="mono-label mb-8" style={{ color: "#1f232099" }}>Во что мы верим</h2>
        <div className="grid md:grid-cols-2 gap-x-10 gap-y-10">
          {principles.map((p) => (
            <div key={p.n} className="flex gap-5">
              <span className="mono-label" style={{ color: "#1f232055", flexShrink: 0, paddingTop: 8 }}>{p.n}</span>
              <div>
                <h3 className="font-display m-0" style={{ fontSize: "clamp(24px,3vw,32px)", fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.05 }}>
                  {p.title}
                </h3>
                <p className="m-0 mt-3" style={{ fontSize: 15.5, lineHeight: 1.65, color: "#1f2320cc" }}>{p.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <Rule />

      {/* ── Вехи ── */}
      <section className="py-12">
        <h2 className="font-display mb-2" style={{ fontSize: "clamp(30px,4.5vw,52px)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1 }}>
          Как мы дошли до № {issue}
        </h2>
        <p className="mono-label mb-8" style={{ color: "#1f232099" }}>Все вехи {project.since} года</p>

        <div className="flex flex-col">
          <Rule />
          {milestones.map((m) => (
            <div key={m.period}>
              <div className="grid md:grid-cols-12 gap-4 md:gap-8 py-8">
                <div className="md:col-span-4">
                  <span className="font-display" style={{ fontSize: "clamp(28px,4vw,44px)", fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1 }}>
                    {m.period}
                  </span>
                </div>
                <div className="md:col-span-8">
                  <h3 className="font-display m-0" style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-0.01em" }}>{m.title}</h3>
                  <p className="m-0 mt-2" style={{ fontSize: 15.5, lineHeight: 1.65, color: "#1f2320cc", maxWidth: 620 }}>{m.text}</p>
                </div>
              </div>
              <Rule />
            </div>
          ))}
        </div>
      </section>

      {/* ── Редакция ── */}
      {team.length > 0 && (
        <section className="py-12">
          <h2 className="mono-label mb-8" style={{ color: "#1f232099" }}>Редакция</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {team.map((person) => (
              <Link key={person.id} to={`/seller/${person.id}`} className="flex flex-col" style={{ textDecoration: "none", color: "#1f2320" }}>
                <span className="flex items-center justify-center font-display" style={{ width: 74, height: 74, borderRadius: "50%", background: "#1f2320", color: "#efe8da", fontSize: 32 }}>
                  {person.initial}
                </span>
                <span className="font-display mt-5" style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-0.01em" }}>{person.name}</span>
                <span className="mono-label mt-1" style={{ color: "#1f232099" }}>{person.role}</span>
                {person.bio && (
                  <span className="mt-3" style={{ fontSize: 14, lineHeight: 1.6, color: "#1f2320cc" }}>{person.bio}</span>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Призыв ── */}
      <section className="pb-16">
        <div className="grid md:grid-cols-12 gap-8 items-center" style={{ background: "#1f2320", color: "#efe8da", borderRadius: 20, padding: "clamp(28px,4vw,48px)" }}>
          <div className="md:col-span-7">
            <h2 className="font-display m-0" style={{ fontSize: "clamp(28px,4vw,46px)", fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1 }}>
              Станьте частью выпуска
            </h2>
            <p className="mt-4 m-0" style={{ fontSize: 15, lineHeight: 1.6, color: "#efe8dabb", maxWidth: 420 }}>
              Разместите первый лот или загляните в свежий каталог находок.
            </p>
          </div>
          <div className="md:col-span-5 flex gap-3 flex-wrap md:justify-end">
            <Link to="/new" className="mono-label" style={{ background: "#efe8da", color: "#1f2320", borderRadius: 999, padding: "16px 28px", textDecoration: "none" }}>
              Разместить лот
            </Link>
            <Link to="/catalog" className="mono-label" style={{ border: "1px solid #efe8da44", color: "#efe8da", borderRadius: 999, padding: "16px 28px", textDecoration: "none" }}>
              В каталог →
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
