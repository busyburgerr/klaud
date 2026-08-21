import { useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router";
import api, { ApiError } from "../api";
import { useAuth } from "../auth";
import { useAsync } from "../hooks";
import { EmptyState, LotGrid, Rule } from "../components";
import { ReviewList, ReviewSummaryCard } from "../Reviews";

export default function Seller() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);

  const { data: seller, loading, error } = useAsync(() => api.seller(id!), [id]);
  const { data: listings, loading: listingsLoading } = useAsync(
    () => api.sellerListings(id!, { limit: 24 }),
    [id],
  );
  const { data: reviews } = useAsync(() => api.userReviews(id!), [id]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-5 md:px-10 py-32 text-center">
        <span className="mono-label" style={{ color: "#1f232099" }}>Загрузка…</span>
      </div>
    );
  }

  if (error || !seller) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <div className="max-w-7xl mx-auto px-5 md:px-10 py-32 text-center">
        <p className="font-display" style={{ fontSize: 40 }}>{notFound ? "Продавец не найден" : "Не удалось загрузить"}</p>
        <Link to="/catalog" className="mono-label underline-link" style={{ color: "#1f2320", textDecoration: "none" }}>← Вернуться в каталог</Link>
      </div>
    );
  }

  // У продавца с оформленным магазином страница — это витрина, а у издателя —
  // страница дома. `?plain=1` оставляет обычный профиль: ссылка на него есть
  // и на витрине, и на странице издания.
  if (seller.plan.storefront && !params.has("plain")) {
    return <Navigate to={seller.plan.key === "edition" ? `/publisher/${id}` : `/shop/${id}`} replace />;
  }

  const items = listings?.items ?? [];
  const isMe = user?.userId === seller.userId;

  /** Пишем продавцу по его свежему лоту — отдельного «личного» чата нет. */
  const write = async () => {
    if (!user) {
      navigate(`/login?next=${encodeURIComponent(`/seller/${id}`)}`);
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

  const STATS = [
    { k: "На Клауд с", v: seller.since },
    { k: "Сделок", v: String(reviews?.summary.successful ?? seller.deals) },
    { k: "Рейтинг", v: reviews?.summary.rating ? `★ ${reviews.summary.rating}` : "—" },
    { k: "Активных лотов", v: String(seller.activeListings) },
  ];

  return (
    <div className="max-w-7xl mx-auto px-5 md:px-10">
      <div className="flex items-center gap-2 py-5 mono-label" style={{ color: "#1f232099" }}>
        <Link to="/" style={{ color: "#1f232099", textDecoration: "none" }} className="underline-link">Клауд</Link>
        <span>/</span><span>Продавцы</span>
        <span>/</span><span style={{ color: "#1f2320" }}>{seller.name}</span>
      </div>

      {/* Header */}
      <section className="grid md:grid-cols-12 gap-8 items-end pb-8">
        <div className="md:col-span-8 flex items-center gap-6">
          <div className="flex items-center justify-center font-display relative" style={{ width: 96, height: 96, borderRadius: "50%", background: "#1f2320", color: "#efe8da", fontSize: 44, flexShrink: 0 }}>
            {seller.initial}
            {seller.online && <span style={{ position: "absolute", bottom: 6, right: 6, width: 16, height: 16, borderRadius: "50%", background: "#1f2320", border: "3px solid #efe8da" }} />}
          </div>
          <div>
            <span className="mono-label" style={{ color: "#1f232099" }}>
              {seller.type} · {seller.city}{seller.online ? " · в сети" : ""}
            </span>
            <h1 className="font-display mt-2" style={{ fontSize: "clamp(34px,5vw,64px)", fontWeight: 800, lineHeight: 0.9, letterSpacing: "-0.03em" }}>{seller.name}</h1>
          </div>
        </div>
        {!isMe && (
          <div className="md:col-span-4 flex md:justify-end gap-3">
            <button onClick={write} disabled={busy || !items.length} className="mono-label flex-1 md:flex-none" style={{ background: "#1f2320", color: "#efe8da", border: "none", borderRadius: 999, padding: "16px 28px", cursor: items.length ? "pointer" : "default", opacity: items.length && !busy ? 1 : 0.6 }}>
              {busy ? "Открываем…" : "Написать"}
            </button>
          </div>
        )}
      </section>

      <Rule />

      {/* Stats + bio */}
      <section className="grid md:grid-cols-12 gap-8 py-8">
        <div className="md:col-span-4">
          <div className="grid grid-cols-2 gap-px" style={{ background: "#1f232022", border: "1px solid #1f232022", borderRadius: 16, overflow: "hidden" }}>
            {STATS.map((s) => (
              <div key={s.k} className="p-5" style={{ background: "#f6f0e3" }}>
                <p className="font-display m-0" style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.01em" }}>{s.v}</p>
                <p className="mono-label m-0 mt-1" style={{ color: "#1f232099" }}>{s.k}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="md:col-span-8">
          <h2 className="mono-label mb-3" style={{ color: "#1f232099" }}>О продавце</h2>
          <p style={{ fontSize: 17, lineHeight: 1.7, color: "#1f2320dd", maxWidth: 560 }}>
            {seller.bio || "Продавец пока не заполнил описание."}
          </p>
        </div>
      </section>

      <Rule />

      {/* Listings */}
      <section className="py-8 pb-16">
        <div className="flex items-end justify-between mb-6">
          <h2 className="font-display" style={{ fontSize: "clamp(24px,3vw,40px)", fontWeight: 800, letterSpacing: "-0.02em" }}>Лоты продавца</h2>
          <span className="mono-label" style={{ color: "#1f232099" }}>{listings?.total ?? 0}</span>
        </div>
        <LotGrid
          items={items}
          loading={listingsLoading}
          className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3"
          empty={<EmptyState title="Активных лотов нет" />}
        />
      </section>

      <Rule />

      {/* Отзывы о сделках */}
      <section className="py-8 pb-16">
        <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
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
