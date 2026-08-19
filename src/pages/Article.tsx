import { useState } from "react";
import { Link, useParams } from "react-router";
import api from "../api";
import { useAsync } from "../hooks";
import { Rule } from "../components";
import ArticleBody from "../ArticleBody";

export default function Article() {
  const { slug } = useParams();
  const { data, loading, error } = useAsync(() => api.article(slug!), [slug]);
  const [copied, setCopied] = useState(false);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-5 md:px-10 py-32 text-center">
        <span className="mono-label" style={{ color: "#1f232099" }}>Загрузка материала…</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-7xl mx-auto px-5 md:px-10 py-32 text-center">
        <p className="font-display" style={{ fontSize: 40 }}>Материал не найден</p>
        <Link to="/journal" className="mono-label underline-link" style={{ color: "#1f2320", textDecoration: "none" }}>← Вернуться в журнал</Link>
      </div>
    );
  }

  const { article, more, canEdit } = data;
  const shareUrl = window.location.href;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Буфер обмена недоступен — тихо игнорируем.
    }
  };

  return (
    <article className="max-w-3xl mx-auto px-5 md:px-10">
      <div className="flex items-center gap-2 py-5 mono-label" style={{ color: "#1f232099" }}>
        <Link to="/" style={{ color: "#1f232099", textDecoration: "none" }} className="underline-link">Клауд</Link>
        <span>/</span>
        <Link to="/journal" style={{ color: "#1f232099", textDecoration: "none" }} className="underline-link">Журнал</Link>
        <span>/</span><span style={{ color: "#1f2320" }}>{article.rubric}</span>
      </div>

      {canEdit && (
        <div className="flex items-center justify-between gap-3 mb-6 flex-wrap px-4 py-3" style={{ border: "1px solid #1f232022", borderRadius: 14, background: "#f6f0e3" }}>
          <span className="mono-label" style={{ color: "#1f232099" }}>
            {article.isDraft ? "Черновик — виден только редакции" : "Материал опубликован"}
          </span>
          <div className="flex gap-3">
            <Link to={`/journal/${article.slug}/edit`} className="mono-label" style={{ background: "#1f2320", color: "#efe8da", borderRadius: 999, padding: "10px 20px", textDecoration: "none" }}>
              Редактировать
            </Link>
            <Link to="/journal/new" className="mono-label" style={{ border: "1px solid #1f232033", borderRadius: 999, padding: "10px 20px", textDecoration: "none", color: "#1f2320" }}>
              Новый материал
            </Link>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="pt-4 pb-8 text-center">
        <span className="mono-label" style={{ color: "#1f232099" }}>
          {article.isDraft && <span style={{ background: "#1f2320", color: "#efe8da", borderRadius: 6, padding: "2px 8px", marginRight: 8 }}>черновик</span>}
          {article.rubric}
        </span>
        <h1 className="font-display mt-4" style={{ fontSize: "clamp(34px,5.5vw,64px)", fontWeight: 800, lineHeight: 0.95, letterSpacing: "-0.02em" }}>{article.title}</h1>
        <p className="mx-auto mt-5" style={{ fontSize: 18, lineHeight: 1.55, color: "#1f2320cc", fontStyle: "italic", maxWidth: 620 }}>{article.excerpt}</p>
        <p className="mono-label mt-6" style={{ color: "#1f232099" }}>{article.author} · {article.date} · {article.read} чтения</p>
      </header>

      <div className="overflow-hidden mb-10" style={{ borderRadius: 20, background: "#e1d9c8", aspectRatio: "3/2" }}>
        <img src={article.img} alt={article.title} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      </div>

      {/* Body */}
      <div className="mx-auto" style={{ maxWidth: 640 }}>
        <ArticleBody blocks={article.body} />
      </div>

      <div className="mx-auto my-12" style={{ maxWidth: 640 }}>
        <Rule />
        <div className="flex items-center justify-between py-5 flex-wrap gap-3">
          <span className="mono-label" style={{ color: "#1f232099" }}>Материал редакции Клауд</span>
          <div className="flex gap-4">
            <a className="mono-label underline-link" style={{ color: "#1f2320", textDecoration: "none" }} href={`https://vk.com/share.php?url=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noreferrer noopener">VK</a>
            <a className="mono-label underline-link" style={{ color: "#1f2320", textDecoration: "none" }} href={`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(article.title)}`} target="_blank" rel="noreferrer noopener">Telegram</a>
            <button onClick={copyLink} className="mono-label underline-link" style={{ background: "none", border: "none", cursor: "pointer", color: "#1f2320" }}>
              {copied ? "✓ Скопировано" : "Скопировать"}
            </button>
          </div>
        </div>
        <Rule />
      </div>

      {/* More */}
      {more.length > 0 && (
        <section className="pb-16">
          <h2 className="font-display mb-6" style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em" }}>Ещё в журнале</h2>
          <div className="grid sm:grid-cols-3 gap-6">
            {more.map((a) => (
              <Link key={a.slug} to={`/journal/${a.slug}`} className="flex flex-col" style={{ textDecoration: "none", color: "#1f2320" }}>
                <div className="overflow-hidden mb-3" style={{ borderRadius: 14, background: "#e1d9c8", aspectRatio: "3/2" }}>
                  <img src={a.img} alt={a.title} className="lot-img" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                </div>
                <span className="mono-label" style={{ color: "#1f232099" }}>{a.rubric}</span>
                <h3 className="font-display mt-1.5" style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.01em" }}>{a.title}</h3>
              </Link>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
