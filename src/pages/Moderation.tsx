import { Fragment, useState } from "react";
import { Link } from "react-router";
import { ApiError, admin as adminApi, moderation, type LogEntry, type Listing, type PlanKey, type ProjectStats, type Report, type Role, type StaffUser } from "../api";
import { useAuth } from "../auth";
import { useAsync } from "../hooks";
import { EmptyState, ErrorState, Rule } from "../components";

/** Подписи тарифов в панели — совпадают с server/lib/plans.js. */
const PLAN_LABEL: Record<PlanKey, string> = {
  shelf: "Полка",
  storefront: "Витрина",
  edition: "Издание",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "на проверке",
  active: "опубликован",
  rejected: "отклонён",
  sold: "продан",
  archived: "снят",
};

const ACTION_LABEL: Record<string, string> = {
  "listing.approve": "одобрил лот",
  "listing.reject": "отклонил лот",
  "listing.archive": "снял лот",
  "report.resolve": "закрыл жалобу",
  "report.dismiss": "отклонил жалобу",
  "user.role": "изменил роль",
  "user.block": "заблокировал",
  "user.unblock": "разблокировал",
  "article.publish": "опубликовал материал",
  "article.draft": "сохранил черновик",
  "article.edit": "отредактировал материал",
  "article.delete": "удалил материал",
};

const ROLE_LABEL: Record<Role, string> = {
  user: "пользователь",
  moderator: "модератор",
  admin: "администратор",
};

export default function Moderation() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const TABS = isAdmin
    ? (["Очередь", "Жалобы", "Статистика", "Пользователи", "Журнал"] as const)
    : (["Очередь", "Жалобы", "Журнал"] as const);
  type Tab = (typeof TABS)[number];

  const [tab, setTab] = useState<Tab>("Очередь");
  const { data: stats, reload: reloadStats } = useAsync(() => moderation.stats(), []);

  if (!user) return null;

  const CARDS = [
    { v: stats?.pending ?? 0, k: "на проверке" },
    { v: stats?.openReports ?? 0, k: "открытых жалоб" },
    { v: stats?.rejected ?? 0, k: "отклонено" },
    { v: stats?.today ?? 0, k: "действий сегодня" },
  ];

  return (
    <div className="max-w-7xl mx-auto px-5 md:px-10">
      <div className="flex items-center gap-2 py-5 mono-label" style={{ color: "#1f232099" }}>
        <Link to="/" style={{ color: "#1f232099", textDecoration: "none" }} className="underline-link">Клауд</Link>
        <span>/</span><span style={{ color: "#1f2320" }}>Модерация</span>
      </div>

      <section className="grid md:grid-cols-12 gap-6 items-end pb-8">
        <div className="md:col-span-8">
          <span className="mono-label" style={{ color: "#1f232099" }}>
            {ROLE_LABEL[user.role]} · {user.name}
          </span>
          <h1 className="font-display mt-2" style={{ fontSize: "clamp(34px,5vw,64px)", fontWeight: 800, lineHeight: 0.9, letterSpacing: "-0.03em" }}>
            Редакционная коллегия
          </h1>
          <p className="mt-4" style={{ fontSize: 15, lineHeight: 1.6, color: "#1f2320cc", maxWidth: 460 }}>
            Лоты попадают в каталог только после проверки. Здесь же разбираются жалобы покупателей
            {isAdmin ? " и назначаются модераторы." : "."}
          </p>
        </div>
        <div className="md:col-span-4 flex md:justify-end gap-3 flex-wrap">
          <Link to="/journal/new" className="mono-label" style={{ background: "#1f2320", color: "#efe8da", borderRadius: 999, padding: "14px 26px", textDecoration: "none" }}>
            + Написать материал
          </Link>
          <Link to="/journal" className="mono-label" style={{ border: "1px solid #1f232033", borderRadius: 999, padding: "14px 22px", textDecoration: "none", color: "#1f2320" }}>
            Журнал
          </Link>
        </div>
      </section>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-px mb-8" style={{ background: "#1f232022", border: "1px solid #1f232022", borderRadius: 16, overflow: "hidden" }}>
        {CARDS.map((c) => (
          <div key={c.k} className="p-6" style={{ background: "#f6f0e3" }}>
            <p className="font-display m-0" style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1 }}>{c.v}</p>
            <p className="mono-label m-0 mt-2" style={{ color: "#1f232099" }}>{c.k}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-6 overflow-x-auto" style={{ borderBottom: "1px solid #1f232022" }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className="mono-label" style={{ background: "none", border: "none", cursor: "pointer", color: tab === t ? "#1f2320" : "#1f232099", padding: "16px 0", borderBottom: "2px solid " + (tab === t ? "#1f2320" : "transparent"), whiteSpace: "nowrap", marginBottom: -1 }}>
            {t}
            {t === "Очередь" && stats?.pending ? ` · ${stats.pending}` : ""}
            {t === "Жалобы" && stats?.openReports ? ` · ${stats.openReports}` : ""}
          </button>
        ))}
      </div>

      {tab === "Очередь" && <Queue onChange={reloadStats} />}
      {tab === "Жалобы" && <Reports onChange={reloadStats} />}
      {tab === "Статистика" && isAdmin && <Analytics />}
      {tab === "Пользователи" && isAdmin && <Users currentUserId={user.userId} />}
      {tab === "Журнал" && <Log />}
    </div>
  );
}

