import { useRef, useState } from "react";
import { Link } from "react-router";
import api, { ApiError, type EditionState, type Plan, type ShopLink, type ShopSection, type Storefront } from "./api";
import { useAuth } from "./auth";
import { useAsync } from "./hooks";
import { FieldError, Rule } from "./components";
import { ShopCover } from "./ShopCover";

const field = {
  border: "1px solid #1f232033",
  borderRadius: 14,
  background: "#f6f0e3",
  padding: "14px 16px",
  fontSize: 15,
  outline: "none",
  width: "100%",
} as const;

const label = { color: "#1f232099", display: "block", marginBottom: 8 } as const;

/**
 * Витрина и издательский дом: приглашения под чужую обложку и выход из издания.
 *
 * Витрина попадает в дом только с согласия владельца, поэтому решение
 * принимается здесь, а не в кабинете издателя.
 */
function EditionBox() {
  const { data, loading, reload } = useAsync(() => api.edition(), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [state, setState] = useState<EditionState | null>(null);

  const current = state ?? data;
  if (loading || !current) return null;
  if (!current.publisher && current.invites.length === 0) return null;

  const act = async (run: () => Promise<EditionState>) => {
    setBusy(true);
    setError("");
    try {
      setState(await run());
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось выполнить действие");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-8 flex flex-col gap-3">
      {current.publisher && (
        <div className="flex items-center justify-between gap-4 flex-wrap px-5 py-4" style={{ border: "1px solid #1f232033", borderRadius: 16 }}>
          <span className="mono-label" style={{ color: "#1f232099" }}>
            ✳ Витрина входит в издание{" "}
            <Link to={`/publisher/${current.publisher.id}`} className="underline-link" style={{ color: "#1f2320", textDecoration: "none" }}>
              {current.publisher.brand}
            </Link>
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => act(() => api.leaveEdition())}
            className="mono-label"
            style={{ border: "1px solid #1f232033", background: "transparent", borderRadius: 999, padding: "10px 18px", cursor: "pointer", color: "#1f2320" }}
          >
            Выйти из издания
          </button>
        </div>
      )}

      {current.invites.map((invite) => (
        <div key={invite.id} className="flex items-center justify-between gap-4 flex-wrap px-5 py-4" style={{ background: "#1f2320", color: "#efe8da", borderRadius: 16 }}>
          <div>
            <span className="mono-label" style={{ color: "#efe8daaa" }}>Приглашение в издание</span>
            <p className="m-0 mt-2" style={{ fontSize: 16, fontWeight: 600 }}>
              {invite.brand} зовёт вашу витрину под свою обложку
            </p>
            <p className="mono-label m-0 mt-1" style={{ color: "#efe8daaa" }}>
              {invite.city} · витрина останется вашей, лоты никуда не переходят
            </p>
          </div>
          <div className="flex gap-3 flex-wrap">
            <button
              type="button"
              disabled={busy}
              onClick={() => act(() => api.acceptEdition(invite.id))}
              className="mono-label"
              style={{ background: "#efe8da", color: "#1f2320", border: "none", borderRadius: 999, padding: "12px 22px", cursor: "pointer" }}
            >
              Принять
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => act(() => api.declineEdition(invite.id))}
              className="mono-label"
              style={{ border: "1px solid #efe8da44", background: "transparent", color: "#efe8da", borderRadius: 999, padding: "12px 22px", cursor: "pointer" }}
            >
              Отклонить
            </button>
          </div>
        </div>
      ))}

      {error && <p className="mono-label m-0" style={{ color: "#a33" }}>{error}</p>}
    </div>
  );
}

/** Дата продления тарифа словами: «14 марта 2027». */
const RU_MONTHS = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

export function planDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(`${iso}`.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCDate()} ${RU_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * Вкладка «Витрина» личного кабинета: оформление магазина с предпросмотром.
 * Доступна на тарифах «Витрина» и «Издание» — разделы только на «Издании».
 */
export default function StorefrontEditor() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useAsync(() => api.myStorefront(), []);

  if (loading) {
    return (
      <p className="mono-label py-24 text-center" style={{ color: "#1f232099" }}>Загрузка…</p>
    );
  }

  if (error || !data || !user) {
    return (
      <div className="py-16 text-center" style={{ border: "1px dashed #1f232033", borderRadius: 20 }}>
        <p className="font-display m-0" style={{ fontSize: 26 }}>Витрина недоступна</p>
        <p className="mono-label mt-2" style={{ color: "#1f232099" }}>
          {error instanceof ApiError ? error.message : "Не удалось загрузить настройки"}
        </p>
        <button onClick={reload} className="mono-label mt-6" style={{ background: "#1f2320", color: "#efe8da", border: "none", borderRadius: 999, padding: "14px 32px", cursor: "pointer" }}>
          Повторить
        </button>
      </div>
    );
  }

  return <Editor initial={data.storefront} plan={data.plan} cats={data.categories} slug={user.id} />;
}

