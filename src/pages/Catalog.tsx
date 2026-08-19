import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import api from "../api";
import { useAsync, useDebounced } from "../hooks";
import { ErrorState, LotGrid, Rule } from "../components";

const SORTS = [
  { key: "new", label: "Сначала новые" },
  { key: "price_asc", label: "Дешевле" },
  { key: "price_desc", label: "Дороже" },
];

export default function Catalog() {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();

  const q = params.get("q") ?? "";
  const sort = params.get("sort") ?? "new";
  const page = Number(params.get("page")) || 1;
  const conds = params.getAll("cond");

  // Цена печатается быстро — запрос отправляем с задержкой.
  const [minP, setMinP] = useState(params.get("minPrice") ?? "");
  const [maxP, setMaxP] = useState(params.get("maxPrice") ?? "");
  const minPrice = useDebounced(minP);
  const maxPrice = useDebounced(maxP);

  const [cols, setCols] = useState(4);

  const { data: categories } = useAsync(() => api.categories(), []);
  const { data: filters } = useAsync(() => api.filters(), []);
  const category = categories?.find((c) => c.slug === slug) ?? null;

  const { data, loading, error, reload } = useAsync(
    () => api.listings({ cat: slug, q, cond: conds, minPrice, maxPrice, sort, page, limit: 24 }),
    [slug, q, conds.join(","), minPrice, maxPrice, sort, page],
  );

  // При смене фильтров возвращаемся на первую страницу.
  useEffect(() => {
    if (page > 1) patch({ page: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, q, conds.join(","), minPrice, maxPrice, sort]);

  /** Точечно правит query-строку, сохраняя остальные параметры. */
  function patch(changes: Record<string, string | string[] | null>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      next.delete(key);
      if (Array.isArray(value)) value.forEach((v) => next.append(key, v));
      else if (value !== null && value !== "") next.set(key, value);
    }
    setParams(next, { replace: true });
  }

  const toggleCond = (c: string) =>
    patch({ cond: conds.includes(c) ? conds.filter((x) => x !== c) : [...conds, c] });

  const resetFilters = () => {
    setMinP("");
    setMaxP("");
    patch({ cond: null, minPrice: null, maxPrice: null });
  };

  const hasFilters = conds.length > 0 || minP !== "" || maxP !== "";
  const items = data?.items ?? [];
  const gridCls = cols === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2 md:grid-cols-3 lg:grid-cols-4";
  const cats = categories ?? [];

  return (
    <div className="max-w-7xl mx-auto px-5 md:px-10">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 py-5 mono-label" style={{ color: "#1f232099" }}>
        <Link to="/" style={{ color: "#1f232099", textDecoration: "none" }} className="underline-link">Клауд</Link>
        <span>/</span>
        <Link to="/catalog" style={{ color: "#1f232099", textDecoration: "none" }} className="underline-link">Каталог</Link>
        {category && (<><span>/</span><span style={{ color: "#1f2320" }}>{category.label}</span></>)}
      </div>

      {/* Category hero */}
      <section className="grid md:grid-cols-12 gap-6 items-stretch pb-10">
        <div className="md:col-span-8 flex flex-col justify-between">
          <div>
            <span className="mono-label" style={{ color: "#1f232099" }}>
              {category
                ? `Раздел ${category.n} · ${category.count} лотов`
                : `Все разделы · ${data?.total ?? 0} ${plural(data?.total ?? 0)}`}
            </span>
            <h1 className="font-display mt-4" style={{ fontSize: "clamp(40px,7vw,88px)", fontWeight: 800, lineHeight: 0.9, letterSpacing: "-0.03em" }}>
              {q ? `«${q}»` : category ? category.label : "Весь каталог"}
            </h1>
            <p className="mt-4" style={{ fontSize: 15, lineHeight: 1.6, color: "#1f2320cc", maxWidth: 420 }}>
              {q
                ? "Результаты поиска по названию, описанию, городу и номеру лота."
                : category
                  ? category.blurb
                  : "Все лоты платформы Клауд — от автомобилей до предметов интерьера. Уточните поиск с помощью фильтров слева."}
            </p>
            {q && (
              <button onClick={() => patch({ q: null })} className="mono-label underline-link mt-4" style={{ background: "none", border: "none", cursor: "pointer", color: "#1f2320", padding: 0 }}>
                ✕ Сбросить поиск
              </button>
            )}
          </div>
          {/* Subcategory chips */}
          <div className="flex flex-wrap gap-2 mt-8">
            {cats.map((c) => (
              <Link key={c.slug} to={`/category/${c.slug}`} className="chip mono-label" style={{ border: "1px solid " + (c.slug === category?.slug ? "#1f2320" : "#1f232022"), background: c.slug === category?.slug ? "#1f2320" : "#f6f0e3", color: c.slug === category?.slug ? "#efe8da" : "#1f2320", borderRadius: 999, padding: "8px 14px", textDecoration: "none" }}>
                {c.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="md:col-span-4 overflow-hidden" style={{ borderRadius: 20, background: "#e1d9c8", minHeight: 220 }}>
          {(category?.img ?? cats[0]?.img) && (
            <img src={category?.img ?? cats[0].img} alt={category?.label ?? "Каталог"} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", filter: "grayscale(1) contrast(1.05)" }} />
          )}
        </div>
      </section>

      <Rule />

      {/* Body: filters + grid */}
      <div className="grid md:grid-cols-12 gap-8 py-8">
        {/* Filters */}
        <aside className="md:col-span-3">
          <div className="md:sticky md:top-40 flex flex-col gap-8">
            <div>
              <h3 className="mono-label mb-4" style={{ color: "#1f232099" }}>Состояние</h3>
              <div className="flex flex-col gap-3">
                {(filters?.conditions ?? []).map((c) => (
                  <label key={c} className="flex items-center gap-3 cursor-pointer" style={{ fontSize: 15 }}>
                    <span style={{ width: 18, height: 18, borderRadius: 6, border: "1px solid #1f2320", background: conds.includes(c) ? "#1f2320" : "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {conds.includes(c) && <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-6" stroke="#efe8da" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </span>
                    <input type="checkbox" checked={conds.includes(c)} onChange={() => toggleCond(c)} style={{ display: "none" }} />
                    {c}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <h3 className="mono-label mb-4" style={{ color: "#1f232099" }}>Цена, ₽</h3>
              <div className="flex items-center gap-2">
                <input type="number" min="0" placeholder="от" value={minP} onChange={(e) => { setMinP(e.target.value); patch({ minPrice: e.target.value }); }} className="w-full px-3 py-2.5 outline-none" style={priceField} />
                <span style={{ color: "#1f232066" }}>—</span>
                <input type="number" min="0" placeholder="до" value={maxP} onChange={(e) => { setMaxP(e.target.value); patch({ maxPrice: e.target.value }); }} className="w-full px-3 py-2.5 outline-none" style={priceField} />
              </div>
            </div>

            {hasFilters && (
              <button onClick={resetFilters} className="mono-label text-left underline-link" style={{ background: "none", border: "none", cursor: "pointer", color: "#1f2320", width: "fit-content" }}>
                ✕ Сбросить фильтры
              </button>
            )}
          </div>
        </aside>

        {/* Grid */}
        <div className="md:col-span-9">
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <span className="mono-label" style={{ color: "#1f232099" }}>
              {loading ? "Загрузка…" : `${data?.total ?? 0} ${plural(data?.total ?? 0)} найдено`}
            </span>
            <div className="flex items-center gap-3">
              <div className="flex gap-1">
                {SORTS.map((s) => (
                  <button key={s.key} onClick={() => patch({ sort: s.key })} className="mono-label" style={{ background: sort === s.key ? "#1f2320" : "transparent", color: sort === s.key ? "#efe8da" : "#1f2320", border: "1px solid " + (sort === s.key ? "#1f2320" : "#1f232033"), borderRadius: 999, cursor: "pointer", padding: "7px 12px" }}>{s.label}</button>
                ))}
              </div>
              <div className="hidden md:flex gap-1">
                {[2, 4].map((n) => (
                  <button key={n} onClick={() => setCols(n)} aria-label={`${n} колонки`} style={{ background: cols === n ? "#1f2320" : "transparent", border: "1px solid " + (cols === n ? "#1f2320" : "#1f232033"), borderRadius: 10, cursor: "pointer", width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="14" height="14" viewBox="0 0 14 14"><rect x="1" y="1" width={n === 2 ? 5 : 2.5} height="12" fill={cols === n ? "#efe8da" : "#1f2320"} /><rect x={n === 2 ? 8 : 4} y="1" width={n === 2 ? 5 : 2.5} height="12" fill={cols === n ? "#efe8da" : "#1f2320"} />{n === 4 && <><rect x="7" y="1" width="2.5" height="12" fill={cols === n ? "#efe8da" : "#1f2320"} /><rect x="10.5" y="1" width="2.5" height="12" fill={cols === n ? "#efe8da" : "#1f2320"} /></>}</svg>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {error ? (
            <ErrorState error={error} onRetry={reload} />
          ) : (
            <LotGrid items={items} loading={loading} className={`grid ${gridCls} gap-3`} />
          )}

          {/* Pagination */}
          {(data?.pages ?? 1) > 1 && (
            <div className="flex items-center justify-center gap-2 mt-10">
              <button disabled={page <= 1} onClick={() => patch({ page: String(page - 1) })} className="mono-label" style={pageBtn(false, page <= 1)}>← Назад</button>
              {Array.from({ length: data!.pages }, (_, i) => i + 1).map((p) => (
                <button key={p} onClick={() => patch({ page: String(p) })} className="mono-label" style={pageBtn(p === page, false)}>{p}</button>
              ))}
              <button disabled={page >= data!.pages} onClick={() => patch({ page: String(page + 1) })} className="mono-label" style={pageBtn(false, page >= data!.pages)}>Вперёд →</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const priceField = {
  border: "1px solid #1f232033",
  borderRadius: 12,
  background: "#f6f0e3",
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 12,
} as const;

const pageBtn = (active: boolean, disabled: boolean) =>
  ({
    background: active ? "#1f2320" : "transparent",
    color: active ? "#efe8da" : "#1f2320",
    border: "1px solid " + (active ? "#1f2320" : "#1f232033"),
    borderRadius: 999,
    padding: "9px 15px",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.4 : 1,
  }) as const;

function plural(n: number) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "лот";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "лота";
  return "лотов";
}
