import { useState } from "react";
import { Link, useParams } from "react-router";
import api, { ApiError, type PublisherShop } from "../api";
import { useAuth } from "../auth";
import { useAsync } from "../hooks";
import { EmptyState, LotGrid, Rule } from "../components";
import { plural } from "../Reviews";
import PublisherCabinet from "../PublisherCabinet";

/**
 * Издательский дом — страница тарифа «Издание».
 *
 * Гости и покупатели видят полосы издателя: обложку, витрины под ней и
 * подборку «Выбор издания». Владельцу дополнительно открыт кабинет.
 */
export default function Publisher() {
  const { id } = useParams();
  const { user } = useAuth();
  const [tab, setTab] = useState<"Полосы издателя" | "Издательский кабинет">("Полосы издателя");

  const { data, loading, error } = useAsync(() => api.publisher(id!), [id]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-5 md:px-10 py-32 text-center">
        <span className="mono-label" style={{ color: "#1f232099" }}>Загрузка…</span>
      </div>
    );
  }

  if (error || !data) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <div className="max-w-7xl mx-auto px-5 md:px-10 py-32 text-center">
        <p className="font-display" style={{ fontSize: 40 }}>
          {notFound ? "Издание не найдено" : "Не удалось загрузить"}
        </p>
        <Link to="/catalog" className="mono-label underline-link" style={{ color: "#1f2320", textDecoration: "none" }}>
          ← Вернуться в каталог
        </Link>
      </div>
    );
  }

  const { publisher, shops, picks, stats } = data;
  const isOwner = user?.userId === publisher.userId;

  return (
    <div className="max-w-7xl mx-auto px-5 md:px-10">
      <div className="flex items-center gap-2 py-5 mono-label" style={{ color: "#1f232099" }}>
        <Link to="/" style={{ color: "#1f232099", textDecoration: "none" }} className="underline-link">Клауд</Link>
        <span>/</span><span>Издатели</span>
        <span>/</span><span style={{ color: "#1f2320" }}>{publisher.brand}</span>
      </div>

      {/* Обложка издания */}
      <div
        className="relative flex items-end"
        style={{ background: "#1f2320", borderRadius: 20, overflow: "hidden", minHeight: 320 }}
      >
        {publisher.cover && (
          <img
            src={publisher.cover}
            alt=""
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "grayscale(1) brightness(0.5)" }}
          />
        )}
        <div className="relative" style={{ padding: "clamp(22px,3.5vw,40px)" }}>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="mono-label" style={{ background: "#efe8da", color: "#1f2320", borderRadius: 999, padding: "6px 14px" }}>
              ✳ Издание
            </span>
            <span className="mono-label" style={{ color: "#efe8dabb" }}>
              Издательский дом · {stats.shops} {plural(stats.shops, "витрина", "витрины", "витрин")}
            </span>
          </div>
          <h1 className="font-display m-0 mt-5" style={{ fontSize: "clamp(34px,6vw,74px)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 0.92, color: "#efe8da" }}>
            {publisher.brand}
          </h1>
          {publisher.tagline && (
            <p className="font-display m-0 mt-4" style={{ fontSize: "clamp(17px,2.4vw,26px)", fontStyle: "italic", lineHeight: 1.25, color: "#efe8dadd", maxWidth: 620 }}>
              {publisher.tagline}
            </p>
          )}
        </div>
      </div>

      {/* Вкладки */}
      <section className="flex items-center justify-between gap-4 flex-wrap py-6">
        <div className="flex gap-2 flex-wrap">
          {(["Полосы издателя", "Издательский кабинет"] as const)
            .filter((t) => t === "Полосы издателя" || isOwner)
            .map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="mono-label"
                style={{
                  border: "1px solid #1f232033",
                  background: tab === t ? "#1f2320" : "transparent",
                  color: tab === t ? "#efe8da" : "#1f2320",
                  borderRadius: 999,
                  padding: "13px 24px",
                  cursor: "pointer",
                }}
              >
                {t}
              </button>
            ))}
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <Link to={`/seller/${publisher.id}?plain=1`} className="mono-label underline-link" style={{ color: "#1f232099", textDecoration: "none" }}>
            Профиль продавца
          </Link>
          <span className="mono-label" style={{ color: "#1f232099" }}>На Клауд с {stats.since}</span>
        </div>
      </section>

      {tab === "Издательский кабинет" && isOwner ? (
        <PublisherCabinet slug={publisher.id} />
      ) : (
        <>
          {/* Об издателе */}
          <section className="grid md:grid-cols-12 gap-8 md:gap-12 pb-10">
            <div className="md:col-span-7">
              <h2 className="mono-label mb-4" style={{ color: "#1f232099" }}>Об издателе</h2>
              <p className="m-0" style={{ fontSize: 17, lineHeight: 1.7, color: "#1f2320dd", maxWidth: 560 }}>
                {publisher.about || "Издатель пока не заполнил описание."}
              </p>
            </div>
            <div className="md:col-span-5">
              <div className="grid grid-cols-3 gap-px" style={{ background: "#1f232022", border: "1px solid #1f232022", borderRadius: 16, overflow: "hidden" }}>
                <Cell v={String(stats.shops)} k={plural(stats.shops, "витрина", "витрины", "витрин")} />
                <Cell v={String(stats.lots)} k={plural(stats.lots, "лот", "лота", "лотов")} />
                <Cell v={stats.since} k="с года" />
              </div>
            </div>
          </section>

          <div style={{ height: 3, background: "#1f2320" }} />

          {/* Витрины под обложкой */}
          <section className="py-10">
            <h2 className="font-display m-0 mb-6" style={{ fontSize: "clamp(28px,4vw,48px)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1 }}>
              Витрины под обложкой
            </h2>
            {shops.length ? (
              <div className="grid md:grid-cols-3 gap-4">
                {shops.map((shop, i) => <ShopCard key={shop.id} shop={shop} n={i + 1} />)}
              </div>
            ) : (
              <EmptyState
                title="Витрины ещё не подключены"
                hint={isOwner
                  ? "Позовите магазины во вкладке «Издательский кабинет»"
                  : "Издатель ещё не собрал витрины под обложкой"}
              />
            )}
          </section>

          <Rule />

          {/* Полоса на главной */}
          <section className="py-10 pb-16">
            <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
              <div>
                <span className="mono-label" style={{ color: "#1f232099" }}>✳ Полоса на главной Клауд</span>
                <h2 className="font-display m-0 mt-3" style={{ fontSize: "clamp(28px,4vw,48px)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1 }}>
                  Выбор издания
                </h2>
              </div>
              <Link to="/" className="mono-label underline-link" style={{ color: "#1f2320", textDecoration: "none" }}>
                Как это на главной →
              </Link>
            </div>
            <LotGrid
              items={picks}
              className="grid grid-cols-2 lg:grid-cols-4 gap-4"
              empty={<EmptyState title="Подборка пока пуста" hint="Издатель собирает её в своём кабинете" />}
            />
          </section>
        </>
      )}
    </div>
  );
}

function Cell({ v, k }: { v: string; k: string }) {
  return (
    <div className="p-5" style={{ background: "#f6f0e3" }}>
      <p className="font-display m-0" style={{ fontSize: "clamp(24px,3vw,34px)", fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1 }}>{v}</p>
      <p className="mono-label m-0 mt-2" style={{ color: "#1f232099" }}>{k}</p>
    </div>
  );
}

function ShopCard({ shop, n }: { shop: PublisherShop; n: number }) {
  return (
    <div className="flex flex-col p-6" style={{ border: "1px solid #1f232033", borderRadius: 18 }}>
      <span className="font-display" style={{ fontSize: 22, fontWeight: 700, color: "#1f232055" }}>
        {String(n).padStart(2, "0")}
      </span>
      <h3 className="font-display m-0 mt-3" style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
        {shop.brand}
      </h3>
      <p className="mono-label m-0 mt-2" style={{ color: "#1f232099" }}>
        {shop.city} · {shop.lots} {plural(shop.lots, "лот", "лота", "лотов")}
      </p>
      <Link to={`/shop/${shop.id}`} className="mono-label underline-link mt-5" style={{ color: "#1f2320", textDecoration: "none" }}>
        Открыть витрину →
      </Link>
    </div>
  );
}
