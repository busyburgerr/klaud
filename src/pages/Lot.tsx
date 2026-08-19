import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import api, { ApiError } from "../api";
import { useAuth } from "../auth";
import { useAsync } from "../hooks";
import { LotGrid, Rule, WishHeart } from "../components";

export default function Lot() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [shot, setShot] = useState(0);
  const [contacting, setContacting] = useState(false);
  const [contactError, setContactError] = useState("");
  const [reporting, setReporting] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportComment, setReportComment] = useState("");
  const [reportState, setReportState] = useState<"idle" | "sending" | "sent">("idle");
  const [reportError, setReportError] = useState("");

  const { data: listing, loading, error } = useAsync(() => api.listing(id!), [id]);
  const { data: categories } = useAsync(() => api.categories(), []);
  const { data: related } = useAsync(() => (listing ? api.related(listing.id) : Promise.resolve([])), [listing?.id]);
  const { data: reportReasons } = useAsync(() => api.reportReasons(), []);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-5 md:px-10 py-32 text-center">
        <span className="mono-label" style={{ color: "#1f232099" }}>Загрузка лота…</span>
      </div>
    );
  }

  if (error || !listing) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <div className="max-w-7xl mx-auto px-5 md:px-10 py-32 text-center">
        <p className="font-display" style={{ fontSize: 40 }}>{notFound ? "Лот не найден" : "Не удалось загрузить лот"}</p>
        <Link to="/catalog" className="mono-label underline-link" style={{ color: "#1f2320", textDecoration: "none" }}>← Вернуться в каталог</Link>
      </div>
    );
  }

  const cat = categories?.find((c) => c.slug === listing.cat);
  const seller = listing.seller;
  const isMine = !!user && seller?.userId === user.userId;

  /** «Написать продавцу»: гостя — на вход, остальных — в новый диалог. */
  const contactSeller = async () => {
    if (!user) {
      navigate(`/login?next=${encodeURIComponent(`/lot/${listing.id}`)}`);
      return;
    }

    setContacting(true);
    setContactError("");
    try {
      const thread = await api.startThread(listing.id);
      navigate(`/messages?thread=${thread.id}`);
    } catch (err) {
      setContactError(err instanceof ApiError ? err.message : "Не удалось открыть диалог");
      setContacting(false);
    }
  };

  const submitReport = async () => {
    if (!listing || !reportReason) return;
    setReportState("sending");
    setReportError("");
    try {
      await api.reportListing(listing.id, { reason: reportReason, comment: reportComment });
      setReportState("sent");
      setTimeout(() => { setReporting(false); setReportState("idle"); }, 1800);
    } catch (err) {
      setReportError(err instanceof ApiError ? err.message : "Не удалось отправить жалобу");
      setReportState("idle");
    }
  };

  const openReport = () => {
    if (!user) {
      navigate(`/login?next=${encodeURIComponent(`/lot/${listing.id}`)}`);
      return;
    }
    setReportReason(reportReasons?.[0] ?? "");
    setReportComment("");
    setReportError("");
    setReporting(true);
  };

  const SPECS = [
    { k: "Номер лота", v: listing.lot },
    { k: "Состояние", v: listing.cond },
    { k: "Категория", v: cat?.label ?? "—" },
    { k: "Расположение", v: listing.location },
    { k: "Размещён", v: `${listing.time} назад` },
    { k: "Просмотров", v: String(listing.views) },
    { k: "Доставка", v: "Курьер · Клауд" },
  ];

  return (
    <div className="max-w-7xl mx-auto px-5 md:px-10">
      <div className="flex items-center gap-2 py-5 mono-label" style={{ color: "#1f232099" }}>
        <Link to="/" style={{ color: "#1f232099", textDecoration: "none" }} className="underline-link">Клауд</Link>
        <span>/</span>
        <Link to={`/category/${listing.cat}`} style={{ color: "#1f232099", textDecoration: "none" }} className="underline-link">{cat?.label}</Link>
        <span>/</span>
        <span style={{ color: "#1f2320" }}>Лот {listing.lot}</span>
      </div>

      <div className="grid md:grid-cols-12 gap-8 pb-12">
        {/* Image */}
        <div className="md:col-span-7">
          <div className="overflow-hidden relative" style={{ borderRadius: 20, background: "#e1d9c8", aspectRatio: "4/5" }}>
            <img src={listing.images[shot] ?? listing.img} alt={listing.title} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            <span className="mono-label absolute top-4 left-4" style={{ background: "#efe8da", color: "#1f2320", borderRadius: 8, padding: "6px 10px" }}>Лот {listing.lot}</span>
            {listing.status === "pending" && <span className="mono-label absolute top-4 right-4" style={{ background: "#efe8da", color: "#1f2320", border: "1px solid #1f232033", borderRadius: 8, padding: "6px 10px" }}>На проверке</span>}
            {listing.status !== "pending" && listing.badge && <span className="mono-label absolute top-4 right-4" style={{ background: "#1f2320", color: "#efe8da", borderRadius: 8, padding: "6px 10px" }}>{listing.badge}</span>}
          </div>

          {listing.images.length > 1 && (
            <div className="flex gap-2 mt-3 flex-wrap">
              {listing.images.map((src, i) => (
                <button key={src} onClick={() => setShot(i)} aria-label={`Фото ${i + 1}`} className="overflow-hidden" style={{ width: 72, height: 90, borderRadius: 12, border: "1px solid " + (i === shot ? "#1f2320" : "#1f232022"), background: "#e1d9c8", padding: 0, cursor: "pointer" }}>
                  <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="md:col-span-5">
          <div className="md:sticky md:top-40">
            <span className="mono-label" style={{ color: "#1f232099" }}>{cat?.label} · Раздел {cat?.n}</span>
            <h1 className="font-display mt-3" style={{ fontSize: "clamp(30px,4vw,48px)", fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em" }}>{listing.title}</h1>
            <p className="font-display mt-5" style={{ fontSize: 40, fontWeight: 800, letterSpacing: "-0.02em" }}>{listing.price} ₽</p>

            {isMine ? (
              <div className="flex gap-3 mt-6">
                <Link to="/account" className="mono-label flex-1 text-center" style={{ background: "#1f2320", color: "#efe8da", borderRadius: 16, padding: "18px", textDecoration: "none" }}>
                  Это ваш лот · управлять
                </Link>
              </div>
            ) : (
              <>
                <div className="flex gap-3 mt-6">
                  <button onClick={contactSeller} disabled={contacting} className="mono-label flex-1" style={{ background: "#1f2320", color: "#efe8da", border: "none", borderRadius: 16, padding: "18px", cursor: contacting ? "wait" : "pointer", opacity: contacting ? 0.7 : 1 }}>
                    {contacting ? "Открываем диалог…" : "Написать продавцу"}
                  </button>
                  <span style={{ border: "1px solid #1f232033", borderRadius: 16, padding: "6px", display: "inline-flex" }}><WishHeart id={listing.id} size={22} /></span>
                </div>
                <button onClick={contactSeller} className="mono-label w-full mt-3" style={{ background: "transparent", color: "#1f2320", border: "1px solid #1f2320", borderRadius: 16, padding: "18px", cursor: "pointer" }}>
                  Купить с гарантией Клауд
                </button>
                {contactError && <p className="mono-label mt-3" style={{ color: "#a33" }}>{contactError}</p>}
              </>
            )}

            <div className="mt-8">
              {SPECS.map((s) => (
                <div key={s.k}>
                  <div className="flex items-center justify-between py-3">
                    <span className="mono-label" style={{ color: "#1f232099" }}>{s.k}</span>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{s.v}</span>
                  </div>
                  <Rule />
                </div>
              ))}
            </div>

            {/* Seller */}
            {seller && (
              <Link to={`/seller/${seller.id}`} className="chip flex items-center gap-3 mt-6 p-4" style={{ border: "1px solid #1f232022", borderRadius: 16, background: "#f6f0e3", textDecoration: "none", color: "#1f2320" }}>
                <div className="flex items-center justify-center font-display relative" style={{ width: 46, height: 46, borderRadius: "50%", background: "#1f2320", color: "#efe8da", fontSize: 20, flexShrink: 0 }}>
                  {seller.initial}
                  {seller.online && <span style={{ position: "absolute", bottom: 0, right: 0, width: 12, height: 12, borderRadius: "50%", background: "#1f2320", border: "2px solid #f6f0e3" }} />}
                </div>
                <div className="flex-1">
                  <p className="m-0" style={{ fontSize: 14, fontWeight: 600 }}>{seller.name}</p>
                  <p className="mono-label m-0 mt-0.5" style={{ color: "#1f232099" }}>На Клауд с {seller.since} · {seller.deals} сделок</p>
                </div>
                <span className="mono-label" style={{ color: "#1f232099" }}>★ {seller.rating} →</span>
              </Link>
            )}

            {!isMine && (
              <button onClick={openReport} className="mono-label mt-4 w-full" style={{ background: "transparent", border: "1px solid #1f232033", borderRadius: 14, padding: "12px", cursor: "pointer", color: "#1f232099" }}>
                Пожаловаться на лот
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Жалоба модераторам */}
      {reporting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-5" style={{ background: "#1f232099" }} onClick={() => setReporting(false)}>
          <div className="w-full" style={{ maxWidth: 460, background: "#efe8da", borderRadius: 20, padding: 28 }} onClick={(e) => e.stopPropagation()}>
            {reportState === "sent" ? (
              <>
                <h3 className="font-display" style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>Жалоба отправлена</h3>
                <p className="mt-3" style={{ fontSize: 15, lineHeight: 1.6, color: "#1f2320cc" }}>Модераторы Клауд рассмотрят обращение.</p>
              </>
            ) : (
              <>
                <span className="mono-label" style={{ color: "#1f232099" }}>Лот {listing.lot}</span>
                <h3 className="font-display mt-2 mb-4" style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>Пожаловаться на лот</h3>

                {reportError && <p className="mono-label mb-4" style={{ color: "#a33" }}>{reportError}</p>}

                <div className="flex flex-col gap-2 mb-4">
                  {(reportReasons ?? []).map((r) => (
                    <label key={r} className="flex items-center gap-3 cursor-pointer" style={{ fontSize: 14.5 }}>
                      <span style={{ width: 18, height: 18, borderRadius: "50%", border: "1px solid #1f2320", background: reportReason === r ? "#1f2320" : "transparent", flexShrink: 0 }} />
                      <input type="radio" name="report-reason" checked={reportReason === r} onChange={() => setReportReason(r)} style={{ display: "none" }} />
                      {r}
                    </label>
                  ))}
                </div>

                <textarea
                  value={reportComment}
                  onChange={(e) => setReportComment(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="Подробности (необязательно)"
                  style={{ border: "1px solid #1f232033", borderRadius: 14, background: "#f6f0e3", padding: "14px 16px", fontSize: 15, outline: "none", width: "100%", resize: "vertical", lineHeight: 1.5 }}
                />

                <div className="flex gap-3 mt-5 justify-end">
                  <button onClick={() => setReporting(false)} className="mono-label" style={{ background: "transparent", border: "1px solid #1f232033", borderRadius: 999, padding: "12px 22px", cursor: "pointer", color: "#1f2320" }}>Отмена</button>
                  <button onClick={submitReport} disabled={!reportReason || reportState === "sending"} className="mono-label" style={{ background: "#1f2320", color: "#efe8da", border: "none", borderRadius: 999, padding: "12px 22px", cursor: "pointer", opacity: !reportReason || reportState === "sending" ? 0.6 : 1 }}>
                    {reportState === "sending" ? "Отправляем…" : "Отправить"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Description */}
      <section className="grid md:grid-cols-12 gap-8 pb-14">
        <div className="md:col-span-3"><h2 className="mono-label" style={{ color: "#1f232099" }}>Описание</h2></div>
        <div className="md:col-span-9">
          <p style={{ fontSize: 17, lineHeight: 1.7, color: "#1f2320dd", maxWidth: 640, whiteSpace: "pre-line" }}>
            {listing.description}
          </p>
        </div>
      </section>

      {(related?.length ?? 0) > 0 && (
        <section className="pb-16">
          <Rule />
          <h2 className="font-display mt-8 mb-6" style={{ fontSize: "clamp(24px,3vw,36px)", fontWeight: 800, letterSpacing: "-0.02em" }}>Похожие лоты</h2>
          <LotGrid items={related ?? []} className="grid grid-cols-2 md:grid-cols-4 gap-3" />
        </section>
      )}
    </div>
  );
}
