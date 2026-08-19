import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import api, { type Message, type Thread } from "../api";
import { EmptyState } from "../components";

/** Как часто подтягиваем новые сообщения в открытом диалоге. */
const POLL_MS = 5000;

export default function Messages() {
  const [params, setParams] = useSearchParams();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [active, setActive] = useState<Thread | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [mobileThread, setMobileThread] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const activeId = params.get("thread");

  /** Меняет только ?thread=, сохраняя остальные параметры адреса. */
  const selectThread = useCallback(
    (id: string) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("thread", id);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  // Список диалогов.
  useEffect(() => {
    let cancelled = false;
    api
      .threads()
      .then(({ items }) => {
        if (cancelled) return;
        setThreads(items);
        if (!params.get("thread") && items.length) {
          selectThread(items[0].id);
        }
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Открытый диалог: полная загрузка + пометка входящих прочитанными.
  useEffect(() => {
    if (!activeId) {
      setActive(null);
      return;
    }

    let cancelled = false;
    api
      .thread(activeId)
      .then((t) => {
        if (cancelled) return;
        setActive(t);
        setThreads((prev) => prev.map((x) => (x.id === t.id ? { ...x, unread: 0 } : x)));
      })
      .catch(() => !cancelled && setActive(null));

    return () => { cancelled = true; };
  }, [activeId]);

  // Опрос новых сообщений — до появления WebSocket этого достаточно.
  useEffect(() => {
    if (!active) return;

    const id = setInterval(async () => {
      const lastId = active.messages.at(-1)?.id ?? 0;
      try {
        const fresh = await api.newMessages(active.id, lastId);
        if (fresh.length) appendMessages(active.id, fresh);
      } catch {
        // Сеть моргнула — попробуем на следующем тике.
      }
    }, POLL_MS);

    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, active?.messages.at(-1)?.id]);

  const appendMessages = useCallback((threadId: string, incoming: Message[]) => {
    setActive((prev) => {
      if (!prev || prev.id !== threadId) return prev;
      const known = new Set(prev.messages.map((m) => m.id));
      const fresh = incoming.filter((m) => !known.has(m.id));
      return fresh.length ? { ...prev, messages: [...prev.messages, ...fresh] } : prev;
    });
    setThreads((prev) =>
      prev.map((t) => (t.id === threadId ? { ...t, messages: incoming.slice(-1) } : t)),
    );
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [active?.messages.length, active?.id]);

  const send = async () => {
    const text = draft.trim();
    if (!text || !active || sending) return;

    setSending(true);
    setDraft("");
    try {
      const message = await api.sendMessage(active.id, text);
      appendMessages(active.id, [message]);
    } catch {
      setDraft(text); // возвращаем текст в поле, чтобы не потерять
    } finally {
      setSending(false);
    }
  };

  const openThread = (id: string) => {
    selectThread(id);
    setMobileThread(true);
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-5 md:px-10 py-32 text-center">
        <span className="mono-label" style={{ color: "#1f232099" }}>Загрузка диалогов…</span>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-5 md:px-10">
      <div className="flex items-center gap-2 py-5 mono-label" style={{ color: "#1f232099" }}>
        <Link to="/" style={{ color: "#1f232099", textDecoration: "none" }} className="underline-link">Клауд</Link>
        <span>/</span><span style={{ color: "#1f2320" }}>Сообщения</span>
      </div>

      <div className="pb-8">
        {threads.length === 0 ? (
          <EmptyState
            title="Диалогов пока нет"
            hint="Напишите продавцу со страницы лота — переписка появится здесь"
            action={<Link to="/catalog" className="mono-label" style={{ background: "#1f2320", color: "#efe8da", borderRadius: 999, padding: "14px 32px", textDecoration: "none" }}>В каталог</Link>}
          />
        ) : (
          <div className="grid md:grid-cols-12" style={{ border: "1px solid #1f232022", borderRadius: 20, overflow: "hidden", height: "calc(100vh - 220px)", minHeight: 520, background: "#f6f0e3" }}>
            {/* ── Conversation list ── */}
            <aside className={"md:col-span-4 flex flex-col " + (mobileThread ? "hidden md:flex" : "flex")} style={{ borderRight: "1px solid #1f232022" }}>
              <div className="px-5 py-4" style={{ borderBottom: "1px solid #1f232022" }}>
                <h1 className="font-display" style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>Сообщения</h1>
                <span className="mono-label" style={{ color: "#1f232099" }}>{threads.length} {plural(threads.length)}</span>
              </div>
              <div className="flex-1 overflow-y-auto">
                {threads.map((t) => {
                  const last = t.messages[t.messages.length - 1];
                  return (
                    <button key={t.id} onClick={() => openThread(t.id)} className="chip w-full text-left flex items-center gap-3 px-5 py-4" style={{ background: t.id === activeId ? "#e8e0d0" : "transparent", border: "none", borderBottom: "1px solid #1f232022", cursor: "pointer" }}>
                      <div className="relative" style={{ flexShrink: 0 }}>
                        <div className="overflow-hidden" style={{ width: 48, height: 48, borderRadius: 12, background: "#e1d9c8" }}>
                          {t.img && <img src={t.img} alt={t.lotTitle} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", filter: "grayscale(1)" }} />}
                        </div>
                        {t.online && <span style={{ position: "absolute", bottom: -2, right: -2, width: 12, height: 12, borderRadius: "50%", background: "#1f2320", border: "2px solid #f6f0e3" }} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</span>
                          <span className="mono-label" style={{ color: "#1f232099", flexShrink: 0 }}>{last?.time}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="m-0 mt-0.5 flex-1" style={{ fontSize: 13, color: "#1f232099", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {last ? `${last.from === "me" ? "Вы: " : ""}${last.text}` : "Нет сообщений"}
                          </p>
                          {t.unread > 0 && (
                            <span className="mono-label flex items-center justify-center" style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: 999, background: "#1f2320", color: "#efe8da", fontSize: 10, flexShrink: 0 }}>{t.unread}</span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </aside>

            {/* ── Active thread ── */}
            <section className={"md:col-span-8 flex flex-col " + (mobileThread ? "flex" : "hidden md:flex")} style={{ background: "#efe8da" }}>
              {!active ? (
                <div className="flex-1 flex items-center justify-center">
                  <span className="mono-label" style={{ color: "#1f232099" }}>Выберите диалог</span>
                </div>
              ) : (
                <>
                  {/* Thread header */}
                  <div className="flex items-center gap-3 px-5 py-3" style={{ borderBottom: "1px solid #1f232022", background: "#f6f0e3" }}>
                    <button className="md:hidden" onClick={() => setMobileThread(false)} aria-label="Назад" style={{ background: "none", border: "none", cursor: "pointer" }}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M15 6l-6 6 6 6" stroke="#1f2320" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </button>
                    <div className="flex items-center justify-center font-display" style={{ width: 40, height: 40, borderRadius: "50%", background: "#1f2320", color: "#efe8da", fontSize: 18, flexShrink: 0 }}>{active.initial}</div>
                    <div className="flex-1 min-w-0">
                      <Link to={`/seller/${active.peerId}`} style={{ fontSize: 15, fontWeight: 600, color: "#1f2320", textDecoration: "none" }} className="underline-link">{active.name}</Link>
                      <p className="mono-label m-0" style={{ color: "#1f232099" }}>{active.online ? "В сети" : "Был(а) недавно"}</p>
                    </div>
                    <span className="mono-label" style={{ color: "#1f232099" }}>{active.role === "seller" ? "вы продавец" : "вы покупатель"}</span>
                  </div>

                  {/* Lot context */}
                  <Link to={`/lot/${active.listingId}`} className="flex items-center gap-3 px-5 py-3 mx-4 mt-4" style={{ background: "#f6f0e3", border: "1px solid #1f232022", borderRadius: 14, textDecoration: "none", color: "#1f2320" }}>
                    <div className="overflow-hidden" style={{ width: 40, height: 40, borderRadius: 10, background: "#e1d9c8", flexShrink: 0 }}>
                      {active.img && <img src={active.img} alt={active.lotTitle} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="m-0" style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{active.lotTitle}</p>
                      <span className="mono-label" style={{ color: "#1f232099" }}>Лот {active.lot} · {active.price}</span>
                    </div>
                    <span className="mono-label" style={{ color: "#1f232099" }}>→</span>
                  </Link>

                  {/* Messages */}
                  <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-3">
                    {active.messages.length === 0 && (
                      <p className="mono-label text-center" style={{ color: "#1f232099" }}>Напишите первым — продавец получит уведомление</p>
                    )}
                    {active.messages.map((m) => (
                      <div key={m.id} className="flex flex-col" style={{ alignItems: m.from === "me" ? "flex-end" : "flex-start" }}>
                        <div style={{ maxWidth: "78%", background: m.from === "me" ? "#1f2320" : "#f6f0e3", color: m.from === "me" ? "#efe8da" : "#1f2320", border: m.from === "me" ? "none" : "1px solid #1f232022", borderRadius: m.from === "me" ? "16px 16px 4px 16px" : "16px 16px 16px 4px", padding: "11px 15px", fontSize: 14.5, lineHeight: 1.45, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                          {m.text}
                        </div>
                        <span className="mono-label mt-1" style={{ color: "#1f232066" }}>
                          {m.time}{m.from === "me" && m.read ? " · прочитано" : ""}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Composer */}
                  <div className="flex items-center gap-3 px-4 py-3" style={{ borderTop: "1px solid #1f232022", background: "#f6f0e3" }}>
                    <input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                      placeholder="Написать сообщение..."
                      maxLength={4000}
                      className="flex-1 outline-none"
                      style={{ border: "1px solid #1f232033", borderRadius: 999, background: "#efe8da", padding: "13px 18px", fontSize: 14 }}
                    />
                    <button onClick={send} disabled={sending || !draft.trim()} aria-label="Отправить" style={{ background: "#1f2320", border: "none", borderRadius: "50%", width: 46, height: 46, cursor: sending ? "wait" : "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", opacity: sending || !draft.trim() ? 0.6 : 1 }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 12l16-8-6 16-3-6-7-2z" stroke="#efe8da" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </button>
                  </div>
                </>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function plural(n: number) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "диалог";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "диалога";
  return "диалогов";
}
