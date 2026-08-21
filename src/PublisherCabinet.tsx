import { useRef, useState } from "react";
import { Link } from "react-router";
import api, { ApiError, type ImportReport, type Listing, type PublisherInvite, type PublisherShop } from "./api";
import { useAsync } from "./hooks";
import { EmptyState, Rule } from "./components";
import { plural } from "./Reviews";

const money = (n: number) => `${n.toLocaleString("ru-RU")} ₽`;
const num = (n: number) => n.toLocaleString("ru-RU");

/**
 * Издательский кабинет: показатели витрин, сборка полосы «Выбор издания»
 * и массовая загрузка каталога таблицей.
 *
 * Все числа считаются по базе. Историю просмотров по дням площадка не хранит,
 * поэтому на графике то, что есть на самом деле: отклики и подача лотов.
 */
export default function PublisherCabinet({ slug }: { slug: string }) {
  const { data, loading, error, reload } = useAsync(() => api.publisherCabinet(), []);

  if (loading) {
    return <p className="mono-label py-24 text-center" style={{ color: "#1f232099" }}>Загрузка…</p>;
  }

  if (error || !data) {
    return (
      <div className="py-16 text-center" style={{ border: "1px dashed #1f232033", borderRadius: 20 }}>
        <p className="font-display m-0" style={{ fontSize: 26 }}>Кабинет недоступен</p>
        <p className="mono-label mt-2" style={{ color: "#1f232099" }}>
          {error instanceof ApiError ? error.message : "Не удалось загрузить показатели"}
        </p>
        <button onClick={reload} className="mono-label mt-6" style={{ background: "#1f2320", color: "#efe8da", border: "none", borderRadius: 999, padding: "14px 32px", cursor: "pointer" }}>
          Повторить
        </button>
      </div>
    );
  }

  const { metrics, trend, shops, invites, candidates, picks, plan, editor } = data;
  const maxLots = Math.max(1, ...shops.map((s) => s.lots));

  const TILES = [
    { v: num(metrics.views), k: "просмотров на витринах", hint: `${shops.length} ${plural(shops.length, "бренд", "бренда", "брендов")}` },
    { v: num(metrics.responses), k: "откликов покупателей", hint: "диалогов с покупателями" },
    { v: `${metrics.conversion}%`, k: "конверсия в диалог", hint: "отклики к просмотрам" },
    { v: num(metrics.lots), k: "лотов на витринах", hint: "опубликовано сейчас" },
  ];

  return (
    <div className="flex flex-col gap-10 pb-16">
      {/* Показатели */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px" style={{ background: "#1f232022", border: "1px solid #1f232022", borderRadius: 16, overflow: "hidden" }}>
        {TILES.map((t) => (
          <div key={t.k} className="p-6" style={{ background: "#f6f0e3" }}>
            <p className="font-display m-0" style={{ fontSize: "clamp(26px,3vw,38px)", fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1 }}>{t.v}</p>
            <p className="mono-label m-0 mt-2" style={{ color: "#1f232099" }}>{t.k}</p>
            <p className="mono-label m-0 mt-1" style={{ color: "#1f232066" }}>{t.hint}</p>
          </div>
        ))}
      </div>

      {/* Графики */}
      <div className="grid md:grid-cols-12 gap-4">
        <div className="md:col-span-7 p-6" style={{ border: "1px solid #1f232022", borderRadius: 18, background: "#f6f0e3" }}>
          <div className="flex items-baseline justify-between gap-3 flex-wrap mb-5">
            <h3 className="font-display m-0" style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>
              Отклики и подача лотов
            </h3>
            <span className="mono-label" style={{ color: "#1f232099" }}>14 дней</span>
          </div>
          <TrendChart trend={trend} />
        </div>

        <div className="md:col-span-5 p-6" style={{ border: "1px solid #1f232022", borderRadius: 18, background: "#f6f0e3" }}>
          <h3 className="font-display m-0 mb-5" style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>
            Лоты по витринам
          </h3>
          {shops.length ? (
            <div className="flex flex-col gap-4">
              {shops.map((s) => (
                <div key={s.id}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span style={{ fontSize: 14 }}>{s.brand}</span>
                    <span className="mono-label" style={{ color: "#1f232099" }}>{s.lots}</span>
                  </div>
                  <div className="mt-2" style={{ height: 10, borderRadius: 999, background: "#1f232014" }}>
                    <div style={{ width: `${(s.lots / maxLots) * 100}%`, height: "100%", borderRadius: 999, background: "#1f2320" }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mono-label" style={{ color: "#1f232099" }}>Витрины ещё не подключены.</p>
          )}
        </div>
      </div>

      <Rule />

      {/* Витрины под обложкой */}
      <ShopsBlock shops={shops} invites={invites} max={plan.maxShops} onChange={reload} />

      <Rule />

      {/* Полоса на главной */}
      <PicksEditor
        candidates={candidates}
        initial={picks}
        max={plan.maxPicks}
        onSaved={reload}
        slug={slug}
      />

      <Rule />

      {/* Загрузка каталога и редактор */}
      <div className="grid md:grid-cols-12 gap-4">
        <div className="md:col-span-7">
          <ImportBlock onDone={reload} />
        </div>
        <div className="md:col-span-5 p-7 flex flex-col" style={{ background: "#1f2320", color: "#efe8da", borderRadius: 18 }}>
          <span className="mono-label" style={{ color: "#efe8daaa" }}>Персональное сопровождение</span>
          <h3 className="font-display m-0 mt-3" style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>
            Ваш редактор издания
          </h3>
          {editor ? (
            <>
              <div className="flex items-center gap-4 mt-5">
                <span className="flex items-center justify-center font-display" style={{ width: 54, height: 54, borderRadius: "50%", background: "#efe8da", color: "#1f2320", fontSize: 24, flexShrink: 0 }}>
                  {editor.initial}
                </span>
                <div>
                  <p className="m-0" style={{ fontSize: 18, fontWeight: 600 }}>{editor.name}</p>
                  <p className="mono-label m-0 mt-1" style={{ color: "#efe8daaa" }}>{editor.role}</p>
                </div>
              </div>
              {editor.bio && (
                <p className="m-0 mt-5" style={{ fontSize: 14.5, lineHeight: 1.6, color: "#efe8dacc" }}>{editor.bio}</p>
              )}
              <div className="flex gap-3 flex-wrap mt-6">
                <span className="mono-label" style={{ border: "1px solid #efe8da44", borderRadius: 999, padding: "12px 20px" }}>
                  {editor.phone}
                </span>
                <Link to="/messages" className="mono-label" style={{ background: "#efe8da", color: "#1f2320", borderRadius: 999, padding: "12px 20px", textDecoration: "none" }}>
                  Написать в чат
                </Link>
              </div>
            </>
          ) : (
            <p className="m-0 mt-5" style={{ fontSize: 14.5, lineHeight: 1.6, color: "#efe8dacc" }}>
              Редактор пока не закреплён. Его назначает администрация Клауд — напишите в поддержку,
              и за изданием закрепят сотрудника редакции.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Витрины под обложкой: список магазинов дома, отправленные приглашения
 * и форма, чтобы позвать новую витрину.
 *
 * Витрина входит в издание только после согласия своего владельца —
 * приглашение он видит у себя во вкладке «Витрина».
 */
function ShopsBlock({
  shops,
  invites,
  max,
  onChange,
}: {
  shops: PublisherShop[];
  invites: PublisherInvite[];
  max: number;
  onChange: () => void;
}) {
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState("");

  const members = shops.filter((s) => !s.owner);

  const act = async (run: () => Promise<unknown>, done = "") => {
    setBusy(true);
    setError("");
    setSent("");
    try {
      await run();
      setSent(done);
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось выполнить действие");
    } finally {
      setBusy(false);
    }
  };

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handle.trim() || busy) return;
    await act(() => api.invitePublisherShop(handle.trim()), "Приглашение отправлено");
    setHandle("");
  };

  return (
    <div>
      <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
        <div>
          <span className="mono-label" style={{ color: "#1f232099" }}>Издательский дом</span>
          <h3 className="font-display m-0 mt-3" style={{ fontSize: "clamp(24px,3.4vw,40px)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1 }}>
            Витрины под обложкой
          </h3>
          <p className="mono-label m-0 mt-3" style={{ color: "#1f232099" }}>
            {members.length} из {max} · витрина входит в издание после согласия владельца
          </p>
        </div>
      </div>

      {error && <p className="mono-label mb-4" style={{ color: "#a33" }}>{error}</p>}
      {sent && <p className="mono-label mb-4" style={{ color: "#1f232099" }}>{sent}</p>}

      <div className="flex flex-col mb-6" style={{ border: "1px solid #1f232022", borderRadius: 16, overflow: "hidden" }}>
        {shops.map((shop, i) => (
          <div key={shop.id} className="flex items-center justify-between gap-4 flex-wrap px-5 py-4" style={{ background: "#f6f0e3", borderTop: i ? "1px solid #1f232022" : "none" }}>
            <div className="min-w-0">
              <Link to={`/shop/${shop.id}`} style={{ fontSize: 15, fontWeight: 600, color: "#1f2320", textDecoration: "none" }} className="underline-link">
                {shop.brand}
              </Link>
              <p className="mono-label m-0 mt-1" style={{ color: "#1f232099" }}>
                {shop.city} · {shop.lots} {plural(shop.lots, "лот", "лота", "лотов")}
                {shop.owner ? " · витрина издателя" : ""}
              </p>
            </div>
            {!shop.owner && (
              <button
                type="button"
                disabled={busy}
                onClick={() => act(() => api.removePublisherShop(shop.id), "Витрина убрана из издания")}
                className="mono-label"
                style={{ border: "1px solid #1f232033", background: "transparent", borderRadius: 999, padding: "10px 18px", cursor: "pointer", color: "#1f2320" }}
              >
                Убрать
              </button>
            )}
          </div>
        ))}

        {invites.map((invite) => (
          <div key={invite.id} className="flex items-center justify-between gap-4 flex-wrap px-5 py-4" style={{ background: "#efe8da", borderTop: "1px solid #1f232022" }}>
            <div className="min-w-0">
              <span style={{ fontSize: 15, fontWeight: 600 }}>{invite.brand}</span>
              <p className="mono-label m-0 mt-1" style={{ color: "#1f232099" }}>
                {invite.city} · ждём ответа владельца
              </p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => act(() => api.cancelPublisherInvite(invite.id), "Приглашение отозвано")}
              className="mono-label"
              style={{ border: "1px solid #1f232033", background: "transparent", borderRadius: 999, padding: "10px 18px", cursor: "pointer", color: "#1f2320" }}
            >
              Отозвать
            </button>
          </div>
        ))}
      </div>

      {members.length < max ? (
        <form onSubmit={invite} className="flex gap-3 flex-wrap items-center">
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="Адрес витрины или телефон владельца"
            aria-label="Адрес витрины или телефон владельца"
            style={{ border: "1px solid #1f232033", borderRadius: 14, background: "#f6f0e3", padding: "14px 16px", fontSize: 15, outline: "none", flex: "1 1 280px", minWidth: 0 }}
            maxLength={80}
          />
          <button type="submit" disabled={busy} className="mono-label" style={{ background: "#1f2320", color: "#efe8da", border: "none", borderRadius: 999, padding: "15px 28px", cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}>
            {busy ? "Отправляем…" : "Пригласить витрину"}
          </button>
        </form>
      ) : (
        <p className="mono-label" style={{ color: "#1f232099" }}>
          Под обложкой уже {max} витрин — больше тариф не вмещает.
        </p>
      )}
    </div>
  );
}

/** Ломаная по дням: отклики и подача лотов. */
function TrendChart({ trend }: { trend: { day: string; responses: number; lots: number }[] }) {
  const W = 640;
  const H = 180;
  const max = Math.max(1, ...trend.map((d) => Math.max(d.responses, d.lots)));
  const x = (i: number) => (i / Math.max(1, trend.length - 1)) * W;
  const y = (v: number) => H - (v / max) * (H - 10);
  const line = (key: "responses" | "lots") =>
    trend.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join(" ");

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H + 6}`} style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }} role="img" aria-label="График откликов и подачи лотов за 14 дней">
        {[0, 0.5, 1].map((t) => (
          <line key={t} x1="0" x2={W} y1={y(max * t)} y2={y(max * t)} stroke="#1f232022" strokeWidth="1" />
        ))}
        <path d={line("lots")} fill="none" stroke="#1f232055" strokeWidth="2" strokeLinejoin="round" />
        <path d={line("responses")} fill="none" stroke="#1f2320" strokeWidth="2.5" strokeLinejoin="round" />
        {trend.map((d, i) => (
          <circle key={d.day} cx={x(i)} cy={y(d.responses)} r={2.5} fill="#1f2320">
            <title>{`${d.day}: откликов ${d.responses}, лотов ${d.lots}`}</title>
          </circle>
        ))}
      </svg>
      <div className="flex items-center justify-between mt-3">
        <span className="mono-label" style={{ color: "#1f232066" }}>{trend[0]?.day}</span>
        <span className="mono-label" style={{ color: "#1f232099" }}>
          ▬ отклики · <span style={{ color: "#1f232066" }}>▬ подано лотов</span>
        </span>
        <span className="mono-label" style={{ color: "#1f232066" }}>{trend[trend.length - 1]?.day}</span>
      </div>
    </>
  );
}

/** Сборка полосы «Выбор издания»: до `max` лотов в заданном порядке. */
function PicksEditor({
  candidates,
  initial,
  max,
  slug,
  onSaved,
}: {
  candidates: Listing[];
  initial: Listing[];
  max: number;
  slug: string;
  onSaved: () => void;
}) {
  const [chosen, setChosen] = useState<number[]>(initial.map((l) => l.id));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const toggle = (id: number) => {
    setSaved(false);
    setError("");
    setChosen((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length >= max
          ? prev
          : [...prev, id],
    );
  };

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await api.savePicks(chosen);
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось обновить полосу");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
        <div>
          <span className="mono-label" style={{ color: "#1f232099" }}>Полоса на главной</span>
          <h3 className="font-display m-0 mt-3" style={{ fontSize: "clamp(24px,3.4vw,40px)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1 }}>
            Что стоит на витрине выпуска
          </h3>
          <p className="mono-label m-0 mt-3" style={{ color: "#1f232099" }}>
            Выбрано {chosen.length} из {max} · нажмите на лот, чтобы добавить или убрать
          </p>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <Link to={`/publisher/${slug}`} className="mono-label underline-link" style={{ color: "#1f2320", textDecoration: "none" }}>
            Как это на полосе →
          </Link>
          <button onClick={save} disabled={busy} className="mono-label" style={{ background: "#1f2320", color: "#efe8da", border: "none", borderRadius: 999, padding: "15px 28px", cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}>
            {busy ? "Обновляем…" : "Обновить подборку"}
          </button>
        </div>
      </div>

      {saved && <p className="mono-label mb-4" style={{ color: "#1f232099" }}>Полоса обновлена</p>}
      {error && <p className="mono-label mb-4" style={{ color: "#a33" }}>{error}</p>}

      {candidates.length ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {candidates.map((l) => {
            const at = chosen.indexOf(l.id);
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => toggle(l.id)}
                className="text-left"
                style={{
                  border: at >= 0 ? "2px solid #1f2320" : "1px solid #1f232022",
                  borderRadius: 14,
                  overflow: "hidden",
                  background: "#f6f0e3",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                <div className="relative" style={{ aspectRatio: "4/5", background: "#e1d9c8" }}>
                  <img src={l.img} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  <span className="mono-label absolute" style={{ top: 8, left: 8, background: "#efe8da", borderRadius: 8, padding: "3px 8px" }}>
                    Лот {l.lot}
                  </span>
                  {at >= 0 && (
                    <span className="mono-label absolute flex items-center justify-center" style={{ top: 8, right: 8, background: "#1f2320", color: "#efe8da", borderRadius: "50%", width: 26, height: 26 }}>
                      {at + 1}
                    </span>
                  )}
                </div>
                <div className="p-3">
                  <p className="font-display m-0" style={{ fontSize: 15, fontWeight: 700 }}>{money(l.priceValue)}</p>
                  <p className="m-0 mt-1" style={{ fontSize: 12.5, lineHeight: 1.35, color: "#1f2320cc", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {l.title}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <EmptyState title="Нет опубликованных лотов" hint="Полоса собирается из активных лотов витрин издания" />
      )}
    </div>
  );
}

/** Массовая загрузка каталога таблицей CSV. */
function ImportBlock({ onDone }: { onDone: () => void }) {
  const [csv, setCsv] = useState("");
  const [report, setReport] = useState<ImportReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    setCsv(await files[0].text());
    setReport(null);
    setError("");
  };

  const send = async () => {
    if (!csv.trim()) {
      setError("Сначала выберите файл или вставьте таблицу");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api.importCatalog(csv);
      setReport(result);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось разобрать таблицу");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-7 h-full" style={{ border: "1px solid #1f232022", borderRadius: 18, background: "#f6f0e3" }}>
      <span className="mono-label" style={{ color: "#1f232099" }}>Массовая загрузка каталога</span>
      <h3 className="font-display m-0 mt-3" style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>
        Загрузка таблицей
      </h3>
      <p className="m-0 mt-3" style={{ fontSize: 14.5, lineHeight: 1.6, color: "#1f2320cc" }}>
        Файл CSV с колонками <code>title; price; cat; cond; location; description; image</code> —
        до 200 строк за раз. Номера лотов присваиваются автоматически, лоты уходят на проверку модератору.
      </p>

      <input ref={fileInput} type="file" accept=".csv,text/csv,text/plain" hidden onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />

      <div className="flex gap-3 flex-wrap mt-5">
        <button type="button" onClick={() => fileInput.current?.click()} className="mono-label" style={{ border: "1px dashed #1f232055", background: "transparent", borderRadius: 999, padding: "13px 22px", cursor: "pointer", color: "#1f2320" }}>
          ↑ Выбрать таблицу каталога
        </button>
        <button type="button" onClick={send} disabled={busy} className="mono-label" style={{ background: "#1f2320", color: "#efe8da", border: "none", borderRadius: 999, padding: "13px 26px", cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}>
          {busy ? "Загружаем…" : "Загрузить"}
        </button>
      </div>

      {csv && !report && (
        <p className="mono-label m-0 mt-4" style={{ color: "#1f232099" }}>
          Готово к загрузке: {csv.trim().split("\n").length - 1} строк
        </p>
      )}
      {error && <p className="mono-label m-0 mt-4" style={{ color: "#a33" }}>{error}</p>}

      {report && (
        <div className="mt-5 flex flex-col" style={{ border: "1px solid #1f232022", borderRadius: 14, overflow: "hidden" }}>
          {report.log.map((row, i) => (
            <div key={i} className="flex items-start gap-3 px-4 py-3" style={{ borderTop: i ? "1px solid #1f232014" : "none", background: "#efe8da" }}>
              <span className="mono-label" style={{ color: row.ok ? "#1f2320" : "#a33" }}>{row.ok ? "✓" : "✕"}</span>
              <span style={{ fontSize: 14, lineHeight: 1.45 }}>{row.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
