import { useState } from "react";
import { Link, useNavigate } from "react-router";
import api from "../api";
import { useAsync } from "../hooks";
import { EmptyState, LotGrid, Rule } from "../components";

export default function Home() {
  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const navigate = useNavigate();

  const { data: categories } = useAsync(() => api.categories(), []);
  const { data: meta } = useAsync(() => api.meta(), []);
  const { data: lots, loading } = useAsync(
    () => api.listings({ limit: 8, cat: activeCat ?? undefined }),
    [activeCat],
  );

  const cats = categories ?? [];
  // Пока лотов нет, звать «смотреть все 0 лотов» не имеет смысла.
  const totalLabel = meta?.stats.listings ? meta.stats.listingsLabel : "";

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = search.trim();
    navigate(q ? `/catalog?q=${encodeURIComponent(q)}` : "/catalog");
  };

  return (
    <div className="max-w-7xl mx-auto px-5 md:px-10">
      {/* HERO */}
      <section className="py-10 md:py-16 grid md:grid-cols-12 gap-8 items-end">
        <div className="md:col-span-8">
          <span className="mono-label" style={{ color: "#1f232099" }}>Что ищем сегодня</span>
          <h1 className="font-display mt-4" style={{ fontSize: "clamp(38px,7vw,92px)", fontWeight: 800, lineHeight: 0.92, letterSpacing: "-0.03em" }}>
            Хорошие вещи<br /><span style={{ fontStyle: "italic", fontWeight: 500 }}>обретают</span> новых<br />владельцев.
          </h1>
        </div>
        <div className="md:col-span-4">
          <p style={{ fontSize: 15, lineHeight: 1.6, color: "#1f2320cc", maxWidth: 320 }}>
            Клауд — это каталог частных объявлений, устроенный как аукционный указатель. Каждый предмет получает свой номер лота, проверку и честную оценку.
          </p>
        </div>
      </section>

      {/* SEARCH */}
      <section className="pb-6">
        <form className="flex flex-col md:flex-row items-stretch gap-3" onSubmit={submitSearch}>
          <div className="flex-1 flex items-center gap-3 px-5" style={{ border: "1px solid #1f2320", borderRadius: 18, background: "#f6f0e3" }}>
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><circle cx="8.5" cy="8.5" r="5.5" stroke="#1f2320" strokeWidth="1.6"/><path d="M13.5 13.5L18 18" stroke="#1f2320" strokeWidth="1.6" strokeLinecap="round"/></svg>
            <input type="search" placeholder="Найти лот, марку или бренд..." value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Поиск по каталогу" className="flex-1 py-4 outline-none" style={{ border: "none", background: "none", color: "#1f2320", fontFamily: "'JetBrains Mono', monospace", fontSize: 13, letterSpacing: "0.02em" }} />
          </div>
          <button type="submit" className="mono-label" style={{ background: "#1f2320", color: "#efe8da", borderRadius: 18, padding: "0 40px", border: "none", cursor: "pointer", minHeight: 56 }}>
            Искать по каталогу
          </button>
        </form>
        <div className="flex flex-wrap gap-2 mt-3">
          {cats.slice(0, 5).map((c) => (
            <Link key={c.slug} to={`/category/${c.slug}`} className="chip mono-label flex items-center gap-2" style={{ border: "1px solid #1f232033", borderRadius: 12, background: "transparent", padding: "9px 16px", color: "#1f2320", textDecoration: "none" }}>
              {c.label}
              <span style={{ color: "#1f232066" }}>{c.count}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* SHORTCUTS */}
      <section className="py-4">
        <div className="flex flex-wrap gap-2">
          {(meta?.shortcuts ?? []).map((s) => (
            <Link key={s} to="/journal" className="chip mono-label" style={{ border: "1px solid #1f232022", borderRadius: 999, background: "#f6f0e3", padding: "10px 18px", color: "#1f2320", textDecoration: "none" }}>{s}</Link>
          ))}
        </div>
      </section>

      {/* CATEGORY INDEX */}
      <section className="py-12 md:py-16 grid md:grid-cols-12 gap-8">
        <div className="md:col-span-3">
          <span className="mono-label" style={{ color: "#1f232099" }}>Указатель / A—Z</span>
          <h2 className="font-display mt-3" style={{ fontSize: "clamp(28px,4vw,44px)", fontWeight: 800, lineHeight: 0.95, letterSpacing: "-0.02em" }}>Разделы каталога</h2>
          <p className="mt-4" style={{ fontSize: 13, lineHeight: 1.6, color: "#1f2320aa", maxWidth: 240 }}>Десять основных рубрик. Наведите курсор, чтобы увидеть обложку раздела.</p>
        </div>
        <div className="md:col-span-9">
          <Rule />
          {cats.map((c) => (
            <div key={c.slug}>
              <Link to={`/category/${c.slug}`} className="index-row w-full flex items-center gap-5 py-5 text-left" style={{ textDecoration: "none", color: "#1f2320" }}>
                <span className="mono-label" style={{ color: "#1f232088", width: 28 }}>{c.n}</span>
                <div className="index-thumb overflow-hidden hidden sm:block" style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, background: "#e1d9c8" }}>
                  <img src={c.img} alt={c.label} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                </div>
                <span className="font-display flex-1" style={{ fontSize: "clamp(22px,3vw,34px)", fontWeight: 600, letterSpacing: "-0.01em" }}>{c.label}</span>
                <span className="mono-label hidden sm:block" style={{ color: "#1f232088" }}>{c.count}</span>
                <svg className="index-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="#1f2320" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </Link>
              <Rule />
            </div>
          ))}
        </div>
      </section>

      {/* LOTS */}
      <section className="pb-16">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <span className="mono-label" style={{ color: "#1f232099" }}>Свежее поступление</span>
            <h2 className="font-display mt-2" style={{ fontSize: "clamp(28px,4vw,48px)", fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 0.95 }}>Лоты дня</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setActiveCat(null)} className="mono-label" style={chip(activeCat === null)}>Все лоты</button>
            {cats.slice(0, 5).map((c) => (
              <button key={c.slug} onClick={() => setActiveCat(c.slug)} className="mono-label" style={chip(activeCat === c.slug)}>{c.label}</button>
            ))}
          </div>
        </div>

        <LotGrid
          items={lots?.items ?? []}
          loading={loading}
          empty={
            <EmptyState
              title={activeCat ? "В этом разделе пока пусто" : "Каталог ждёт первых лотов"}
              hint={activeCat ? "Загляните в другие разделы" : "Разместите лот — он появится здесь после проверки"}
              action={<Link to="/new" className="mono-label" style={{ background: "#1f2320", color: "#efe8da", borderRadius: 999, padding: "14px 32px", textDecoration: "none" }}>Разместить лот</Link>}
            />
          }
        />

        <div className="text-center mt-12">
          <Link to="/catalog" className="mono-label inline-block" style={{ border: "1px solid #1f2320", borderRadius: 999, background: "transparent", cursor: "pointer", padding: "16px 48px", color: "#1f2320", textDecoration: "none" }}>
            Смотреть {totalLabel ? `все ${totalLabel} лотов` : "весь каталог"} →
          </Link>
        </div>
      </section>
    </div>
  );
}

const chip = (active: boolean) =>
  ({
    background: active ? "#1f2320" : "transparent",
    color: active ? "#efe8da" : "#1f2320",
    border: "1px solid " + (active ? "#1f2320" : "#1f232033"),
    borderRadius: 999,
    cursor: "pointer",
    padding: "8px 14px",
  }) as const;