function Editor({
  initial,
  plan,
  cats,
  slug,
}: {
  initial: Storefront;
  plan: Plan;
  cats: { slug: string; label: string }[];
  slug: string;
}) {
  const { user } = useAuth();
  const [brand, setBrand] = useState(initial.brand);
  const [tagline, setTagline] = useState(initial.tagline);
  const [cover, setCover] = useState(initial.cover);
  const [about, setAbout] = useState(initial.about);
  const [hours, setHours] = useState(initial.conditions.hours);
  const [delivery, setDelivery] = useState(initial.conditions.delivery);
  const [warranty, setWarranty] = useState(initial.conditions.warranty);
  const [links, setLinks] = useState<ShopLink[]>(initial.links);
  const [sections, setSections] = useState<ShopSection[]>(initial.sections);

  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const until = planDate(user?.plan.until ?? null);

  const pickCover = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setError("");
    try {
      const [url] = await api.uploadImages([files[0]]);
      setCover(url);
      setSaved(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось загрузить обложку");
    } finally {
      setUploading(false);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;

    setBusy(true);
    setError("");
    setFields({});
    try {
      const next = await api.saveStorefront({
        brand, tagline, cover, about, hours, delivery, warranty, links, sections,
      });
      setLinks(next.links);
      setSections(next.sections);
      setSaved(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFields(err.details ?? {});
      } else {
        setError("Не удалось сохранить витрину");
      }
    } finally {
      setBusy(false);
    }
  };

  const touched = () => { setSaved(false); setError(""); };

  return (
    <form onSubmit={save} className="py-8">
      {/* Издание: приглашения и текущее членство */}
      <EditionBox />

      {/* Статус тарифа */}
      <div className="flex items-center justify-between gap-4 flex-wrap mb-8" style={{ border: "1px solid #1f232033", borderRadius: 16, padding: "16px 20px" }}>
        <span className="mono-label" style={{ color: "#1f232099" }}>
          ✳ Витрина активна{until ? ` · продление ${until}` : ""}
        </span>
        <Link to={`/shop/${slug}`} className="mono-label underline-link" style={{ color: "#1f2320", textDecoration: "none" }}>
          Открыть публичную витрину →
        </Link>
      </div>

      {/* Предпросмотр обложки */}
      <div className="mb-10">
        <ShopCover
          name={user?.name ?? ""}
          brand={brand || "Название бренда"}
          tagline={tagline}
          cover={cover}
          initial={user?.initial ?? "К"}
          city={user?.city ?? ""}
          links={links}
          badge="Предпросмотр"
        />
      </div>

      {/* Оформление */}
      <div className="grid md:grid-cols-12 gap-6 md:gap-10 pb-10">
        <div className="md:col-span-4">
          <h3 className="mono-label" style={{ color: "#1f232099" }}>Оформление витрины</h3>
          <p className="m-0 mt-3" style={{ fontSize: 15, lineHeight: 1.6, color: "#1f2320cc" }}>
            Обложка, название бренда и слоган видны на публичной странице вашего магазина.
          </p>
        </div>
        <div className="md:col-span-8">
          <div className="flex items-center gap-4 flex-wrap mb-6" style={{ border: "1px solid #1f232033", borderRadius: 16, padding: 14 }}>
            <div style={{ width: 92, height: 56, borderRadius: 10, overflow: "hidden", background: "#e1d9c8", flexShrink: 0 }}>
              {cover && <img src={cover} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", filter: "grayscale(1)" }} />}
            </div>
            <div style={{ flex: "1 1 160px", minWidth: 0 }}>
              <span className="mono-label" style={{ color: "#1f232099" }}>Обложка</span>
              <p className="m-0 mt-1" style={{ fontSize: 14, color: "#1f2320cc" }}>
                1400×560, ч/б-обработка автоматически
              </p>
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => { pickCover(e.target.files); e.target.value = ""; }}
            />
            <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading} className="mono-label" style={{ border: "1px solid #1f2320", background: "transparent", borderRadius: 999, padding: "12px 22px", cursor: "pointer" }}>
              {uploading ? "Загрузка…" : cover ? "Заменить" : "Загрузить"}
            </button>
            {cover && (
              <button type="button" onClick={() => { setCover(""); touched(); }} className="mono-label" style={{ border: "none", background: "transparent", color: "#1f232099", cursor: "pointer" }}>
                Убрать
              </button>
            )}
          </div>

          <label className="mono-label" style={label}>Название бренда</label>
          <input aria-label="Название бренда" value={brand} onChange={(e) => { setBrand(e.target.value); touched(); }} style={field} maxLength={60} />
          <FieldError>{fields.brand}</FieldError>

          <label className="mono-label mt-5" style={label}>Слоган</label>
          <input aria-label="Слоган" value={tagline} onChange={(e) => { setTagline(e.target.value); touched(); }} style={field} maxLength={160} />
          <FieldError>{fields.tagline}</FieldError>

          <label className="mono-label mt-5" style={label}>О магазине</label>
          <textarea aria-label="О магазине" value={about} onChange={(e) => { setAbout(e.target.value); touched(); }} rows={5} style={{ ...field, resize: "vertical", lineHeight: 1.6 }} maxLength={1200} />
          <FieldError>{fields.about}</FieldError>
        </div>
      </div>

      <Rule />

      {/* Условия */}
      <div className="grid md:grid-cols-12 gap-6 md:gap-10 py-10">
        <div className="md:col-span-4">
          <h3 className="mono-label" style={{ color: "#1f232099" }}>Условия магазина</h3>
          <p className="m-0 mt-3" style={{ fontSize: 15, lineHeight: 1.6, color: "#1f2320cc" }}>
            Короткие подписи в блоке «Условия» на витрине.
          </p>
        </div>
        <div className="md:col-span-8">
          <label className="mono-label" style={label}>Часы работы</label>
          <input aria-label="Часы работы" value={hours} onChange={(e) => { setHours(e.target.value); touched(); }} placeholder="Ежедневно · 11:00–21:00" style={field} maxLength={80} />

          <label className="mono-label mt-5" style={label}>Доставка</label>
          <input aria-label="Доставка" value={delivery} onChange={(e) => { setDelivery(e.target.value); touched(); }} placeholder="Курьер и Почта по РФ" style={field} maxLength={80} />

          <label className="mono-label mt-5" style={label}>Гарантия</label>
          <input aria-label="Гарантия" value={warranty} onChange={(e) => { setWarranty(e.target.value); touched(); }} placeholder="Проверка и возврат 7 дней" style={field} maxLength={80} />
        </div>
      </div>

      <Rule />

      {/* Соцсети */}
      <div className="grid md:grid-cols-12 gap-6 md:gap-10 py-10">
        <div className="md:col-span-4">
          <h3 className="mono-label" style={{ color: "#1f232099" }}>Ссылки на соцсети</h3>
          <p className="m-0 mt-3" style={{ fontSize: 15, lineHeight: 1.6, color: "#1f2320cc" }}>
            Доступно на тарифах «Витрина» и «Издание». Ссылки-чипы появляются на обложке магазина —
            до {plan.maxLinks} штук.
          </p>
        </div>
        <div className="md:col-span-8">
          {links.map((l, i) => (
            <div key={i} className="flex gap-2 flex-wrap mb-3 items-center">
              <input
                aria-label={`Соцсеть ${i + 1}`}
                value={l.network}
                onChange={(e) => { setLinks(links.map((x, j) => j === i ? { ...x, network: e.target.value } : x)); touched(); }}
                placeholder="Telegram"
                style={{ ...field, flex: "1 1 130px", minWidth: 0 }}
                maxLength={40}
              />
              <input
                aria-label={`Ник в соцсети ${i + 1}`}
                value={l.handle}
                onChange={(e) => { setLinks(links.map((x, j) => j === i ? { ...x, handle: e.target.value } : x)); touched(); }}
                placeholder="@username"
                style={{ ...field, flex: "1 1 150px", minWidth: 0 }}
                maxLength={60}
              />
              <input
                aria-label={`Адрес ссылки ${i + 1}`}
                value={l.url}
                onChange={(e) => { setLinks(links.map((x, j) => j === i ? { ...x, url: e.target.value } : x)); touched(); }}
                placeholder="https://t.me/username"
                style={{ ...field, flex: "2 1 180px", minWidth: 0 }}
                maxLength={400}
              />
              <button type="button" onClick={() => { setLinks(links.filter((_, j) => j !== i)); touched(); }} aria-label="Удалить ссылку" style={{ border: "1px solid #1f232033", background: "transparent", borderRadius: "50%", width: 40, height: 40, cursor: "pointer", flexShrink: 0 }}>
                ×
              </button>
            </div>
          ))}
          <FieldError>{fields.links}</FieldError>

          {links.length < plan.maxLinks && (
            <button type="button" onClick={() => { setLinks([...links, { network: "", handle: "", url: "" }]); touched(); }} className="mono-label mt-2" style={{ border: "1px dashed #1f232055", background: "transparent", borderRadius: 999, padding: "12px 22px", cursor: "pointer", color: "#1f2320" }}>
              + Добавить соцсеть
            </button>
          )}
        </div>
      </div>

      {/* Разделы — только «Издание» */}
      {plan.maxSections > 0 && (
        <>
          <Rule />
          <div className="grid md:grid-cols-12 gap-6 md:gap-10 py-10">
            <div className="md:col-span-4">
              <h3 className="mono-label" style={{ color: "#1f232099" }}>Разделы витрины</h3>
              <p className="m-0 mt-3" style={{ fontSize: 15, lineHeight: 1.6, color: "#1f2320cc" }}>
                Тариф «Издание»: лоты раскладываются по вашим рубрикам — до {plan.maxSections} разделов.
                Раздел показывается, когда в нём есть лоты.
              </p>
            </div>
            <div className="md:col-span-8">
              {sections.map((x, i) => (
                <div key={i} className="flex gap-2 flex-wrap mb-3 items-center">
                  <input
                    aria-label={`Название раздела ${i + 1}`}
                    value={x.title}
                    onChange={(e) => { setSections(sections.map((s, j) => j === i ? { ...s, title: e.target.value } : s)); touched(); }}
                    placeholder="Гардероб"
                    style={{ ...field, flex: "1 1 140px", minWidth: 0 }}
                    maxLength={60}
                  />
                  <input
                    aria-label={`Описание раздела ${i + 1}`}
                    value={x.blurb}
                    onChange={(e) => { setSections(sections.map((s, j) => j === i ? { ...s, blurb: e.target.value } : s)); touched(); }}
                    placeholder="Короткое описание раздела"
                    style={{ ...field, flex: "2 1 180px", minWidth: 0 }}
                    maxLength={160}
                  />
                  <select
                    aria-label={`Категория раздела ${i + 1}`}
                    value={x.cat ?? ""}
                    onChange={(e) => { setSections(sections.map((s, j) => j === i ? { ...s, cat: e.target.value || null } : s)); touched(); }}
                    style={{ ...field, flex: "1 1 150px", minWidth: 0, cursor: "pointer" }}
                  >
                    <option value="">Категория</option>
                    {cats.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
                  </select>
                  <button type="button" onClick={() => { setSections(sections.filter((_, j) => j !== i)); touched(); }} aria-label="Удалить раздел" style={{ border: "1px solid #1f232033", background: "transparent", borderRadius: "50%", width: 40, height: 40, cursor: "pointer", flexShrink: 0 }}>
                    ×
                  </button>
                </div>
              ))}
              <FieldError>{fields.sections}</FieldError>

              {cats.length === 0 && (
                <p className="mono-label" style={{ color: "#1f232099" }}>
                  Разделы собираются из категорий ваших лотов — сначала разместите хотя бы один лот.
                </p>
              )}

              {sections.length < plan.maxSections && cats.length > 0 && (
                <button type="button" onClick={() => { setSections([...sections, { title: "", blurb: "", cat: null }]); touched(); }} className="mono-label mt-2" style={{ border: "1px dashed #1f232055", background: "transparent", borderRadius: 999, padding: "12px 22px", cursor: "pointer", color: "#1f2320" }}>
                  + Добавить раздел
                </button>
              )}
            </div>
          </div>
        </>
      )}

      <div className="flex items-center gap-4 flex-wrap pb-16">
        <button type="submit" disabled={busy} className="mono-label" style={{ background: "#1f2320", color: "#efe8da", border: "none", borderRadius: 999, padding: "16px 32px", cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}>
          {busy ? "Сохраняем…" : "Сохранить витрину"}
        </button>
        {saved && <span className="mono-label" style={{ color: "#1f232099" }}>Витрина обновлена</span>}
        {error && <span className="mono-label" style={{ color: "#a33" }}>{error}</span>}
      </div>
    </form>
  );
}
