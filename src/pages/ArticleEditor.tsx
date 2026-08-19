import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import api, { ApiError, type ArticleBlock, type BlockType } from "../api";
import ArticleBody from "../ArticleBody";
import { useAsync } from "../hooks";
import { FieldError, Rule } from "../components";

/** Подписи и заготовки блоков в порядке, в котором их предлагаем автору. */
const BLOCK_KINDS: { type: BlockType; label: string; hint: string }[] = [
  { type: "paragraph", label: "Абзац", hint: "Обычный текст материала" },
  { type: "heading", label: "Подзаголовок", hint: "Начало нового раздела" },
  { type: "list", label: "Список", hint: "Перечисление по пунктам" },
  { type: "steps", label: "Шаги", hint: "Пронумерованная инструкция" },
  { type: "callout", label: "Врезка", hint: "Выделенное предупреждение" },
];

const emptyBlock = (type: BlockType): ArticleBlock => {
  switch (type) {
    case "heading":
      return { type, text: "" };
    case "list":
      return { type, items: [""] };
    case "steps":
      return { type, items: [{ title: "", text: "" }] };
    case "callout":
      return { type, label: "Важно", text: "" };
    default:
      return { type: "paragraph", text: "" };
  }
};

/** Пустые блоки в тело не отправляем — автор мог оставить заготовку. */
const isFilled = (b: ArticleBlock) =>
  b.type === "list"
    ? b.items.some((i) => i.trim())
    : b.type === "steps"
      ? b.items.some((s) => s.title.trim() || s.text.trim())
      : Boolean(b.text.trim());

const clean = (blocks: ArticleBlock[]): ArticleBlock[] =>
  blocks.filter(isFilled).map((b) =>
    b.type === "list"
      ? { ...b, items: b.items.map((i) => i.trim()).filter(Boolean) }
      : b.type === "steps"
        ? { ...b, items: b.items.filter((s) => s.title.trim() || s.text.trim()) }
        : b,
  );

const textOf = (b: ArticleBlock): string =>
  b.type === "list"
    ? b.items.join(" ")
    : b.type === "steps"
      ? b.items.map((s) => `${s.title} ${s.text}`).join(" ")
      : b.text;

/**
 * Редактор материала журнала. Один компонент на создание и правку:
 * без `:slug` в адресе — новый материал, со `:slug` — существующий.
 */
