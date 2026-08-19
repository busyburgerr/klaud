import { useState } from "react";
import { Link, useNavigate } from "react-router";
import api, { ApiError, type Listing, type Profile as ProfileUser } from "../api";
import { useAuth } from "../auth";
import { useAsync } from "../hooks";
import { EmptyState, FieldError, LotGrid, Rule } from "../components";
import { useWish } from "../store";

const TABS = ["Обзор", "Мои объявления", "Избранное", "Настройки"] as const;
type Tab = (typeof TABS)[number];

export default function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("Обзор");

  const { data: stats, reload: reloadStats } = useAsync(() => api.profileStats(), []);
  const { data: mine, loading: mineLoading, reload: reloadMine } = useAsync(() => api.myListings({ limit: 48 }), []);
  const { data: saved, loading: savedLoading } = useAsync(() => api.favorites(), [tab === "Избранное"]);

  if (!user) return null;

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
            <span className="mono-label" style={{ color: "#1f232099" }}>На Клауд с {user.since} · {user.city}</span>
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
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className="mono-label" style={{ background: "none", border: "none", cursor: "pointer", color: tab === t ? "#1f2320" : "#1f232099", padding: "16px 0", borderBottom: "2px solid " + (tab === t ? "#1f2320" : "transparent"), whiteSpace: "nowrap", marginBottom: -1 }}>
            {t}{t === "Избранное" && stats?.saved ? ` · ${stats.saved}` : ""}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {tab === "Обзор" && (
        <div className="py-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px mb-10" style={{ background: "#1f232022", border: "1px solid #1f232022", borderRadius: 16, overflow: "hidden" }}>
            {STATS.map((s) => (
              <div key={s.k} className="p-6" style={{ background: "#f6f0e3" }}>
                <p className="font-display m-0" style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1 }}>{s.v}</p>
                <p className="mono-label m-0 mt-2" style={{ color: "#1f232099" }}>{s.k}</p>
              </div>
            ))}
          </div>

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

      {/* ── SETTINGS ── */}
      {tab === "Настройки" && <Settings user={user} />}
    </div>
  );
}

/** Вкладка «Мои объявления»: публикация, снятие и удаление лота. */
function MyListings({ items, loading, onChange }: { items: Listing[]; loading: boolean; onChange: () => void }) {
  const [busyId, setBusyId] = useState<number | null>(null);
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
                  <button disabled={busyId === l.id} onClick={() => act(l.id, () => api.updateListing(l.id, { status: "archived" }))} className="mono-label" style={smallBtn(false)}>Снять</button>
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

function Settings({ user }: { user: ProfileUser }) {
  const { setUser } = useAuth();

  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phoneRaw);
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
      const updated = await api.updateProfile({ name, phone, city, bio, notify });
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
