import type { ShopLink } from "./api";

/**
 * Полоса бренда: обложка магазина с названием, слоганом и ссылками.
 * Один и тот же блок показывается в предпросмотре кабинета и на публичной
 * витрине — чтобы продавец видел ровно то, что увидит покупатель.
 */
export function ShopCover({
  name,
  brand,
  tagline,
  cover,
  initial,
  city,
  links,
  badge,
}: {
  /** Имя продавца — крупный заголовок обложки. */
  name: string;
  /** Название магазина — строка над именем. */
  brand: string;
  tagline: string;
  cover: string;
  initial: string;
  city: string;
  links: ShopLink[];
  badge?: string;
}) {
  return (
    <div
      className="relative"
      style={{
        background: "#1f2320",
        borderRadius: 20,
        overflow: "hidden",
        minHeight: 280,
        display: "flex",
        alignItems: "flex-end",
      }}
    >
      {cover && (
        <img
          src={cover}
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            // Ч/б и затемнение: обложка не должна спорить с текстом.
            filter: "grayscale(1) brightness(0.55)",
          }}
        />
      )}

      {badge && (
        <span className="mono-label absolute" style={{ top: 18, left: 18, background: "#efe8da", color: "#1f2320", borderRadius: 8, padding: "5px 10px" }}>
          {badge}
        </span>
      )}

      <div className="relative flex items-start gap-5 flex-wrap" style={{ padding: "clamp(20px,3vw,34px)", width: "100%" }}>
        <span
          className="flex items-center justify-center font-display"
          style={{ width: 62, height: 62, borderRadius: 14, background: "#efe8da", color: "#1f2320", fontSize: 30, flexShrink: 0 }}
        >
          {initial}
        </span>

        <div style={{ minWidth: 0 }}>
          <span className="mono-label" style={{ color: "#efe8dabb" }}>
            {brand}{city ? ` · ${city}` : ""}
          </span>
          <h2 className="font-display m-0 mt-2" style={{ fontSize: "clamp(30px,4.6vw,52px)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 0.95, color: "#efe8da" }}>
            {name}
          </h2>
          {tagline && (
            <p className="font-display m-0 mt-3" style={{ fontSize: "clamp(17px,2.2vw,24px)", fontStyle: "italic", lineHeight: 1.25, color: "#efe8dadd", maxWidth: 520 }}>
              {tagline}
            </p>
          )}

          {links.length > 0 && (
            <div className="flex gap-2 flex-wrap mt-5">
              {links.map((l, i) => (
                <a
                  key={l.id ?? i}
                  href={l.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mono-label"
                  style={{ border: "1px solid #efe8da44", color: "#efe8da", borderRadius: 999, padding: "9px 16px", textDecoration: "none", whiteSpace: "nowrap" }}
                >
                  ↗ {l.network}{l.handle ? ` ${l.handle}` : ""}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