export default function ArticleEditor() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const editing = Boolean(slug);

  const { data: meta } = useAsync(() => api.articles(), []);
  const { data: loaded, loading } = useAsync(
    () => (slug ? api.article(slug) : Promise.resolve(null)),
    [slug],
  );

  const [title, setTitle] = useState("");
  const [rubric, setRubric] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [img, setImg] = useState("");
  const [blocks, setBlocks] = useState<ArticleBlock[]>([emptyBlock("paragraph")]);

  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState(false);

  // Подставляем существующий материал, когда он загрузился.
  useEffect(() => {
    const article = loaded?.article;
    if (!article) return;
    setTitle(article.title);
    setRubric(article.rubric);
    setExcerpt(article.excerpt);
    setImg(article.img);
    setBlocks(article.body.length ? article.body : [emptyBlock("paragraph")]);
  }, [loaded?.article?.slug]);

  const ready = clean(blocks);
  const chars = ready.map(textOf).join(" ").length;
  const minutes = Math.max(1, Math.round(chars / 1000));

  // ── Операции над блоками ──
  const patchBlock = (index: number, next: ArticleBlock) =>
    setBlocks((prev) => prev.map((b, i) => (i === index ? next : b)));

  const addBlock = (type: BlockType) => setBlocks((prev) => [...prev, emptyBlock(type)]);

  const removeBlock = (index: number) =>
    setBlocks((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));

  const moveBlock = (index: number, delta: number) =>
    setBlocks((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const uploadCover = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const [url] = await api.uploadImages([file]);
      setImg(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось загрузить обложку");
    } finally {
      setUploading(false);
    }
  };

  const save = async (status: "draft" | "published") => {
    if (busy) return;
    setBusy(true);
    setError("");
    setFields({});

    const payload = { title, rubric, excerpt, img, body: ready, status };

    try {
      const article = editing
        ? await api.updateArticle(slug!, payload)
        : await api.createArticle(payload);
      navigate(`/journal/${article.slug}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFields(err.details ?? {});
      } else {
        setError("Сервер недоступен. Попробуйте ещё раз.");
      }
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!slug || !confirm(`Удалить материал «${title}»? Это действие необратимо.`)) return;
    setBusy(true);
    try {
      await api.deleteArticle(slug);
      navigate("/journal");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось удалить материал");
      setBusy(false);
    }
  };

  if (editing && loading) {
    return (
      <div className="max-w-3xl mx-auto px-5 md:px-10 py-32 text-center">
        <span className="mono-label" style={{ color: "#1f232099" }}>Загрузка материала…</span>
      </div>
    );
  }

  const rubrics = Array.from(new Set([...(meta?.suggestedRubrics ?? []), ...(meta?.rubrics ?? [])]));

  return (
    <div className="max-w-3xl mx-auto px-5 md:px-10">
      <div className="flex items-center gap-2 py-5 mono-label" style={label}>
        <Link to="/" style={{ color: "#1f232099", textDecoration: "none" }} className="underline-link">Клауд</Link>
        <span>/</span>
        <Link to="/journal" style={{ color: "#1f232099", textDecoration: "none" }} className="underline-link">Журнал</Link>
        <span>/</span><span style={{ color: "#1f2320" }}>{editing ? "Правка" : "Новый материал"}</span>
      </div>

      <section className="pb-8">
        <span className="mono-label" style={label}>
          Редакция журнала{loaded?.article?.isDraft ? " · черновик" : ""}
        </span>
        <h1 className="font-display mt-3" style={{ fontSize: "clamp(34px,5.5vw,64px)", fontWeight: 800, lineHeight: 0.92, letterSpacing: "-0.03em" }}>
          {editing ? "Правка материала" : "Новый материал"}
        </h1>
        <p className="mt-4" style={{ fontSize: 15, lineHeight: 1.6, color: "#1f2320cc", maxWidth: 480 }}>
          Материал собирается из блоков: абзацы, подзаголовки, списки, нумерованные шаги и врезки.
          Время чтения и адрес материала считаются автоматически.
        </p>
      </section>

      <Rule />

      {error && (
        <p className="mono-label mt-6" style={{ color: "#a33", background: "#f6f0e3", border: "1px solid #a3333322", borderRadius: 12, padding: "12px 14px" }}>{error}</p>
      )}

      <form className="flex flex-col gap-8 py-8" onSubmit={(e) => { e.preventDefault(); save("published"); }} noValidate>
        <div>
          <h3 className="mono-label mb-3" style={label}>01 · Заголовок</h3>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder="Например, Безопасная сделка: как Клауд защищает деньги покупателя" style={field} />
          <FieldError>{fields.title}</FieldError>
        </div>

        <div>
          <h3 className="mono-label mb-3" style={label}>02 · Рубрика</h3>
          <div className="flex flex-wrap gap-2 mb-3">
            {rubrics.map((r) => (
              <button type="button" key={r} onClick={() => setRubric(r)} className="chip mono-label" style={{ border: "1px solid " + (rubric === r ? "#1f2320" : "#1f232022"), background: rubric === r ? "#1f2320" : "#f6f0e3", color: rubric === r ? "#efe8da" : "#1f2320", borderRadius: 999, padding: "9px 16px", cursor: "pointer" }}>{r}</button>
            ))}
          </div>
          <input value={rubric} onChange={(e) => setRubric(e.target.value)} maxLength={40} placeholder="или своя рубрика" style={field} />
          <FieldError>{fields.rubric}</FieldError>
        </div>

        <div>
          <h3 className="mono-label mb-3" style={label}>03 · Обложка</h3>
          <div className="flex items-start gap-4 flex-wrap">
            <label className="flex flex-col items-center justify-center gap-2 cursor-pointer" style={{ width: 180, aspectRatio: "3/2", border: "1px dashed #1f232044", borderRadius: 14, background: "#f6f0e3", overflow: "hidden" }}>
              {img ? (
                <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              ) : uploading ? (
                <span className="mono-label" style={label}>Загрузка…</span>
              ) : (
                <>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#1f2320" strokeWidth="1.6" strokeLinecap="round"/></svg>
                  <span className="mono-label" style={label}>Загрузить</span>
                </>
              )}
              <input type="file" accept="image/*" disabled={uploading} onChange={(e) => { uploadCover(e.target.files?.[0]); e.target.value = ""; }} style={{ display: "none" }} />
            </label>
            <div className="flex-1" style={{ minWidth: 240 }}>
              <input value={img} onChange={(e) => setImg(e.target.value)} maxLength={500} placeholder="…или вставьте ссылку на изображение" style={field} />
              {img && (
                <button type="button" onClick={() => setImg("")} className="mono-label underline-link mt-2" style={{ background: "none", border: "none", cursor: "pointer", color: "#1f2320", padding: 0 }}>
                  ✕ Убрать обложку
                </button>
              )}
              <FieldError>{fields.img}</FieldError>
            </div>
          </div>
        </div>

        <div>
          <h3 className="mono-label mb-3" style={label}>04 · Лид <span style={{ color: "#1f232066" }}>· необязательно</span></h3>
          <textarea value={excerpt} onChange={(e) => setExcerpt(e.target.value)} rows={2} maxLength={400} placeholder="Короткая подводка курсивом под заголовком. Если оставить пустым, возьмём начало первого абзаца." style={{ ...field, resize: "vertical", lineHeight: 1.5 }} />
          <FieldError>{fields.excerpt}</FieldError>
        </div>

        {/* ── Блоки материала ── */}
        <div>
          <div className="flex items-baseline justify-between mb-3 gap-3 flex-wrap">
            <h3 className="mono-label m-0" style={label}>05 · Материал</h3>
            <span className="mono-label" style={{ color: "#1f232066" }}>
              {ready.length} блок(ов) · {chars} знаков · ≈{minutes} мин чтения
            </span>
          </div>

          <div className="flex flex-col gap-3">
            {blocks.map((block, i) => (
              <BlockEditor
                key={i}
                block={block}
                index={i}
                total={blocks.length}
                onChange={(next) => patchBlock(i, next)}
                onMove={(delta) => moveBlock(i, delta)}
                onRemove={() => removeBlock(i)}
              />
            ))}
          </div>

          <div className="flex flex-wrap gap-2 mt-4">
            <span className="mono-label self-center mr-1" style={{ color: "#1f232066" }}>Добавить:</span>
            {BLOCK_KINDS.map((kind) => (
              <button key={kind.type} type="button" onClick={() => addBlock(kind.type)} title={kind.hint} className="chip mono-label" style={{ border: "1px solid #1f232033", background: "#f6f0e3", color: "#1f2320", borderRadius: 999, padding: "9px 16px", cursor: "pointer" }}>
                + {kind.label}
              </button>
            ))}
          </div>

          <FieldError>{fields.body}</FieldError>

          <button type="button" onClick={() => setPreview(!preview)} className="mono-label underline-link mt-4" style={{ background: "none", border: "none", cursor: "pointer", color: "#1f2320", padding: 0 }}>
            {preview ? "Скрыть предпросмотр" : "Показать предпросмотр"}
          </button>
        </div>

        {preview && (
          <div style={{ border: "1px solid #1f232022", borderRadius: 20, background: "#f6f0e3", padding: 28 }}>
            <span className="mono-label" style={label}>{rubric || "Рубрика"} · ≈{minutes} мин</span>
            <h2 className="font-display mt-3 mb-3" style={{ fontSize: "clamp(26px,4vw,40px)", fontWeight: 800, lineHeight: 1, letterSpacing: "-0.02em" }}>
              {title || "Заголовок материала"}
            </h2>
            {excerpt && (
              <p className="mb-5" style={{ fontSize: 17, lineHeight: 1.55, color: "#1f2320cc", fontStyle: "italic" }}>{excerpt}</p>
            )}
            {img && (
              <div className="overflow-hidden mb-6" style={{ borderRadius: 16, background: "#e1d9c8", aspectRatio: "3/2" }}>
                <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              </div>
            )}
            {ready.length ? <ArticleBody blocks={ready} compact /> : <p className="mono-label" style={label}>Материал пока пуст</p>}
          </div>
        )}

        <Rule />

        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex gap-3 flex-wrap">
            <button type="submit" disabled={busy || uploading} className="mono-label" style={{ background: "#1f2320", color: "#efe8da", border: "none", borderRadius: 999, padding: "16px 36px", cursor: busy ? "wait" : "pointer", opacity: busy || uploading ? 0.7 : 1 }}>
              {busy ? "Сохраняем…" : editing ? "Сохранить и опубликовать" : "Опубликовать"}
            </button>
            <button type="button" onClick={() => save("draft")} disabled={busy || uploading} className="mono-label" style={{ background: "transparent", color: "#1f2320", border: "1px solid #1f2320", borderRadius: 999, padding: "16px 28px", cursor: "pointer" }}>
              В черновики
            </button>
          </div>

          <div className="flex gap-3">
            <Link to={editing ? `/journal/${slug}` : "/journal"} className="mono-label" style={{ border: "1px solid #1f232033", borderRadius: 999, padding: "16px 24px", textDecoration: "none", color: "#1f2320" }}>Отмена</Link>
            {editing && (
              <button type="button" onClick={remove} disabled={busy} className="mono-label" style={{ background: "transparent", color: "#a33", border: "1px solid #a3333344", borderRadius: 999, padding: "16px 24px", cursor: "pointer" }}>
                Удалить
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

/** Один блок в редакторе: свои поля плюс перестановка и удаление. */
function BlockEditor({
  block,
  index,
  total,
  onChange,
  onMove,
  onRemove,
}: {
  block: ArticleBlock;
  index: number;
  total: number;
  onChange: (next: ArticleBlock) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  const kind = BLOCK_KINDS.find((k) => k.type === block.type);

  return (
    <div style={{ border: "1px solid #1f232022", borderRadius: 16, background: "#f6f0e3", padding: 16 }}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className="mono-label" style={{ color: "#1f232099" }}>
          {String(index + 1).padStart(2, "0")} · {kind?.label ?? block.type}
        </span>
        <div className="flex gap-1">
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Выше" style={iconBtn(index === 0)}>↑</button>
          <button type="button" onClick={() => onMove(1)} disabled={index === total - 1} aria-label="Ниже" style={iconBtn(index === total - 1)}>↓</button>
          <button type="button" onClick={onRemove} disabled={total === 1} aria-label="Удалить блок" style={iconBtn(total === 1)}>✕</button>
        </div>
      </div>

      {block.type === "heading" && (
        <input
          value={block.text}
          onChange={(e) => onChange({ ...block, text: e.target.value })}
          maxLength={200}
          placeholder="Как работает эскроу"
          style={{ ...field, fontSize: 19, fontWeight: 600 }}
        />
      )}

      {block.type === "paragraph" && (
        <textarea
          value={block.text}
          onChange={(e) => onChange({ ...block, text: e.target.value })}
          rows={4}
          maxLength={4000}
          placeholder="Текст абзаца"
          style={{ ...field, resize: "vertical", lineHeight: 1.6 }}
        />
      )}

      {block.type === "callout" && (
        <div className="flex flex-col gap-2">
          <input
            value={block.label}
            onChange={(e) => onChange({ ...block, label: e.target.value })}
            maxLength={40}
            placeholder="Важно"
            style={{ ...field, maxWidth: 200 }}
          />
          <textarea
            value={block.text}
            onChange={(e) => onChange({ ...block, text: e.target.value })}
            rows={3}
            maxLength={4000}
            placeholder="Текст врезки — выделяется тёмным блоком"
            style={{ ...field, resize: "vertical", lineHeight: 1.6 }}
          />
        </div>
      )}

      {block.type === "list" && (
        <div className="flex flex-col gap-2">
          {block.items.map((item, j) => (
            <div key={j} className="flex gap-2 items-center">
              <span style={{ color: "#1f232066" }}>•</span>
              <input
                value={item}
                onChange={(e) => onChange({ ...block, items: block.items.map((x, k) => (k === j ? e.target.value : x)) })}
                maxLength={1000}
                placeholder="Пункт списка"
                style={field}
              />
              <button type="button" onClick={() => onChange({ ...block, items: block.items.filter((_, k) => k !== j) })} disabled={block.items.length === 1} aria-label="Удалить пункт" style={iconBtn(block.items.length === 1)}>✕</button>
            </div>
          ))}
          <button type="button" onClick={() => onChange({ ...block, items: [...block.items, ""] })} className="mono-label underline-link self-start" style={{ background: "none", border: "none", cursor: "pointer", color: "#1f2320", padding: 0 }}>
            + пункт
          </button>
        </div>
      )}

      {block.type === "steps" && (
        <div className="flex flex-col gap-3">
          {block.items.map((step, j) => (
            <div key={j} className="flex gap-3 items-start">
              <span className="font-display" style={{ fontSize: 20, fontWeight: 700, color: "#1f232055", minWidth: 32, paddingTop: 10 }}>
                {String(j + 1).padStart(2, "0")}
              </span>
              <div className="flex-1 flex flex-col gap-2">
                <input
                  value={step.title}
                  onChange={(e) => onChange({ ...block, items: block.items.map((x, k) => (k === j ? { ...x, title: e.target.value } : x)) })}
                  maxLength={200}
                  placeholder="Название шага"
                  style={{ ...field, fontWeight: 600 }}
                />
                <textarea
                  value={step.text}
                  onChange={(e) => onChange({ ...block, items: block.items.map((x, k) => (k === j ? { ...x, text: e.target.value } : x)) })}
                  rows={2}
                  maxLength={1000}
                  placeholder="Пояснение к шагу"
                  style={{ ...field, resize: "vertical", lineHeight: 1.5 }}
                />
              </div>
              <button type="button" onClick={() => onChange({ ...block, items: block.items.filter((_, k) => k !== j) })} disabled={block.items.length === 1} aria-label="Удалить шаг" style={iconBtn(block.items.length === 1)}>✕</button>
            </div>
          ))}
          <button type="button" onClick={() => onChange({ ...block, items: [...block.items, { title: "", text: "" }] })} className="mono-label underline-link self-start" style={{ background: "none", border: "none", cursor: "pointer", color: "#1f2320", padding: 0 }}>
            + шаг
          </button>
        </div>
      )}
    </div>
  );
}

const field = { border: "1px solid #1f232033", borderRadius: 14, background: "#efe8da", padding: "14px 16px", fontSize: 15, outline: "none", width: "100%" } as const;
const label = { color: "#1f232099" } as const;

const iconBtn = (disabled: boolean) =>
  ({
    background: "transparent",
    border: "1px solid #1f232022",
    borderRadius: 8,
    width: 30,
    height: 30,
    cursor: disabled ? "default" : "pointer",
    color: "#1f2320",
    opacity: disabled ? 0.35 : 1,
    lineHeight: 1,
  }) as const;