/** Очередь лотов: одобрить, отклонить с причиной, снять опубликованный. */
function Queue({ onChange }: { onChange: () => void }) {
  const [status, setStatus] = useState("pending");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState<Listing | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const { data, loading, error: loadError, reload } = useAsync(() => moderation.queue(status), [status]);

  const act = async (id: number, run: () => Promise<unknown>) => {
    setBusyId(id);
    setError("");
    try {
      await run();
      reload();
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось выполнить действие");
    } finally {
      setBusyId(null);
    }
  };

  const submitReject = async () => {
    if (!rejecting || reason.trim().length < 5) return;
    await act(rejecting.id, () => moderation.reject(rejecting.id, reason.trim()));
    setRejecting(null);
    setReason("");
  };

  const FILTERS = [
    { key: "pending", label: "На проверке" },
    { key: "rejected", label: "Отклонённые" },
    { key: "active", label: "Опубликованные" },
  ];

  return (
    <div className="py-8">
      <div className="flex gap-2 mb-6 flex-wrap">
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setStatus(f.key)} className="mono-label" style={chip(status === f.key)}>{f.label}</button>
        ))}
      </div>

      {error && <p className="mono-label mb-4" style={errorBox}>{error}</p>}
      {loadError && <ErrorState error={loadError} onRetry={reload} />}

      {loading ? (
        <p className="mono-label" style={{ color: "#1f232099" }}>Загрузка…</p>
      ) : !data?.items.length ? (
        <EmptyState
          title={status === "pending" ? "Очередь пуста" : "Ничего не найдено"}
          hint={status === "pending" ? "Все лоты проверены" : undefined}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {data.items.map((l) => (
            <article key={l.id} className="grid md:grid-cols-12 gap-4 p-4" style={{ border: "1px solid #1f232022", borderRadius: 16, background: "#f6f0e3" }}>
              <Link to={`/lot/${l.id}`} className="md:col-span-2 overflow-hidden block" style={{ borderRadius: 12, background: "#e1d9c8", aspectRatio: "4/5", maxHeight: 160 }}>
                {l.img && <img src={l.img} alt={l.title} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
              </Link>

              <div className="md:col-span-7 min-w-0">
                <span className="mono-label" style={{ color: "#1f232099" }}>
                  Лот {l.lot} · {STATUS_LABEL[l.status]} · подан {l.time} назад
                </span>
                <h3 className="font-display mt-1 mb-2" style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em" }}>{l.title}</h3>
                <p className="m-0" style={{ fontSize: 14, lineHeight: 1.5, color: "#1f2320cc", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {l.description}
                </p>
                <p className="mono-label mt-3 m-0" style={{ color: "#1f232099" }}>
                  {l.price} ₽ · {l.cond} · {l.location}
                  {l.seller && <> · <Link to={`/seller/${l.seller.id}`} style={{ color: "#1f2320" }} className="underline-link">{l.seller.name}</Link></>}
                </p>
                {l.rejectReason && (
                  <p className="mono-label mt-2 m-0" style={{ color: "#a33" }}>Причина отказа: {l.rejectReason}</p>
                )}
              </div>

              <div className="md:col-span-3 flex md:flex-col gap-2 md:items-stretch">
                {l.status !== "active" && (
                  <button disabled={busyId === l.id} onClick={() => act(l.id, () => moderation.approve(l.id))} className="mono-label" style={btn(true)}>
                    Одобрить
                  </button>
                )}
                {l.status !== "rejected" && (
                  <button disabled={busyId === l.id} onClick={() => { setRejecting(l); setReason(""); }} className="mono-label" style={btn(false)}>
                    Отклонить
                  </button>
                )}
                {l.status === "active" && (
                  <button disabled={busyId === l.id} onClick={() => act(l.id, () => moderation.archive(l.id, "Снят модератором"))} className="mono-label" style={btn(false)}>
                    Снять
                  </button>
                )}
                <Link to={`/lot/${l.id}`} className="mono-label text-center" style={{ ...btn(false), display: "block", textDecoration: "none" }}>Открыть</Link>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Причина отказа */}
      {rejecting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-5" style={{ background: "#1f232099" }} onClick={() => setRejecting(null)}>
          <div className="w-full" style={{ maxWidth: 460, background: "#efe8da", borderRadius: 20, padding: 28 }} onClick={(e) => e.stopPropagation()}>
            <span className="mono-label" style={{ color: "#1f232099" }}>Лот {rejecting.lot}</span>
            <h3 className="font-display mt-2 mb-4" style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>Причина отказа</h3>
            <p className="mb-4" style={{ fontSize: 14, lineHeight: 1.5, color: "#1f2320cc" }}>
              Продавец увидит этот текст в своём кабинете и сможет исправить лот.
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              maxLength={500}
              autoFocus
              placeholder="Например: нет фотографий предмета и описания состояния."
              style={{ border: "1px solid #1f232033", borderRadius: 14, background: "#f6f0e3", padding: "14px 16px", fontSize: 15, outline: "none", width: "100%", resize: "vertical", lineHeight: 1.5 }}
            />
            <div className="flex gap-3 mt-5 justify-end">
              <button onClick={() => setRejecting(null)} className="mono-label" style={btn(false)}>Отмена</button>
              <button onClick={submitReject} disabled={reason.trim().length < 5} className="mono-label" style={{ ...btn(true), opacity: reason.trim().length < 5 ? 0.5 : 1 }}>
                Отклонить лот
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Жалобы покупателей. */
function Reports({ onChange }: { onChange: () => void }) {
  const [status, setStatus] = useState("open");
  const [busyId, setBusyId] = useState<number | null>(null);
  const { data, loading, reload } = useAsync(() => moderation.reports(status), [status]);

  const resolve = async (report: Report, next: "resolved" | "dismissed") => {
    setBusyId(report.id);
    try {
      await moderation.resolveReport(report.id, next);
      reload();
      onChange();
    } finally {
      setBusyId(null);
    }
  };

  const FILTERS = [
    { key: "open", label: "Открытые" },
    { key: "resolved", label: "Решённые" },
    { key: "dismissed", label: "Отклонённые" },
  ];

  return (
    <div className="py-8">
      <div className="flex gap-2 mb-6 flex-wrap">
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setStatus(f.key)} className="mono-label" style={chip(status === f.key)}>{f.label}</button>
        ))}
      </div>

      {loading ? (
        <p className="mono-label" style={{ color: "#1f232099" }}>Загрузка…</p>
      ) : !data?.items.length ? (
        <EmptyState title="Жалоб нет" hint={status === "open" ? "Все обращения разобраны" : undefined} />
      ) : (
        <div className="flex flex-col" style={{ border: "1px solid #1f232022", borderRadius: 16, overflow: "hidden" }}>
          {data.items.map((r, i) => (
            <div key={r.id} className="flex flex-col md:flex-row md:items-center gap-4 p-4" style={{ background: "#f6f0e3", borderTop: i ? "1px solid #1f232022" : "none" }}>
              <div className="flex-1 min-w-0">
                <span className="mono-label" style={{ color: "#1f232099" }}>
                  {r.age} назад · от {r.reporter.name} · лот {r.listingLot} ({STATUS_LABEL[r.listingStatus] ?? r.listingStatus})
                </span>
                <p className="m-0 mt-1" style={{ fontSize: 15, fontWeight: 600 }}>{r.reason}</p>
                {r.comment && <p className="m-0 mt-1" style={{ fontSize: 14, color: "#1f2320cc", lineHeight: 1.5 }}>{r.comment}</p>}
                <Link to={`/lot/${r.listingId}`} className="mono-label underline-link" style={{ color: "#1f2320", textDecoration: "none" }}>{r.listingTitle} →</Link>
              </div>
              {r.status === "open" ? (
                <div className="flex gap-2 flex-shrink-0">
                  <button disabled={busyId === r.id} onClick={() => resolve(r, "resolved")} className="mono-label" style={btn(true)}>Принять меры</button>
                  <button disabled={busyId === r.id} onClick={() => resolve(r, "dismissed")} className="mono-label" style={btn(false)}>Отклонить</button>
                </div>
              ) : (
                <span className="mono-label flex-shrink-0" style={{ color: "#1f232099" }}>
                  {r.status === "resolved" ? "меры приняты" : "жалоба отклонена"}
                  {r.resolvedBy ? ` · ${r.resolvedBy}` : ""}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Статистика проекта: итоги, разрезы по периодам и помесячная динамика. */
function Analytics() {
  const { data, loading, error, reload } = useAsync(() => adminApi.overview(), []);

  if (loading) return <p className="mono-label py-8" style={{ color: "#1f232099" }}>Считаем статистику…</p>;
  if (error) return <div className="py-8"><ErrorState error={error} onRetry={reload} /></div>;
  if (!data) return null;

  const money = (n: number) => `${n.toLocaleString("ru-RU")} ₽`;

  const TOTALS: { v: string; k: string; hint?: string }[] = [
    { v: String(data.listings.total), k: "объявлений загружено", hint: `${data.listings.active} в каталоге` },
    { v: String(data.sales.count), k: "продано лотов", hint: `конверсия ${data.sales.conversion}%` },
    { v: money(data.sales.revenue), k: "оборот сделок", hint: `средний чек ${money(data.sales.averagePrice)}` },
    { v: String(data.users.total), k: "пользователей", hint: `${data.users.sellers} с объявлениями` },
  ];

  const maxTrend = Math.max(1, ...data.trend.map((m) => Math.max(m.created, m.sold)));

  return (
    <div className="py-8 flex flex-col gap-10">
      {/* Итоги за всё время */}
      <div>
        <h2 className="mono-label mb-4" style={{ color: "#1f232099" }}>За всё время</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px" style={{ background: "#1f232022", border: "1px solid #1f232022", borderRadius: 16, overflow: "hidden" }}>
          {TOTALS.map((c) => (
            <div key={c.k} className="p-6" style={{ background: "#f6f0e3" }}>
              <p className="font-display m-0" style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1 }}>{c.v}</p>
              <p className="mono-label m-0 mt-2" style={{ color: "#1f232099" }}>{c.k}</p>
              {c.hint && <p className="mono-label m-0 mt-1" style={{ color: "#1f232066" }}>{c.hint}</p>}
            </div>
          ))}
        </div>
      </div>

      {/* Разрез по периодам */}
      <div>
        <h2 className="mono-label mb-4" style={{ color: "#1f232099" }}>По периодам</h2>
        <div style={{ border: "1px solid #1f232022", borderRadius: 16, overflow: "hidden" }}>
          <div className="grid grid-cols-5 gap-px" style={{ background: "#1f232022" }}>
            {["Период", "Подано", "Продано", "Оборот", "Новых людей"].map((h) => (
              <div key={h} className="mono-label px-4 py-3" style={{ background: "#1f2320", color: "#efe8da" }}>{h}</div>
            ))}
            {data.periods.map((p) => (
              <Fragment key={p.period}>
                <div className="px-4 py-3" style={{ background: "#f6f0e3", fontSize: 14, fontWeight: 600 }}>{p.label}</div>
                <div className="px-4 py-3" style={{ background: "#f6f0e3", fontSize: 14 }}>{p.listingsCreated}</div>
                <div className="px-4 py-3" style={{ background: "#f6f0e3", fontSize: 14 }}>{p.listingsSold}</div>
                <div className="px-4 py-3" style={{ background: "#f6f0e3", fontSize: 14 }}>{money(p.revenue)}</div>
                <div className="px-4 py-3" style={{ background: "#f6f0e3", fontSize: 14 }}>{p.usersJoined}</div>
              </Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* Помесячная динамика */}
      <div>
        <h2 className="mono-label mb-4" style={{ color: "#1f232099" }}>Динамика по месяцам · подано / продано</h2>
        <div className="flex items-end gap-2 overflow-x-auto" style={{ border: "1px solid #1f232022", borderRadius: 16, background: "#f6f0e3", padding: "20px 16px", minHeight: 180 }}>
          {data.trend.map((m) => (
            <div key={m.month} className="flex flex-col items-center gap-2" style={{ minWidth: 46 }}>
              <div className="flex items-end gap-1" style={{ height: 110 }}>
                <div title={`подано: ${m.created}`} style={{ width: 12, height: `${(m.created / maxTrend) * 100}%`, minHeight: m.created ? 3 : 0, background: "#1f232055", borderRadius: 3 }} />
                <div title={`продано: ${m.sold}`} style={{ width: 12, height: `${(m.sold / maxTrend) * 100}%`, minHeight: m.sold ? 3 : 0, background: "#1f2320", borderRadius: 3 }} />
              </div>
              <span className="mono-label" style={{ color: "#1f232066", fontSize: 10 }}>{m.month.slice(5)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Прочие показатели */}
      <div className="grid md:grid-cols-3 gap-4">
        <Facts title="Лоты" rows={[
          ["на проверке", data.listings.pending],
          ["отклонено", data.listings.rejected],
          ["снято", data.listings.archived],
          ["просмотров", data.listings.views],
        ]} />
        <Facts title="Сделки" rows={[
          ["средний чек", money(data.sales.averagePrice)],
          ["средний срок продажи", `${data.sales.averageDays} дн`],
          ["отзывов", data.content.reviews],
        ]} />
        <Facts title="Люди и контент" rows={[
          ["модераторов", data.users.moderators],
          ["заблокировано", data.users.blocked],
          ["с почтой", data.users.withEmail],
          ["материалов", data.content.articles],
          ["сообщений", data.content.messages],
        ]} />
      </div>
    </div>
  );
}

function Facts({ title, rows }: { title: string; rows: [string, string | number][] }) {
  return (
    <div style={{ border: "1px solid #1f232022", borderRadius: 16, background: "#f6f0e3", padding: 20 }}>
      <h3 className="mono-label mb-3" style={{ color: "#1f232099" }}>{title}</h3>
      {rows.map(([k, v]) => (
        <div key={k}>
          <div className="flex items-center justify-between py-2.5 gap-3">
            <span style={{ fontSize: 14, color: "#1f2320cc" }}>{k}</span>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{v}</span>
          </div>
          <Rule />
        </div>
      ))}
    </div>
  );
}

/** Управление ролями и блокировками — только для администратора. */
function Users({ currentUserId }: { currentUserId: number }) {
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [blocking, setBlocking] = useState<StaffUser | null>(null);
  const [reason, setReason] = useState("");

  const { data, loading, reload } = useAsync(() => adminApi.users({ q }), [q]);
  const { data: stats, reload: reloadStats } = useAsync(() => adminApi.stats(), []);

  const act = async (userId: number, run: () => Promise<unknown>) => {
    setBusyId(userId);
    setError("");
    try {
      await run();
      reload();
      reloadStats();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось выполнить действие");
    } finally {
      setBusyId(null);
    }
  };

  const submitBlock = async () => {
    if (!blocking || reason.trim().length < 5) return;
    await act(blocking.userId, () => adminApi.block(blocking.userId, reason.trim()));
    setBlocking(null);
    setReason("");
  };

  return (
    <div className="py-8">
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Поиск по имени или телефону"
          className="outline-none"
          style={{ border: "1px solid #1f232033", borderRadius: 14, background: "#f6f0e3", padding: "12px 16px", fontSize: 14, minWidth: 260 }}
        />
        <span className="mono-label" style={{ color: "#1f232099" }}>
          {stats?.users ?? 0} аккаунтов · {stats?.moderators ?? 0} модераторов · {stats?.blocked ?? 0} заблокировано
        </span>
      </div>

      {error && <p className="mono-label mb-4" style={errorBox}>{error}</p>}

      {loading ? (
        <p className="mono-label" style={{ color: "#1f232099" }}>Загрузка…</p>
      ) : !data?.items.length ? (
        <EmptyState title="Никого не найдено" />
      ) : (
        <div className="flex flex-col" style={{ border: "1px solid #1f232022", borderRadius: 16, overflow: "hidden" }}>
          {data.items.map((u, i) => (
            <div key={u.userId} className="flex flex-col md:flex-row md:items-center gap-4 p-4" style={{ background: "#f6f0e3", borderTop: i ? "1px solid #1f232022" : "none" }}>
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="flex items-center justify-center font-display" style={{ width: 44, height: 44, borderRadius: "50%", background: "#1f2320", color: "#efe8da", fontSize: 19, flexShrink: 0 }}>{u.initial}</div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link to={`/seller/${u.id}`} style={{ fontSize: 15, fontWeight: 600, color: "#1f2320", textDecoration: "none" }} className="underline-link">{u.name}</Link>
                    {u.role !== "user" && (
                      <span className="mono-label" style={{ background: "#1f2320", color: "#efe8da", borderRadius: 999, padding: "3px 10px" }}>{ROLE_LABEL[u.role]}</span>
                    )}
                    {u.planKey !== "shelf" && (
                      <span className="mono-label" style={{ border: "1px solid #1f232055", borderRadius: 999, padding: "3px 10px", color: "#1f2320" }}>
                        ✳ {PLAN_LABEL[u.planKey]}
                      </span>
                    )}
                    {u.blocked && (
                      <span className="mono-label" style={{ border: "1px solid #a33", color: "#a33", borderRadius: 999, padding: "3px 10px" }}>заблокирован</span>
                    )}
                  </div>
                  <p className="mono-label m-0 mt-1" style={{ color: "#1f232099" }}>
                    {u.phone} · {u.city} · {u.listingCount} лотов · с {u.since}
                  </p>
                  {u.blocked && u.blockedReason && (
                    <p className="mono-label m-0 mt-1" style={{ color: "#a33" }}>{u.blockedReason}</p>
                  )}
                </div>
              </div>

              <div className="flex gap-2 flex-wrap justify-end flex-shrink-0 items-center">
                {/* Оплата не подключена: тариф назначает администратор. */}
                <select
                  value={u.planKey}
                  disabled={busyId === u.userId}
                  onChange={(e) => act(u.userId, () => adminApi.setPlan(u.userId, e.target.value as PlanKey, 12))}
                  className="mono-label"
                  style={{ border: "1px solid #1f232033", borderRadius: 999, padding: "9px 14px", background: "#f6f0e3", cursor: "pointer" }}
                  title="Тариф продавца"
                >
                  {(Object.keys(PLAN_LABEL) as PlanKey[]).map((key) => (
                    <option key={key} value={key}>{PLAN_LABEL[key]}</option>
                  ))}
                </select>

                {/* Витрина может входить в издательский дом. */}
                {u.planKey !== "shelf" && (data?.publishers.length ?? 0) > 0 && (
                  <select
                    value={u.publisherId ?? ""}
                    disabled={busyId === u.userId}
                    onChange={(e) => act(u.userId, () => adminApi.setPublisher(u.userId, e.target.value ? Number(e.target.value) : null))}
                    className="mono-label"
                    style={{ border: "1px solid #1f232033", borderRadius: 999, padding: "9px 14px", background: "#f6f0e3", cursor: "pointer" }}
                    title="Издательский дом"
                  >
                    <option value="">Вне издания</option>
                    {data?.publishers
                      .filter((p) => p.userId !== u.userId)
                      .map((p) => <option key={p.userId} value={p.userId}>{p.name}</option>)}
                  </select>
                )}

                {/* Личный редактор закрепляется за изданием. */}
                {u.planKey === "edition" && (
                  <select
                    value={u.editorId ?? ""}
                    disabled={busyId === u.userId}
                    onChange={(e) => act(u.userId, () => adminApi.setEditor(u.userId, e.target.value ? Number(e.target.value) : null))}
                    className="mono-label"
                    style={{ border: "1px solid #1f232033", borderRadius: 999, padding: "9px 14px", background: "#f6f0e3", cursor: "pointer" }}
                    title="Личный редактор издания"
                  >
                    <option value="">Без редактора</option>
                    {data?.staff.map((p) => <option key={p.userId} value={p.userId}>{p.name}</option>)}
                  </select>
                )}
                {u.userId === currentUserId ? (
                  <span className="mono-label" style={{ color: "#1f232099" }}>это вы</span>
                ) : (
                  <>
                    {u.role === "user" && (
                      <button disabled={busyId === u.userId} onClick={() => act(u.userId, () => adminApi.setRole(u.userId, "moderator"))} className="mono-label" style={btn(true)}>
                        Назначить модератором
                      </button>
                    )}
                    {u.role === "moderator" && (
                      <>
                        <button disabled={busyId === u.userId} onClick={() => act(u.userId, () => adminApi.setRole(u.userId, "admin"))} className="mono-label" style={btn(false)}>
                          Сделать админом
                        </button>
                        <button disabled={busyId === u.userId} onClick={() => act(u.userId, () => adminApi.setRole(u.userId, "user"))} className="mono-label" style={btn(false)}>
                          Снять модератора
                        </button>
                      </>
                    )}
                    {u.role === "admin" && (
                      <button disabled={busyId === u.userId} onClick={() => act(u.userId, () => adminApi.setRole(u.userId, "moderator"))} className="mono-label" style={btn(false)}>
                        Понизить до модератора
                      </button>
                    )}
                    {u.role !== "admin" && (
                      u.blocked ? (
                        <button disabled={busyId === u.userId} onClick={() => act(u.userId, () => adminApi.unblock(u.userId))} className="mono-label" style={btn(false)}>
                          Разблокировать
                        </button>
                      ) : (
                        <button disabled={busyId === u.userId} onClick={() => { setBlocking(u); setReason(""); }} className="mono-label" style={btn(false)}>
                          Заблокировать
                        </button>
                      )
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {blocking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-5" style={{ background: "#1f232099" }} onClick={() => setBlocking(null)}>
          <div className="w-full" style={{ maxWidth: 460, background: "#efe8da", borderRadius: 20, padding: 28 }} onClick={(e) => e.stopPropagation()}>
            <span className="mono-label" style={{ color: "#1f232099" }}>{blocking.name}</span>
            <h3 className="font-display mt-2 mb-4" style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>Причина блокировки</h3>
            <p className="mb-4" style={{ fontSize: 14, lineHeight: 1.5, color: "#1f2320cc" }}>
              Пользователь не сможет войти и увидит эту причину. Его активные лоты будут сняты с публикации.
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={300}
              autoFocus
              placeholder="Например: систематическая публикация запрещённых товаров."
              style={{ border: "1px solid #1f232033", borderRadius: 14, background: "#f6f0e3", padding: "14px 16px", fontSize: 15, outline: "none", width: "100%", resize: "vertical", lineHeight: 1.5 }}
            />
            <div className="flex gap-3 mt-5 justify-end">
              <button onClick={() => setBlocking(null)} className="mono-label" style={btn(false)}>Отмена</button>
              <button onClick={submitBlock} disabled={reason.trim().length < 5} className="mono-label" style={{ ...btn(true), opacity: reason.trim().length < 5 ? 0.5 : 1 }}>
                Заблокировать
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Журнал действий персонала. */
function Log() {
  const { data, loading } = useAsync(() => moderation.log({ limit: 50 }), []);

  const describe = (e: LogEntry) => {
    const what = ACTION_LABEL[e.action] ?? e.action;
    if (e.targetType === "article") return `${what} «${e.details ?? "без названия"}»`;
    if (e.targetType === "report") return `${what} #${e.targetId}`;
    if (e.targetType === "user") return `${what} аккаунт #${e.targetId}`;
    return `${what} #${e.targetId}`;
  };

  return (
    <div className="py-8">
      {loading ? (
        <p className="mono-label" style={{ color: "#1f232099" }}>Загрузка…</p>
      ) : !data?.items.length ? (
        <EmptyState title="Журнал пуст" hint="Здесь появятся действия модераторов" />
      ) : (
        <div className="flex flex-col gap-0">
          {data.items.map((e) => (
            <div key={e.id}>
              <div className="flex items-baseline justify-between gap-4 py-4 flex-wrap">
                <div className="min-w-0">
                  <span style={{ fontSize: 15 }}>
                    <strong style={{ fontWeight: 600 }}>{e.actor?.name ?? "Система"}</strong> {describe(e)}
                  </span>
                  {e.reason && <p className="m-0 mt-1" style={{ fontSize: 14, color: "#1f2320cc", lineHeight: 1.5 }}>{e.reason}</p>}
                  {e.details && e.targetType !== "article" && (
                    <p className="mono-label m-0 mt-1" style={{ color: "#1f232099" }}>{e.details}</p>
                  )}
                </div>
                <span className="mono-label flex-shrink-0" style={{ color: "#1f232099" }}>{e.age} назад</span>
              </div>
              <Rule />
            </div>
          ))}
        </div>
      )}
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
    padding: "8px 16px",
  }) as const;

const btn = (primary: boolean) =>
  ({
    background: primary ? "#1f2320" : "transparent",
    color: primary ? "#efe8da" : "#1f2320",
    border: "1px solid " + (primary ? "#1f2320" : "#1f232033"),
    borderRadius: 999,
    padding: "10px 18px",
    cursor: "pointer",
  }) as const;

const errorBox = {
  color: "#a33",
  background: "#f6f0e3",
  border: "1px solid #a3333322",
  borderRadius: 12,
  padding: "12px 14px",
} as const;
