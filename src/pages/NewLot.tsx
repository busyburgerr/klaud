import { useState } from "react";
import { Link } from "react-router";
import api, { ApiError } from "../api";
import { useAsync } from "../hooks";
import { FieldError, Rule } from "../components";

const CONDS = ["Новое", "Отличное", "Хорошее", "Требует ремонта"];
const MAX_PHOTOS = 10;

type Shot = { url: string; preview: string };

export default function NewLot() {
  const { data: categories } = useAsync(() => api.categories(), []);

  const [cat, setCat] = useState("");
  const [cond, setCond] = useState("");
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [location, setLocation] = useState("");
  const [desc, setDesc] = useState("");
  const [shots, setShots] = useState<Shot[]>([]);

  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [done, setDone] = useState<{ lot: string } | null>(null);

  const fieldStyle = { border: "1px solid #1f232033", borderRadius: 14, background: "#f6f0e3", padding: "14px 16px", fontSize: 15, outline: "none", width: "100%" } as const;
  const labelStyle = { color: "#1f232099" } as const;

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;

    const room = MAX_PHOTOS - shots.length;
    const batch = Array.from(files).slice(0, room);
    if (!batch.length) return;

    setUploading(true);
    setError("");
    try {
      const urls = await api.uploadImages(batch);
      setShots((prev) => [
        ...prev,
        ...urls.map((url, i) => ({ url, preview: URL.createObjectURL(batch[i]) })),
      ]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось загрузить фотографии");
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = (url: string) => setShots((prev) => prev.filter((s) => s.url !== url));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;

    setBusy(true);
    setError("");
    setFields({});

    try {
      const listing = await api.createListing({
        title,
        price: Number(price),
        cat,
        cond,
        description: desc,
        location: location || undefined,
        images: shots.map((s) => s.url),
      });
      setDone({ lot: listing.lot });
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

  if (done) {
    return (
      <div className="max-w-2xl mx-auto px-5 md:px-10 py-32 text-center">
        <span className="mono-label" style={labelStyle}>Лот {done.lot} принят</span>
        <h1 className="font-display mt-4" style={{ fontSize: "clamp(36px,6vw,64px)", fontWeight: 800, lineHeight: 0.95, letterSpacing: "-0.02em" }}>Ваш лот отправлен на проверку</h1>
        <p className="mt-5" style={{ fontSize: 16, lineHeight: 1.6, color: "#1f2320cc" }}>
          Эксперты Клауд проверят объявление и опубликуют его в каталоге. До публикации лот виден во вкладке «Мои объявления».
        </p>
        <div className="flex gap-3 justify-center flex-wrap mt-8">
          <Link to="/account" className="mono-label inline-block" style={{ background: "#1f2320", color: "#efe8da", borderRadius: 999, padding: "16px 40px", textDecoration: "none" }}>Мои объявления</Link>
          <Link to="/catalog" className="mono-label inline-block" style={{ border: "1px solid #1f2320", color: "#1f2320", borderRadius: 999, padding: "16px 40px", textDecoration: "none" }}>Перейти в каталог</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-5 md:px-10">
      <div className="flex items-center gap-2 py-5 mono-label" style={labelStyle}>
        <Link to="/" style={{ color: "#1f232099", textDecoration: "none" }} className="underline-link">Клауд</Link>
        <span>/</span><span style={{ color: "#1f2320" }}>Разместить лот</span>
      </div>

      <section className="pb-8">
        <span className="mono-label" style={labelStyle}>Форма подачи · Изд. № 417</span>
        <h1 className="font-display mt-3" style={{ fontSize: "clamp(38px,6vw,72px)", fontWeight: 800, lineHeight: 0.9, letterSpacing: "-0.03em" }}>Разместить лот</h1>
        <p className="mt-4" style={{ fontSize: 15, lineHeight: 1.6, color: "#1f2320cc", maxWidth: 460 }}>Опишите предмет — мы проверим его, присвоим номер лота и опубликуем в каталоге. Размещение бесплатно.</p>
      </section>

      <Rule />

      {error && (
        <p className="mono-label mt-6" style={{ color: "#a33", background: "#f6f0e3", border: "1px solid #a3333322", borderRadius: 12, padding: "12px 14px" }}>{error}</p>
      )}

      <form className="flex flex-col gap-8 py-8" onSubmit={submit} noValidate>
        {/* Photos */}
        <div>
          <h3 className="mono-label mb-3" style={labelStyle}>01 · Фотографии <span style={{ color: "#1f232066" }}>· до {MAX_PHOTOS}, по 5 МБ</span></h3>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {shots.length < MAX_PHOTOS && (
              <label className="flex flex-col items-center justify-center gap-2 cursor-pointer" style={{ aspectRatio: "4/5", border: "1px dashed #1f232044", borderRadius: 14, background: "#f6f0e3" }}>
                {uploading ? (
                  <span className="mono-label" style={labelStyle}>Загрузка…</span>
                ) : (
                  <>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="#1f2320" strokeWidth="1.6" strokeLinecap="round"/></svg>
                    <span className="mono-label" style={labelStyle}>Добавить</span>
                  </>
                )}
                <input type="file" accept="image/*" multiple disabled={uploading} onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} style={{ display: "none" }} />
              </label>
            )}
            {shots.map((s, i) => (
              <div key={s.url} className="relative overflow-hidden" style={{ aspectRatio: "4/5", border: "1px solid #1f232022", borderRadius: 14, background: "#e1d9c8" }}>
                <img src={s.preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                {i === 0 && <span className="mono-label absolute bottom-2 left-2" style={{ background: "#efe8da", borderRadius: 6, padding: "3px 7px" }}>Обложка</span>}
                <button type="button" onClick={() => removePhoto(s.url)} aria-label="Удалить фото" style={{ position: "absolute", top: 6, right: 6, width: 26, height: 26, borderRadius: "50%", background: "#efe8da", border: "none", cursor: "pointer", lineHeight: 1 }}>✕</button>
              </div>
            ))}
          </div>
        </div>

        {/* Category */}
        <div>
          <h3 className="mono-label mb-3" style={labelStyle}>02 · Раздел каталога</h3>
          <div className="flex flex-wrap gap-2">
            {(categories ?? []).map((c) => (
              <button type="button" key={c.slug} onClick={() => setCat(c.slug)} className="chip mono-label" style={{ border: "1px solid " + (cat === c.slug ? "#1f2320" : "#1f232022"), background: cat === c.slug ? "#1f2320" : "#f6f0e3", color: cat === c.slug ? "#efe8da" : "#1f2320", borderRadius: 999, padding: "9px 16px", cursor: "pointer" }}>{c.label}</button>
            ))}
          </div>
          <FieldError>{fields.cat}</FieldError>
        </div>

        {/* Title & price */}
        <div>
          <h3 className="mono-label mb-3" style={labelStyle}>03 · Название и цена</h3>
          <div className="flex flex-col gap-3">
            <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например, Велосипед горный Trek Marlin 7" maxLength={140} style={fieldStyle} />
            <FieldError>{fields.title}</FieldError>
            <div className="relative">
              <input required type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Цена" style={fieldStyle} />
              <span className="mono-label" style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", color: "#1f232066" }}>₽</span>
            </div>
            <FieldError>{fields.price}</FieldError>
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Город (по умолчанию — из профиля)" maxLength={80} style={fieldStyle} />
            <FieldError>{fields.location}</FieldError>
          </div>
        </div>

        {/* Condition */}
        <div>
          <h3 className="mono-label mb-3" style={labelStyle}>04 · Состояние</h3>
          <div className="flex flex-wrap gap-2">
            {CONDS.map((c) => (
              <button type="button" key={c} onClick={() => setCond(c)} className="chip mono-label" style={{ border: "1px solid " + (cond === c ? "#1f2320" : "#1f232022"), background: cond === c ? "#1f2320" : "#f6f0e3", color: cond === c ? "#efe8da" : "#1f2320", borderRadius: 999, padding: "9px 16px", cursor: "pointer" }}>{c}</button>
            ))}
          </div>
          <FieldError>{fields.cond}</FieldError>
        </div>

        {/* Description */}
        <div>
          <h3 className="mono-label mb-3" style={labelStyle}>05 · Описание</h3>
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={5} maxLength={4000} placeholder="Расскажите о предмете, его истории и особенностях..." style={{ ...fieldStyle, resize: "vertical", lineHeight: 1.5 }} />
          <FieldError>{fields.description}</FieldError>
        </div>

        <Rule />
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <span className="mono-label" style={{ color: "#1f232099", maxWidth: 300 }}>Отправляя лот, вы соглашаетесь с правилами публикации Клауд.</span>
          <button type="submit" disabled={busy || uploading} className="mono-label" style={{ background: "#1f2320", color: "#efe8da", border: "none", borderRadius: 999, padding: "18px 44px", cursor: busy ? "wait" : "pointer", opacity: busy || uploading ? 0.7 : 1 }}>
            {busy ? "Отправляем…" : "Отправить на проверку →"}
          </button>
        </div>
      </form>
    </div>
  );
}
