import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import api, { moderation, type City } from "./api";
import { hasRole, useAuth } from "./auth";
import { useCity } from "./city";
import { useAsync } from "./hooks";
import { Marquee, Rule } from "./components";

export default function Layout() {
  const [mobileMenu, setMobileMenu] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);
  const { city, cities, setCity } = useCity();
  const location = useLocation();
  const { user } = useAuth();

  const { data: categories } = useAsync(() => api.categories(), []);
  const { data: meta } = useAsync(() => api.meta(), []);

  // Счётчик непрочитанных обновляется при смене страницы — дёшево и достаточно.
  const { data: threads } = useAsync(
    () => (user ? api.threads() : Promise.resolve(null)),
    [user?.userId, location.pathname],
  );
  const unread = threads?.unread ?? 0;

  const staff = hasRole(user, "moderator");
  const { data: modStats } = useAsync(
    () => (staff ? moderation.stats() : Promise.resolve(null)),
    [staff, location.pathname],
  );
  const queue = (modStats?.pending ?? 0) + (modStats?.openReports ?? 0);

  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);
  useEffect(() => { setMobileMenu(false); setCityOpen(false); }, [location.pathname]);

  const cats = categories ?? [];

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#efe8da", color: "#1f2320" }}>
      <Marquee lines={meta?.marquee} />

      <header className="sticky top-0 z-50" style={{ background: "#efe8da", borderBottom: "1px solid #1f232022" }}>
        <div className="max-w-7xl mx-auto px-5 md:px-10">
          <div className="flex items-center justify-between py-3">
            <nav className="hidden md:flex items-center gap-7">
              {[{ t: "Каталог", to: "/catalog" }, { t: "Для бизнеса", to: "/business" }, { t: "Журнал", to: "/journal" }, { t: "Помощь", to: "/help" }].map((l, i) => (
                <NavLink key={i} to={l.to} className="mono-label underline-link" style={{ color: "#1f2320", textDecoration: "none" }}>{l.t}</NavLink>
              ))}
              {staff && (
                <NavLink to="/moderation" className="mono-label" style={{ background: "#1f2320", color: "#efe8da", borderRadius: 999, padding: "5px 12px", textDecoration: "none" }}>
                  Модерация{queue > 0 ? ` · ${queue}` : ""}
                </NavLink>
              )}
            </nav>
            <div className="mono-label hidden md:flex items-center gap-2 relative" style={{ color: "#1f232099" }}>
              <button
                onClick={() => setCityOpen((v) => !v)}
                className="mono-label flex items-center gap-1.5"
                aria-expanded={cityOpen}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#1f2320", padding: 0 }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z" stroke="#1f2320" strokeWidth="1.7"/>
                  <circle cx="12" cy="10" r="2.4" stroke="#1f2320" strokeWidth="1.7"/>
                </svg>
                {city ?? "Вся Россия"}
                <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden><path d="M1 3l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              <span>·</span>
              <span>{new Date().toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" })}</span>

              {cityOpen && <CityMenu city={city} cities={cities} onPick={(c) => { setCity(c); setCityOpen(false); }} onClose={() => setCityOpen(false)} />}
            </div>
            <div className="flex items-center gap-5 ml-auto md:ml-0">
              {user ? (
                <Link to="/account" className="mono-label underline-link hidden sm:inline" style={{ color: "#1f2320", textDecoration: "none" }}>
                  {user.name}
                </Link>
              ) : (
                <>
                  <Link to="/login" className="mono-label underline-link" style={{ color: "#1f2320", textDecoration: "none" }}>Вход</Link>
                  <Link to="/register" className="mono-label underline-link hidden sm:inline" style={{ color: "#1f2320", textDecoration: "none" }}>Регистрация</Link>
                </>
              )}

              {/* Сообщения и кабинет — только для своих: гостю эти разделы недоступны. */}
              {user && (
                <>
                  <Link to="/messages" className="hidden sm:flex items-center justify-center relative" aria-label="Сообщения" style={{ width: 34, height: 34, borderRadius: "50%", border: "1px solid #1f2320", color: "#1f2320", textDecoration: "none" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 5h16v11H8l-4 3.5V5z" stroke="#1f2320" strokeWidth="1.6" strokeLinejoin="round"/></svg>
                    {unread > 0 && (
                      <span className="mono-label flex items-center justify-center" style={{ position: "absolute", top: -6, right: -6, minWidth: 18, height: 18, padding: "0 4px", borderRadius: 999, background: "#1f2320", color: "#efe8da", border: "1.5px solid #efe8da", fontSize: 10 }}>
                        {unread > 9 ? "9+" : unread}
                      </span>
                    )}
                  </Link>
                  <Link to="/account" className="hidden sm:flex items-center justify-center" aria-label="Личный кабинет" style={{ width: 34, height: 34, borderRadius: "50%", border: "1px solid #1f2320", color: "#1f2320", textDecoration: "none", background: "#1f2320" }}>
                    <span className="font-display" style={{ color: "#efe8da", fontSize: 15 }}>{user.initial}</span>
                  </Link>
                </>
              )}
              <button className="md:hidden" style={{ background: "none", border: "none", cursor: "pointer" }} onClick={() => setMobileMenu(!mobileMenu)} aria-label="Меню">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d={mobileMenu ? "M6 6l12 12M18 6L6 18" : "M4 7h16M4 12h16M4 17h16"} stroke="#1f2320" strokeWidth="1.6" strokeLinecap="round"/></svg>
              </button>
            </div>
          </div>

          <Rule />

          <div className="flex items-end justify-between py-4">
            <Link to="/" className="font-display" style={{ color: "#1f2320", textDecoration: "none", fontSize: "clamp(30px,6vw,58px)", fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 0.85 }}>
              Клауд
            </Link>
            <span className="mono-label hidden sm:block text-center flex-1 mx-6" style={{ color: "#1f232099" }}>
              Каталог частных объявлений · Изд. № {meta?.issue ?? "417"}
            </span>
            <Link to="/new" className="hidden md:flex items-center gap-2 mono-label" style={{ background: "#1f2320", color: "#efe8da", borderRadius: 999, padding: "12px 22px", border: "none", cursor: "pointer", textDecoration: "none" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#efe8da" strokeWidth="2" strokeLinecap="round"/></svg>
              Разместить лот
            </Link>
          </div>
        </div>
      </header>

      {mobileMenu && (
        <div className="md:hidden fixed inset-0 z-40 pt-28 px-6 overflow-auto" style={{ background: "#efe8da" }}>
          <div className="flex flex-col">
            <div className="flex items-center justify-between py-4" style={{ borderBottom: "1px solid #1f232022" }}>
              <span className="mono-label" style={{ color: "#1f232099" }}>Город</span>
              <select
                value={city ?? ""}
                onChange={(e) => setCity(e.target.value || null)}
                className="mono-label"
                style={{ background: "#f6f0e3", border: "1px solid #1f232033", borderRadius: 10, padding: "8px 10px", color: "#1f2320" }}
              >
                <option value="">Вся Россия</option>
                {cities.map((c) => <option key={c.slug} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            {cats.map((c) => (
              <Link key={c.slug} to={`/category/${c.slug}`} className="flex items-center justify-between py-4 text-left" style={{ textDecoration: "none", color: "#1f2320", borderBottom: "1px solid #1f232022" }}>
                <span className="font-display" style={{ fontSize: 22 }}>{c.label}</span>
                <span className="mono-label" style={{ color: "#1f232099" }}>{c.n}</span>
              </Link>
            ))}
            {user ? (
              <>
                <Link to="/messages" className="flex items-center justify-between py-4" style={{ textDecoration: "none", color: "#1f2320", borderBottom: "1px solid #1f232022" }}>
                  <span className="font-display" style={{ fontSize: 22 }}>Сообщения</span>
                  {unread > 0 && <span className="mono-label" style={{ background: "#1f2320", color: "#efe8da", borderRadius: 999, padding: "3px 9px" }}>{unread}</span>}
                </Link>
                <Link to="/account" className="flex items-center justify-between py-4" style={{ textDecoration: "none", color: "#1f2320", borderBottom: "1px solid #1f232022" }}>
                  <span className="font-display" style={{ fontSize: 22 }}>Личный кабинет</span>
                </Link>
              </>
            ) : (
              <>
                <Link to="/login" className="flex items-center justify-between py-4" style={{ textDecoration: "none", color: "#1f2320", borderBottom: "1px solid #1f232022" }}>
                  <span className="font-display" style={{ fontSize: 22 }}>Вход</span>
                </Link>
                <Link to="/register" className="flex items-center justify-between py-4" style={{ textDecoration: "none", color: "#1f2320", borderBottom: "1px solid #1f232022" }}>
                  <span className="font-display" style={{ fontSize: 22 }}>Регистрация</span>
                </Link>
              </>
            )}
            {staff && (
              <Link to="/moderation" className="flex items-center justify-between py-4" style={{ textDecoration: "none", color: "#1f2320", borderBottom: "1px solid #1f232022" }}>
                <span className="font-display" style={{ fontSize: 22 }}>Модерация</span>
                {queue > 0 && <span className="mono-label" style={{ background: "#1f2320", color: "#efe8da", borderRadius: 999, padding: "3px 9px" }}>{queue}</span>}
              </Link>
            )}
            <Link to="/new" className="mono-label mt-6 text-center" style={{ background: "#1f2320", color: "#efe8da", borderRadius: 999, padding: "16px", textDecoration: "none" }}>Разместить лот</Link>
          </div>
        </div>
      )}

      <main className="flex-1" key={location.pathname}>
        <Outlet />
      </main>

      <footer style={{ background: "#1f2320", color: "#efe8da" }}>
        <div className="max-w-7xl mx-auto px-5 md:px-10 py-14">
          <div className="grid md:grid-cols-12 gap-10">
            <div className="md:col-span-5">
              <span className="font-display block" style={{ fontSize: "clamp(48px,8vw,96px)", fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 0.85 }}>Клауд</span>
              <p className="mt-5" style={{ fontSize: 14, lineHeight: 1.6, color: "#efe8daaa", maxWidth: 320 }}>
                Каталог частных объявлений нового образца. Издаётся ежедневно с 2026 года.
              </p>
            </div>
            {[
              { title: "Покупателям", links: [{ t: "Как купить лот", to: "/journal/garantiynaya-sdelka" }, { t: "Доставка", to: "/journal" }, { t: "Возврат", to: "/journal" }, { t: "Безопасная сделка", to: "/journal/garantiynaya-sdelka" }] },
              { title: "Продавцам", links: [{ t: "Разместить лот", to: "/new" }, { t: "Тарифы", to: "/business" }, { t: "Продвижение", to: "/business" }] },
              { title: "Компания", links: [{ t: "О проекте", to: "/about" }, { t: "Журнал", to: "/journal" }, { t: "Карьера", to: "/business" }, { t: "Помощь", to: "/help" }] },
            ].map((col) => (
              <div key={col.title} className="md:col-span-2">
                <h4 className="mono-label m-0 mb-4" style={{ color: "#efe8da99" }}>{col.title}</h4>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                  {col.links.map((l) => (
                    <li key={l.t}><Link to={l.to} style={{ color: "#efe8da", textDecoration: "none", fontSize: 14 }} className="underline-link">{l.t}</Link></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 mt-14 pt-6" style={{ borderTop: "1px solid #efe8da22" }}>
            <span className="mono-label" style={{ color: "#efe8da77" }}>© 2026 Клауд · Изд. № {meta?.issue ?? "417"} · Все права защищены</span>
            <div className="flex gap-5">
              {["VK", "Telegram", "OK"].map((s) => (
                <a key={s} href="#" className="mono-label underline-link" style={{ color: "#efe8da", textDecoration: "none" }}>{s}</a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

/** Выпадающий список городов с поиском. */
function CityMenu({
  city,
  cities,
  onPick,
  onClose,
}: {
  city: string | null;
  cities: City[];
  onPick: (city: string | null) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const found = cities.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <>
      {/* Клик мимо списка закрывает его. */}
      <div className="fixed inset-0" style={{ zIndex: 40 }} onClick={onClose} />
      <div
        className="absolute"
        style={{ top: "calc(100% + 10px)", left: 0, width: 280, background: "#efe8da", border: "1px solid #1f232022", borderRadius: 16, boxShadow: "0 18px 40px #1f232022", zIndex: 50, overflow: "hidden" }}
      >
        <div className="p-3" style={{ borderBottom: "1px solid #1f232022" }}>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Найти город"
            className="w-full outline-none mono-label"
            style={{ background: "#f6f0e3", border: "1px solid #1f232033", borderRadius: 10, padding: "10px 12px", color: "#1f2320" }}
          />
        </div>
        <div style={{ maxHeight: 320, overflowY: "auto" }}>
          <button onClick={() => onPick(null)} className="mono-label w-full text-left px-4 py-3" style={rowStyle(city === null)}>
            Вся Россия
          </button>
          {found.map((c) => (
            <button key={c.slug} onClick={() => onPick(c.name)} className="mono-label w-full text-left px-4 py-3 flex items-center justify-between gap-3" style={rowStyle(city === c.name)}>
              <span>{c.name}</span>
              {c.listingCount > 0 && <span style={{ color: "#1f232066" }}>{c.listingCount}</span>}
            </button>
          ))}
          {found.length === 0 && (
            <p className="mono-label px-4 py-4 m-0" style={{ color: "#1f232099" }}>Город не найден</p>
          )}
        </div>
      </div>
    </>
  );
}

const rowStyle = (active: boolean) =>
  ({
    background: active ? "#1f2320" : "transparent",
    color: active ? "#efe8da" : "#1f2320",
    border: "none",
    borderBottom: "1px solid #1f232014",
    cursor: "pointer",
  }) as const;
