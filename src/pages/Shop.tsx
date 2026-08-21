import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import api, { ApiError } from "../api";
import { useAuth } from "../auth";
import { useAsync } from "../hooks";
import { EmptyState, LotGrid, Rule } from "../components";
import { plural, ReviewList, ReviewSummaryCard } from "../Reviews";
import { ShopCover } from "../ShopCover";

/**
 * Публичная витрина продавца на тарифах «Витрина» и «Издание».
 *
 * Сюда же попадают ссылки на страницу продавца: если магазин оформлен,
 * покупатель видит его, а не обычный список лотов.
 */
export default function Shop() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);

  const { data, loading, error } = useAsync(() => api.shop(id!), [id]);
  const { data: reviews } = useAsync(() => api.userReviews(id!), [id]);

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
          {notFound ? "Витрина не найдена" : "Не удалось загрузить"}
        </p>
        <Link to="/catalog" className="mono-label underline-link" style={{ color: "#1f2320", textDecoration: "none" }}>
          ← Вернуться в каталог
        </Link>
      </div>
    );
  }

  const { seller, storefront: shop, sections, items, total } = data;
  const isMe = user?.userId === seller.userId;

  /** Пишем продавцу по его свежему лоту — отдельного «личного» чата нет. */
  const write = async () => {
    if (!user) {
      navigate(`/login?next=${encodeURIComponent(`/shop/${id}`)}`);
      return;
    }
    if (!items.length) return;

    setBusy(true);
    try {
      const thread = await api.startThread(items[0].id);
      navigate(`/messages?thread=${thread.id}`);
    } catch {
      setBusy(false);
    }
  };

  const CONDITIONS = [
    { k: "Часы работы", v: shop.conditions.hours },
    { k: "Доставка", v: shop.conditions.delivery },
    { k: "Гарантия", v: shop.conditions.warranty },
    { k: "Скорость ответа", v: seller.online ? "Продавец сейчас в сети" : "" },
  ].filter((c) => c.v);

  return (
    <div className="max-w-7xl mx-auto px-5 md:px-10">
      <div className="flex items-center gap-2 py-5 mono-label" style={{ color: "#1f232099" }}>
        <Link to="/" style={{ color: "#1f232099", textDecoration: "none" }} className="underline-link">Клауд</Link>
        <span>/</span><span>Магазины</span>
        <span>/</span><span style={{ color: "#1f2320" }}>{shop.brand}</span>
      </div>

      {/* Полоса бренда */}
      <ShopCover
        name={seller.name}
        brand={shop.brand}
        tagline={shop.tagline}
        cover={shop.cover}
        initial={seller.initial}
        city={seller.city}
        links={shop.links}
      />

      {/* Действия и краткие цифры */}
      <section className="flex items-center justify-between gap-4 flex-wrap py-6">
        <div className="flex gap-6 flex-wrap">
          <Stat k="тариф" v={seller.plan.label} />
          <Stat k="лотов в продаже" v={String(total)} />
          <Stat k="сделок" v={String(reviews?.summary.successful ?? seller.deals)} />
          <Stat k="рейтинг" v={reviews?.summary.rating ? `★ ${reviews.summary.rating}` : "—"} />
        </div>
        <div className="flex gap-3 flex-wrap">
          {seller.plan.key === "edition" && (
            <Link to={`/publisher/${seller.id}`} className="mono-label" style={{ border: "1px solid #1f2320", color: "#1f2320", borderRadius: 999, padding: "14px 24px", textDecoration: "none" }}>
              Издательский дом →
            </Link>
          )}
          <Link to={`/seller/${seller.id}?plain=1`} className="mono-label" style={{ border: "1px solid #1f2320", color: "#1f2320", borderRadius: 999, padding: "14px 24px", textDecoration: "none" }}>
            Профиль продавца
          </Link>
          {!isMe && (
            <button onClick={write} disabled={busy || !items.length} className="mono-label" style={{ background: "#1f2320", color: "#efe8da", border: "none", borderRadius: 999, padding: "14px 28px", cursor: items.length ? "pointer" : "default", opacity: items.length && !busy ? 1 : 0.6 }}>
              {busy ? "Открываем…" : "Написать продавцу"}
            </button>
          )}
          {isMe && (
            <Link to="/account" className="mono-label" style={{ background: "#1f2320", color: "#efe8da", borderRadius: 999, padding: "14px 28px", textDecoration: "none" }}>
              Настроить витрину
            </Link>
          )}
        </div>
      </section>

      <Rule />

      {/* О магазине и условия */}
      <section className="grid md:grid-cols-12 gap-8 md:gap-12 py-10">
        <div className="md:col-span-7">
          <h2 className="mono-label mb-4" style={{ color: "#1f232099" }}>О магазине</h2>
          <p className="m-0" style={{ fontSize: 17, lineHeight: 1.7, color: "#1f2320dd", maxWidth: 560 }}>
            {shop.about || "Продавец пока не заполнил описание."}
          </p>
        </div>
        {CONDITIONS.length > 0 && (
          <div className="md:col-span-5">
            <h2 className="mono-label mb-4" style={{ color: "#1f232099" }}>Условия</h2>
            <div style={{ border: "1px solid #1f232033", borderRadius: 16, overflow: "hidden" }}>
              {CONDITIONS.map((c, i) => (
                <div key={c.k} className="flex items-center justify-between gap-4 px-5 py-4" style={{ borderTop: i ? "1px solid #1f232022" : "none" }}>
                  <span className="mono-label" style={{ color: "#1f232099" }}>{c.k}</span>
                  <span style={{ fontSize: 15, textAlign: "right" }}>{c.v}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Лоты: по разделам («Издание») или одной сеткой */}
      {sections.length > 0 ? (
        sections.map((section, i) => (
          <section key={section.id ?? i} className="pb-12">
            <div style={{ height: 3, background: "#1f2320" }} />
            <div className="flex items-end justify-between gap-4 flex-wrap py-6">
              <div className="flex items-baseline gap-4">
                <span className="mono-label" style={{ color: "#1f232066" }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h2 className="font-display m-0" style={{ fontSize: "clamp(28px,4vw,46px)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1 }}>
                    {section.title}
                  </h2>
                  {section.blurb && (
                    <p className="m-0 mt-2" style={{ fontSize: 15, color: "#1f2320cc" }}>{section.blurb}</p>
                  )}
                </div>
              </div>
              <span className="mono-label" style={{ color: "#1f232099" }}>
                {section.items.length} {plural(section.items.length, "лот", "лота", "лотов")}
              </span>
            </div>
            <LotGrid items={section.items} className="grid grid-cols-2 lg:grid-cols-3 gap-4" />
          </section>
        ))
      ) : (
        <section className="pb-12">
          <div style={{ height: 3, background: "#1f2320" }} />
          <div className="flex items-end justify-between gap-4 flex-wrap py-6">
            <h2 className="font-display m-0" style={{ fontSize: "clamp(28px,4vw,46px)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1 }}>
              Лоты магазина
            </h2>
            <span className="mono-label" style={{ color: "#1f232099" }}>{total}</span>
          </div>
          <LotGrid
            items={items}
            className="grid grid-cols-2 lg:grid-cols-3 gap-4"
            empty={<EmptyState title="В магазине пока нет лотов" />}
          />
        </section>
      )}

      {/* Отзывы */}
      <section className="pb-16">
        <Rule />
        <div className="flex items-end justify-between mb-6 flex-wrap gap-3 pt-10">
          <h2 className="font-display" style={{ fontSize: "clamp(24px,3vw,40px)", fontWeight: 800, letterSpacing: "-0.02em" }}>Отзывы</h2>
          <span className="mono-label" style={{ color: "#1f232099" }}>оставляют покупатели после сделки</span>
        </div>
        {reviews && reviews.summary.total > 0 && (
          <div className="mb-8"><ReviewSummaryCard summary={reviews.summary} /></div>
        )}
        <ReviewList items={reviews?.items ?? []} empty="Отзывов о продавце пока нет" />
      </section>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <p className="font-display m-0" style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.01em", lineHeight: 1 }}>{v}</p>
      <p className="mono-label m-0 mt-1" style={{ color: "#1f232099" }}>{k}</p>
    </div>
  );
}
