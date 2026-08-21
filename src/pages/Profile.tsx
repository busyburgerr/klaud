import { useState } from "react";
import { Link, useNavigate } from "react-router";
import api, { ApiError, type Listing, type PendingReview, type Profile as ProfileUser } from "../api";
import { useAuth } from "../auth";
import { useAsync } from "../hooks";
import { EmptyState, FieldError, LotGrid, Rule } from "../components";
import { ReviewList, ReviewSummaryCard, Stars } from "../Reviews";
import { useWish } from "../store";
import StorefrontEditor, { planDate } from "../StorefrontEditor";

const TABS = ["Обзор", "Витрина", "Мои объявления", "Избранное", "Отзывы", "Настройки"] as const;
type Tab = (typeof TABS)[number];

export default function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("Обзор");

  const { data: stats, reload: reloadStats } = useAsync(() => api.profileStats(), []);
  const { data: mine, loading: mineLoading, reload: reloadMine } = useAsync(() => api.myListings({ limit: 48 }), []);
  const { data: saved, loading: savedLoading } = useAsync(() => api.favorites(), [tab === "Избранное"]);
  const { data: pending, reload: reloadPending } = useAsync(() => api.pendingReviews(), []);

  if (!user) return null;

  // Вкладка «Витрина» есть только на платных тарифах.
  const tabs = TABS.filter((t) => t !== "Витрина" || user.plan.storefront);
  const myItems = mine?.items ?? [];
  const savedItems = saved?.items ?? [];

  const STATS = [
    { v: String(stats?.listings.active ?? 0), k: "активных лотов" },
    { v: String(stats?.saved ?? 0), k: "в избранном" },
    { v: String(stats?.deals ?? user.deals), k: "сделок" },
    { v: `★ ${stats?.rating ?? user.rating}`, k: "рейтинг" },
  ];

  const signOut = async () => {
    await logout();
    navigate("/");
  };

  return (
    <div className="max-w-7xl mx-auto px-5 md:px-10">
      <div className="flex items-center gap-2 py-5 mono-label" style={{ color: "#1f232099" }}>
        <Link to="/" style={{ color: "#1f232099", textDecoration: "none" }} className="underline-link">Клауд</Link>
        <span>/</span><span style={{ color: "#1f2320" }}>Личный кабинет</span>
      </div>

      {/* Header */}
      <section className="grid md:grid-cols-12 gap-6 items-end pb-8">
        <div className="md:col-span-8 flex items-center gap-6">
          <div className="flex items-center justify-center font-display" style={{ width: 96, height: 96, borderRadius: "50%", background: "#1f2320", color: "#efe8da", fontSize: 44, flexShrink: 0 }}>{user.initial}</div>
          <div>
            <span className="mono-label flex items-center gap-2 flex-wrap" style={{ color: "#1f232099" }}>
              На Клауд с {user.since} · {user.city}
              <PlanBadge plan={user.plan} />
            </span>
            <h1 className="font-display mt-2" style={{ fontSize: "clamp(34px,5vw,64px)", fontWeight: 800, lineHeight: 0.9, letterSpacing: "-0.03em" }}>{user.name}</h1>
          </div>
        </div>
        <div className="md:col-span-4 flex md:justify-end gap-3">
          <Link to="/new" className="mono-label flex-1 md:flex-none text-center" style={{ background: "#1f2320", color: "#efe8da", borderRadius: 999, padding: "16px 28px", textDecoration: "none" }}>Разместить лот</Link>
          <button onClick={signOut} className="mono-label text-center" style={{ border: "1px solid #1f2320", background: "transparent", borderRadius: 999, padding: "16px 24px", color: "#1f2320", cursor: "pointer" }}>Выйти</button>
        </div>
      </section>

      {/* Tabs */}
      <div className="flex gap-6 overflow-x-auto" style={{ borderBottom: "1px solid #1f232022" }}>
        {tabs.map((t) => (
          <button key={t} onClick={() => setTab(t)} className="mono-label" style={{ background: "none", border: "none", cursor: "pointer", color: tab === t ? "#1f2320" : "#1f232099", padding: "16px 0", borderBottom: "2px solid " + (tab === t ? "#1f2320" : "transparent"), whiteSpace: "nowrap", marginBottom: -1 }}>
            {t}{t === "Избранное" && stats?.saved ? ` · ${stats.saved}` : ""}
            {t === "Отзывы" && pending?.length ? ` · ${pending.length}` : ""}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {tab === "Обзор" && (
        <div className="py-8">
          {user.plan.storefront && (
            <div className="flex items-center justify-between gap-5 flex-wrap mb-10" style={{ background: "#1f2320", color: "#efe8da", borderRadius: 18, padding: "clamp(20px,3vw,30px)" }}>
              <div>
                <span className="mono-label" style={{ color: "#efe8daaa" }}>
                  ✳ Тариф «{user.plan.label}»
                  {planDate(user.plan.until) ? ` · активен до ${planDate(user.plan.until)}` : ""}
                </span>
                <p className="font-display m-0 mt-3" style={{ fontSize: "clamp(22px,3vw,34px)", fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.05 }}>
                  {user.plan.key === "edition"
                    ? "Ваше издание ведёт полосу на главной Клауд"
                    : "Ваш магазин оформлен как полоса бренда"}
                </p>
              </div>
              <div className="flex gap-3 flex-wrap">
                <button onClick={() => setTab("Витрина")} className="mono-label" style={{ border: "1px solid #efe8da44", background: "transparent", color: "#efe8da", borderRadius: 999, padding: "14px 26px", cursor: "pointer" }}>
                  Настроить витрину →
                </button>
                {user.plan.key === "edition" && (
                  <Link to={`/publisher/${user.id}`} className="mono-label" style={{ background: "#efe8da", color: "#1f2320", borderRadius: 999, padding: "14px 26px", textDecoration: "none" }}>
                    Кабинет издателя →
                  </Link>
                )}
              </div>
            </div>
          )}

          {user.plan.expired && (
            <p className="mono-label mb-10" style={{ color: "#a33", background: "#f6f0e3", border: "1px solid #1f232022", borderRadius: 12, padding: "14px 16px" }}>
              Срок тарифа истёк — магазин показывается как обычная страница продавца.
              Оформление сохранено, обратитесь к администрации для продления.
            </p>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-px mb-10" style={{ background: "#1f232022", border: "1px solid #1f232022", borderRadius: 16, overflow: "hidden" }}>
            {STATS.map((s) => (
              <div key={s.k} className="p-6" style={{ background: "#f6f0e3" }}>
                <p className="font-display m-0" style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1 }}>{s.v}</p>
                <p className="mono-label m-0 mt-2" style={{ color: "#1f232099" }}>{s.k}</p>
              </div>
            ))}
          </div>

          {(pending?.length ?? 0) > 0 && (
            <div className="mb-8" style={{ border: "1px solid #1f232022", borderRadius: 16, background: "#f6f0e3", padding: "18px 20px" }}>
              <span className="mono-label" style={{ color: "#1f232099" }}>Оцените сделки</span>
              <p className="m-0 mt-2" style={{ fontSize: 15, lineHeight: 1.5 }}>
                По {pending!.length} {pending!.length === 1 ? "покупке" : "покупкам"} можно оставить отзыв продавцу.
              </p>
              <button onClick={() => setTab("Отзывы")} className="mono-label mt-3" style={{ background: "#1f2320", color: "#efe8da", border: "none", borderRadius: 999, padding: "12px 24px", cursor: "pointer" }}>
                Оставить отзыв
              </button>
            </div>
          )}

          {(stats?.listings.pending ?? 0) > 0 && (
            <p className="mono-label mb-8" style={{ color: "#1f232099", background: "#f6f0e3", border: "1px solid #1f232022", borderRadius: 12, padding: "14px 16px" }}>
              {stats!.listings.pending} лот(а) на проверке · после публикации они появятся в каталоге
            </p>
          )}

          <div className="flex items-end justify-between mb-6">
            <h2 className="font-display" style={{ fontSize: "clamp(22px,3vw,34px)", fontWeight: 800, letterSpacing: "-0.02em" }}>Мои объявления</h2>
            <button onClick={() => setTab("Мои объявления")} className="mono-label underline-link" style={{ background: "none", border: "none", cursor: "pointer", color: "#1f2320" }}>Все →</button>
          </div>
          <LotGrid
            items={myItems.slice(0, 4)}
            loading={mineLoading}
            skeletons={4}
            empty={<EmptyState title="Вы ещё не разместили ни одного лота" action={<Link to="/new" className="mono-label" style={{ background: "#1f2320", color: "#efe8da", borderRadius: 999, padding: "14px 32px", textDecoration: "none" }}>Разместить лот</Link>} />}
          />
        </div>
      )}

      {/* ── STOREFRONT ── */}
      {tab === "Витрина" && <StorefrontEditor />}

      {/* ── MY LISTINGS ── */}
      {tab === "Мои объявления" && (
        <MyListings items={myItems} loading={mineLoading} onChange={() => { reloadMine(); reloadStats(); }} />
      )}

      {/* ── SAVED ── */}
      {tab === "Избранное" && (
        <div className="py-8">
          <LotGrid
            items={savedItems}
            loading={savedLoading}
            empty={
              <EmptyState
                title="В избранном пока пусто"
                hint="Отмечайте лоты сердечком — они появятся здесь"
                action={<Link to="/catalog" className="mono-label" style={{ background: "#1f2320", color: "#efe8da", borderRadius: 999, padding: "14px 32px", textDecoration: "none" }}>В каталог</Link>}
              />
            }
          />
        </div>
      )}

      {/* ── REVIEWS ── */}
      {tab === "Отзывы" && (
        <ReviewsTab
          userSlug={user.id}
          pending={pending ?? []}
          onChange={() => { reloadPending(); reloadStats(); }}
        />
      )}

      {/* ── SETTINGS ── */}
      {tab === "Настройки" && <Settings user={user} />}
    </div>
  );
}

/**
 * Вкладка «Отзывы»: что можно оценить после покупки и что написали о вас.
 */
function ReviewsTab({
  userSlug,
  pending,
  onChange,
}: {
  userSlug: string;
  pending: PendingReview[];
  onChange: () => void;
}) {
  const { data: mine, reload } = useAsync(() => api.userReviews(userSlug), []);
  const [form, setForm] = useState<PendingReview | null>(null);

  return (
    <div className="py-8 flex flex-col gap-10">
      {/* Сделки, ждущие оценки */}
      {pending.length > 0 && (
        <div>
          <h2 className="mono-label mb-4" style={{ color: "#1f232099" }}>Оцените покупки</h2>
          <div className="flex flex-col" style={{ border: "1px solid #1f232022", borderRadius: 16, overflow: "hidden" }}>
            {pending.map((p, i) => (
              <div key={p.listingId} className="flex items-center gap-4 p-4" style={{ background: "#f6f0e3", borderTop: i ? "1px solid #1f232022" : "none" }}>
                <Link to={`/lot/${p.listingId}`} className="overflow-hidden" style={{ width: 56, height: 70, borderRadius: 10, background: "#e1d9c8", flexShrink: 0 }}>
                  {p.img && <img src={p.img} alt={p.title} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
                </Link>
                <div className="flex-1 min-w-0">
                  <Link to={`/lot/${p.listingId}`} style={{ fontSize: 15, fontWeight: 600, color: "#1f2320", textDecoration: "none" }} className="underline-link">{p.title}</Link>
                  <p className="mono-label m-0 mt-1" style={{ color: "#1f232099" }}>
                    Лот {p.lot} · продавец <Link to={`/seller/${p.seller.id}`} style={{ color: "#1f2320" }} className="underline-link">{p.seller.name}</Link>
                  </p>
                </div>
                <button onClick={() => setForm(p)} className="mono-label flex-shrink-0" style={{ background: "#1f2320", color: "#efe8da", border: "none", borderRadius: 999, padding: "10px 20px", cursor: "pointer" }}>
                  Оценить
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Отзывы обо мне */}
      <div>
        <h2 className="mono-label mb-4" style={{ color: "#1f232099" }}>Отзывы обо мне</h2>
        {mine && mine.summary.total > 0 && (
          <div className="mb-6"><ReviewSummaryCard summary={mine.summary} /></div>
        )}
        <ReviewList items={mine?.items ?? []} empty="О вас пока не оставили отзывов" />
      </div>

      {form && (
        <ReviewForm
          deal={form}
          onClose={() => setForm(null)}
          onDone={() => { setForm(null); reload(); onChange(); }}
        />
      )}
    </div>
  );
}

/** Форма отзыва: оценка, состоялась ли сделка и комментарий. */
function ReviewForm({ deal, onClose, onDone }: { deal: PendingReview; onClose: () => void; onDone: () => void }) {
  const [rating, setRating] = useState(5);
  const [success, setSuccess] = useState(true);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await api.leaveReview({ listingId: deal.listingId, rating, dealSuccess: success, text });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось отправить отзыв");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-5" style={{ background: "#1f232099" }} onClick={onClose}>
      <div className="w-full" style={{ maxWidth: 460, background: "#efe8da", borderRadius: 20, padding: 28 }} onClick={(e) => e.stopPropagation()}>
        <span className="mono-label" style={{ color: "#1f232099" }}>Лот {deal.lot} · {deal.seller.name}</span>
        <h3 className="font-display mt-2 mb-4" style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>Как прошла сделка?</h3>

        {error && <p className="mono-label mb-4" style={{ color: "#a33" }}>{error}</p>}

        <div className="flex items-center gap-2 mb-5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => setRating(n)} aria-label={`Оценка ${n}`} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 30, lineHeight: 1, color: n <= rating ? "#1f2320" : "#1f232033" }}>
              ★
            </button>
          ))}
          <span className="mono-label ml-2" style={{ color: "#1f232099" }}>{rating} из 5</span>
        </div>

        <div className="flex gap-2 mb-5">
          {[true, false].map((v) => (
            <button key={String(v)} type="button" onClick={() => setSuccess(v)} className="mono-label" style={{ flex: 1, background: success === v ? "#1f2320" : "transparent", color: success === v ? "#efe8da" : "#1f2320", border: "1px solid " + (success === v ? "#1f2320" : "#1f232033"), borderRadius: 999, padding: "11px 16px", cursor: "pointer" }}>
              {v ? "Сделка состоялась" : "Сделка не состоялась"}
            </button>
          ))}
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          maxLength={1000}
          placeholder="Расскажите, как прошла сделка: связь, состояние вещи, доставка"
          style={{ border: "1px solid #1f232033", borderRadius: 14, background: "#f6f0e3", padding: "14px 16px", fontSize: 15, outline: "none", width: "100%", resize: "vertical", lineHeight: 1.5 }}
        />

        <div className="flex gap-3 mt-5 justify-end">
          <button onClick={onClose} className="mono-label" style={{ background: "transparent", border: "1px solid #1f232033", borderRadius: 999, padding: "12px 22px", cursor: "pointer", color: "#1f2320" }}>Отмена</button>
          <button onClick={submit} disabled={busy} className="mono-label" style={{ background: "#1f2320", color: "#efe8da", border: "none", borderRadius: 999, padding: "12px 22px", cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
            {busy ? "Отправляем…" : "Отправить отзыв"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Вкладка «Мои объявления»: публикация, снятие и удаление лота. */
function MyListings({ items, loading, onChange }: { items: Listing[]; loading: boolean; onChange: () => void }) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [selling, setSelling] = useState<Listing | null>(null);
  const { sync } = useWish();

  const act = async (id: number, run: () => Promise<unknown>) => {
    setBusyId(id);
    try {
      await run();
      onChange();
      api.favoriteIds().then(sync).catch(() => {});
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="py-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <span className="mono-label" style={{ color: "#1f232099" }}>{items.length} лотов</span>
        <Link to="/new" className="mono-label" style={{ background: "#1f2320", color: "#efe8da", borderRadius: 999, padding: "12px 22px", textDecoration: "none" }}>+ Новый лот</Link>
      </div>

      {loading ? (
        <LotGrid items={[]} loading />
      ) : items.length === 0 ? (
        <EmptyState title="Объявлений пока нет" action={<Link to="/new" className="mono-label" style={{ background: "#1f2320", color: "#efe8da", borderRadius: 999, padding: "14px 32px", textDecoration: "none" }}>Разместить лот</Link>} />
      ) : (
        <div className="flex flex-col" style={{ border: "1px solid #1f232022", borderRadius: 16, overflow: "hidden" }}>
          {items.map((l, i) => (
            <div key={l.id} className="flex items-center gap-4 p-4" style={{ background: "#f6f0e3", borderTop: i ? "1px solid #1f232022" : "none" }}>
              <Link to={`/lot/${l.id}`} className="overflow-hidden" style={{ width: 64, height: 80, borderRadius: 12, background: "#e1d9c8", flexShrink: 0 }}>
                <img src={l.img} alt={l.title} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              </Link>
              <div className="flex-1 min-w-0">
                <Link to={`/lot/${l.id}`} style={{ color: "#1f2320", textDecoration: "none", fontSize: 15, fontWeight: 600 }} className="underline-link">{l.title}</Link>
                <p className="mono-label m-0 mt-1" style={{ color: "#1f232099" }}>
                  Лот {l.lot} · {l.price} ₽ · {l.views} просмотров · {STATUS_LABEL[l.status] ?? l.status}
                </p>
                {l.status === "pending" && (
                  <p className="mono-label m-0 mt-1" style={{ color: "#1f232099" }}>
                    Ждёт проверки модератором — в каталоге появится после одобрения
                  </p>
                )}
                {l.status === "rejected" && l.rejectReason && (
                  <p className="m-0 mt-1" style={{ fontSize: 13, lineHeight: 1.5, color: "#a33" }}>
                    Отклонён: {l.rejectReason}
                  </p>
                )}
              </div>
              <div className="flex gap-2 flex-shrink-0 flex-wrap justify-end">
                {l.status === "active" && (
                  <>
                    <button disabled={busyId === l.id} onClick={() => setSelling(l)} className="mono-label" style={smallBtn(true)}>Продан</button>
                    <button disabled={busyId === l.id} onClick={() => act(l.id, () => api.updateListing(l.id, { status: "archived" }))} className="mono-label" style={smallBtn(false)}>Снять</button>
                  </>
                )}
                {(l.status === "rejected" || l.status === "archived") && (
                  <button disabled={busyId === l.id} onClick={() => act(l.id, () => api.resubmitListing(l.id))} className="mono-label" style={smallBtn(true)}>
                    {l.status === "rejected" ? "Исправил, проверьте" : "На проверку"}
                  </button>
                )}
                <button
                  disabled={busyId === l.id}
                  onClick={() => { if (confirm(`Удалить лот «${l.title}»? Это действие необратимо.`)) act(l.id, () => api.deleteListing(l.id)); }}
                  className="mono-label"
                  style={smallBtn(false)}
                >
                  Удалить
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selling && (
        <SellDialog
          listing={selling}
          onClose={() => setSelling(null)}
          onDone={() => { setSelling(null); onChange(); }}
        />
      )}
    </div>
  );
}

/**
 * Отметка лота проданным. Покупателя выбираем из тех, кто писал по лоту —
 * без этого он не сможет оставить отзыв о сделке.
 */
function SellDialog({ listing, onClose, onDone }: { listing: Listing; onClose: () => void; onDone: () => void }) {
  const { data: buyers, loading } = useAsync(() => api.listingBuyers(listing.id), [listing.id]);
  const [buyerId, setBuyerId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await api.sellListing(listing.id, buyerId ?? undefined);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось отметить лот проданным");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-5" style={{ background: "#1f232099" }} onClick={onClose}>
      <div className="w-full" style={{ maxWidth: 460, background: "#efe8da", borderRadius: 20, padding: 28 }} onClick={(e) => e.stopPropagation()}>
        <span className="mono-label" style={{ color: "#1f232099" }}>Лот {listing.lot}</span>
        <h3 className="font-display mt-2 mb-4" style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>Кому продали?</h3>
        <p className="mb-4" style={{ fontSize: 14, lineHeight: 1.5, color: "#1f2320cc" }}>
          Укажите покупателя — он сможет оставить отзыв о сделке, и это повлияет на ваш рейтинг.
        </p>

        {error && <p className="mono-label mb-4" style={{ color: "#a33" }}>{error}</p>}

        {loading ? (
          <p className="mono-label" style={{ color: "#1f232099" }}>Загрузка…</p>
        ) : !buyers?.length ? (
          <p className="mono-label mb-4" style={{ color: "#1f232099" }}>
            По этому лоту никто не писал — отметим продажу без покупателя.
          </p>
        ) : (
          <div className="flex flex-col gap-2 mb-4">
            {buyers.map((b) => (
              <label key={b.userId} className="flex items-center gap-3 cursor-pointer" style={{ fontSize: 15 }}>
                <span style={{ width: 18, height: 18, borderRadius: "50%", border: "1px solid #1f2320", background: buyerId === b.userId ? "#1f2320" : "transparent", flexShrink: 0 }} />
                <input type="radio" name="buyer" checked={buyerId === b.userId} onChange={() => setBuyerId(b.userId)} style={{ display: "none" }} />
                {b.name}
              </label>
            ))}
            <label className="flex items-center gap-3 cursor-pointer" style={{ fontSize: 15, color: "#1f232099" }}>
              <span style={{ width: 18, height: 18, borderRadius: "50%", border: "1px solid #1f2320", background: buyerId === null ? "#1f2320" : "transparent", flexShrink: 0 }} />
              <input type="radio" name="buyer" checked={buyerId === null} onChange={() => setBuyerId(null)} style={{ display: "none" }} />
              Продал вне платформы
            </label>
          </div>
        )}

        <div className="flex gap-3 mt-5 justify-end">
          <button onClick={onClose} className="mono-label" style={{ background: "transparent", border: "1px solid #1f232033", borderRadius: 999, padding: "12px 22px", cursor: "pointer", color: "#1f2320" }}>Отмена</button>
          <button onClick={submit} disabled={busy} className="mono-label" style={{ background: "#1f2320", color: "#efe8da", border: "none", borderRadius: 999, padding: "12px 22px", cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
            {busy ? "Сохраняем…" : "Отметить проданным"}
          </button>
        </div>
      </div>
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  pending: "на проверке",
  active: "опубликован",
  rejected: "отклонён",
  sold: "продан",
  archived: "снят",
};

const smallBtn = (primary: boolean) =>
  ({
    background: primary ? "#1f2320" : "transparent",
    color: primary ? "#efe8da" : "#1f2320",
    border: "1px solid " + (primary ? "#1f2320" : "#1f232033"),
    borderRadius: 999,
    padding: "9px 16px",
    cursor: "pointer",
  }) as const;

/** Тариф рядом с городом: «Полка» — приглушённо, платные — заметно. */
function PlanBadge({ plan }: { plan: ProfileUser["plan"] }) {
  const paid = plan.storefront;
  return (
    <span
      className="mono-label"
      style={{
        background: paid ? "#1f2320" : "transparent",
        color: paid ? "#efe8da" : "#1f232099",
        border: paid ? "none" : "1px solid #1f232033",
        borderRadius: 999,
        padding: "4px 12px",
        whiteSpace: "nowrap",
      }}
      title={plan.expired ? "Срок тарифа истёк" : undefined}
    >
      {paid ? "✳ " : ""}{plan.label}
    </span>
  );
}

function Settings({ user }: { user: ProfileUser }) {
  const { setUser } = useAuth();

  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phoneRaw);
  const [email, setEmail] = useState(user.email ?? "");
  const [city, setCity] = useState(user.city);
  const [bio, setBio] = useState(user.bio);
  const [notify, setNotify] = useState(user.notify);

  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});

  const field = { border: "1px solid #1f232033", borderRadius: 14, background: "#f6f0e3", padding: "14px 16px", fontSize: 15, outline: "none", width: "100%" } as const;
  const label = { color: "#1f232099", display: "block", marginBottom: 8 } as const;

  const NOTES: { key: keyof typeof notify; t: string }[] = [
    { key: "deals", t: "Отклики и сообщения по сделкам" },
    { key: "journal", t: "Новые материалы Журнала" },
    { key: "promo", t: "Скидки и акции Клауд" },
  ];

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;

    setBusy(true);
    setError("");
    setFields({});

    try {
      const updated = await api.updateProfile({ name, phone, city, bio, email, notify });
      setUser(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFields(err.details ?? {});
      } else {
        setError("Сервер недоступен. Попробуйте ещё раз.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="py-8 grid md:grid-cols-12 gap-8">
      <div className="md:col-span-4">
        <h2 className="mono-label" style={{ color: "#1f232099" }}>Личные данные</h2>
        <p className="mt-3" style={{ fontSize: 14, lineHeight: 1.6, color: "#1f2320cc", maxWidth: 240 }}>Эти данные видят покупатели в ваших объявлениях и диалогах.</p>
      </div>

      <form className="md:col-span-8 flex flex-col gap-5" style={{ maxWidth: 480 }} onSubmit={save} noValidate>
        {error && <p className="mono-label" style={{ color: "#a33", background: "#f6f0e3", border: "1px solid #a3333322", borderRadius: 12, padding: "12px 14px" }}>{error}</p>}

        <div>
          <span className="mono-label" style={label}>Имя</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} style={field} />
          <FieldError>{fields.name}</FieldError>
        </div>
        <div>
          <span className="mono-label" style={label}>Номер телефона</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, "").slice(0, 11))} inputMode="tel" style={field} />
          <FieldError>{fields.phone}</FieldError>
        </div>
        <div>
          <span className="mono-label" style={label}>Почта <span style={{ color: "#1f232066" }}>· для уведомлений и восстановления доступа</span></span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            inputMode="email"
            autoComplete="email"
            maxLength={160}
            placeholder="name@example.com"
            style={field}
          />
          <FieldError>{fields.email}</FieldError>
          {user.email && (
            <p className="mono-label m-0 mt-2" style={{ color: "#1f232099" }}>
              {user.emailVerified ? "✓ почта подтверждена" : "почта пока не подтверждена"}
            </p>
          )}
        </div>
        <div>
          <span className="mono-label" style={label}>Город</span>
          <input value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} style={field} />
          <FieldError>{fields.city}</FieldError>
        </div>
        <div>
          <span className="mono-label" style={label}>О себе</span>
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={4} maxLength={1000} placeholder="Пара слов для покупателей" style={{ ...field, resize: "vertical", lineHeight: 1.5 }} />
          <FieldError>{fields.bio}</FieldError>
        </div>

        <Rule />

        <div>
          <span className="mono-label" style={{ color: "#1f232099", display: "block", marginBottom: 14 }}>Уведомления</span>
          <div className="flex flex-col gap-4">
            {NOTES.map((n) => (
              <label key={n.key} className="flex items-center justify-between cursor-pointer" style={{ fontSize: 15 }}>
                {n.t}
                <button type="button" onClick={() => setNotify((v) => ({ ...v, [n.key]: !v[n.key] }))} aria-label={n.t} aria-pressed={notify[n.key]} style={{ width: 46, height: 26, borderRadius: 999, border: "none", cursor: "pointer", background: notify[n.key] ? "#1f2320" : "#1f232033", position: "relative", transition: "background 0.2s ease", flexShrink: 0 }}>
                  <span style={{ position: "absolute", top: 3, left: notify[n.key] ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: "#efe8da", transition: "left 0.2s cubic-bezier(0.2,0.7,0.2,1)" }} />
                </button>
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4 mt-2">
          <button type="submit" disabled={busy} className="mono-label" style={{ background: "#1f2320", color: "#efe8da", border: "none", borderRadius: 999, padding: "16px 36px", cursor: busy ? "wait" : "pointer", opacity: busy ? 0.7 : 1 }}>
            {busy ? "Сохраняем…" : "Сохранить изменения"}
          </button>
          {saved && <span className="mono-label" style={{ color: "#1f232099" }}>✓ Сохранено</span>}
        </div>
      </form>

      <div className="md:col-span-4">
        <h2 className="mono-label" style={{ color: "#1f232099" }}>Пароль</h2>
        <p className="mt-3" style={{ fontSize: 14, lineHeight: 1.6, color: "#1f2320cc", maxWidth: 240 }}>Смена пароля не завершает текущие сессии.</p>
      </div>
      <PasswordForm />
    </div>
  );
}

function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});

  const field = { border: "1px solid #1f232033", borderRadius: 14, background: "#f6f0e3", padding: "14px 16px", fontSize: 15, outline: "none", width: "100%" } as const;
  const label = { color: "#1f232099", display: "block", marginBottom: 8 } as const;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;

    setBusy(true);
    setError("");
    setFields({});
    setDone(false);

    try {
      await api.changePassword({ current, next });
      setCurrent("");
      setNext("");
      setDone(true);
      setTimeout(() => setDone(false), 2200);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFields(err.details ?? {});
      } else {
        setError("Сервер недоступен. Попробуйте ещё раз.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="md:col-span-8 flex flex-col gap-5" style={{ maxWidth: 480 }} onSubmit={submit} noValidate>
      {error && <p className="mono-label" style={{ color: "#a33", background: "#f6f0e3", border: "1px solid #a3333322", borderRadius: 12, padding: "12px 14px" }}>{error}</p>}
      <div>
        <span className="mono-label" style={label}>Текущий пароль</span>
        <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" style={field} />
        <FieldError>{fields.current}</FieldError>
      </div>
      <div>
        <span className="mono-label" style={label}>Новый пароль · от 8 символов</span>
        <input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" style={field} />
        <FieldError>{fields.next}</FieldError>
      </div>
      <div className="flex items-center gap-4">
        <button type="submit" disabled={busy || !current || !next} className="mono-label" style={{ background: "transparent", color: "#1f2320", border: "1px solid #1f2320", borderRadius: 999, padding: "16px 36px", cursor: "pointer", opacity: busy || !current || !next ? 0.6 : 1 }}>
          {busy ? "Меняем…" : "Сменить пароль"}
        </button>
        {done && <span className="mono-label" style={{ color: "#1f232099" }}>✓ Пароль обновлён</span>}
      </div>
    </form>
  );
}
