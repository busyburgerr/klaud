import { Link } from "react-router";
import type { ReactNode } from "react";
import type { Listing } from "./api";
import { useWish } from "./store";

export function Rule() {
  return <div style={{ height: 1, background: "#1f232022" }} />;
}

export function Marquee({ lines }: { lines?: string[] }) {
  const items = lines?.length
    ? lines
    : ["Проверенные продавцы", "Гарантийная сделка", "Курьер по всей России", "Оценка за 2 минуты"];

  return (
    <div style={{ background: "#1f2320", color: "#efe8da", overflow: "hidden", padding: "7px 0" }}>
      <div className="marquee-track mono-label" style={{ color: "#efe8da" }}>
        {Array.from({ length: 2 }).map((_, r) => (
          <span key={r} style={{ display: "inline-flex" }}>
            {items.map((t, i) => (
              <span key={i} style={{ padding: "0 28px", opacity: 0.85 }}>{t} <span style={{ opacity: 0.4 }}>✳</span></span>
            ))}
          </span>
        ))}
      </div>
    </div>
  );
}

export function WishHeart({ id, size = 16 }: { id: number; size?: number }) {
  const { wished, toggle } = useWish();
  return (
    <button
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(id); }}
      className="flex items-center justify-center"
      style={{ background: "#efe8da", border: "none", borderRadius: "50%", width: size + 18, height: size + 18, cursor: "pointer" }}
      aria-label="Сохранить лот"
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill={wished.has(id) ? "#1f2320" : "none"}><path d="M12 21C12 21 3 14.5 3 8.5A5.5 5.5 0 0 1 12 5.293 5.5 5.5 0 0 1 21 8.5C21 14.5 12 21 12 21Z" stroke="#1f2320" strokeWidth="1.7"/></svg>
    </button>
  );
}

export function LotCard({ item }: { item: Listing }) {
  return (
    <Link to={`/lot/${item.id}`} className="lot relative grain block" style={{ border: "1px solid #1f232022", borderRadius: 18, overflow: "hidden", background: "#f6f0e3", textDecoration: "none", color: "inherit" }}>
      <div className="relative" style={{ background: "#e1d9c8", aspectRatio: "4/5", overflow: "hidden", zIndex: 2 }}>
        <img className="lot-img" src={item.img} alt={item.title} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        <span className="mono-label absolute top-3 left-3" style={{ background: "#efe8da", color: "#1f2320", borderRadius: 8, padding: "4px 8px" }}>Лот {item.lot}</span>
        {item.status === "pending" ? (
          <span className="mono-label absolute top-3 right-3" style={{ background: "#efe8da", color: "#1f2320", border: "1px solid #1f232033", borderRadius: 8, padding: "4px 8px" }}>На проверке</span>
        ) : item.badge ? (
          <span className="mono-label absolute top-3 right-3" style={{ background: "#1f2320", color: "#efe8da", borderRadius: 8, padding: "4px 8px" }}>{item.badge}</span>
        ) : null}
        <span className="absolute bottom-3 right-3"><WishHeart id={item.id} /></span>
      </div>
      <div className="lot-meta relative p-4" style={{ zIndex: 2 }}>
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-display m-0" style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em" }}>{item.price} ₽</p>
          <span className="mono-label" style={{ color: "#1f232088" }}>{item.cond}</span>
        </div>
        <p className="m-0 mt-1.5" style={{ fontSize: 13, lineHeight: 1.35, color: "#1f2320dd", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", minHeight: 36 }}>
          {item.title}
        </p>
        <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: "1px solid #1f232022" }}>
          <span className="mono-label" style={{ color: "#1f232088" }}>{item.location}</span>
          <span className="mono-label" style={{ color: "#1f232088" }}>{item.time}</span>
        </div>
      </div>
    </Link>
  );
}

/** Плейсхолдер карточки на время запроса — сетка не «прыгает». */
export function LotSkeleton() {
  return (
    <div style={{ border: "1px solid #1f232022", borderRadius: 18, overflow: "hidden", background: "#f6f0e3" }}>
      <div className="pulse" style={{ aspectRatio: "4/5", background: "#e1d9c8" }} />
      <div className="p-4">
        <div className="pulse" style={{ height: 22, width: "60%", background: "#e1d9c8", borderRadius: 6 }} />
        <div className="pulse mt-2" style={{ height: 13, width: "90%", background: "#e1d9c8", borderRadius: 6 }} />
        <div className="pulse mt-2" style={{ height: 13, width: "40%", background: "#e1d9c8", borderRadius: 6 }} />
      </div>
    </div>
  );
}

export function LotGrid({
  items,
  loading,
  className = "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3",
  skeletons = 8,
  empty,
}: {
  items: Listing[];
  loading?: boolean;
  className?: string;
  skeletons?: number;
  empty?: ReactNode;
}) {
  if (loading) {
    return (
      <div className={className}>
        {Array.from({ length: skeletons }).map((_, i) => <LotSkeleton key={i} />)}
      </div>
    );
  }

  if (!items.length) return <>{empty ?? <EmptyState title="Лотов не найдено" hint="Попробуйте изменить фильтры" />}</>;

  return (
    <div className={className}>
      {items.map((item) => <LotCard key={item.id} item={item} />)}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="text-center py-24" style={{ border: "1px dashed #1f232033", borderRadius: 20 }}>
      <p className="font-display m-0" style={{ fontSize: 28 }}>{title}</p>
      {hint && <p className="mono-label mt-2" style={{ color: "#1f232099" }}>{hint}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div className="text-center py-24" style={{ border: "1px dashed #1f232033", borderRadius: 20 }}>
      <p className="font-display m-0" style={{ fontSize: 28 }}>Не удалось загрузить</p>
      <p className="mono-label mt-2" style={{ color: "#1f232099" }}>{error.message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mono-label mt-6" style={{ background: "#1f2320", color: "#efe8da", border: "none", borderRadius: 999, padding: "14px 32px", cursor: "pointer" }}>
          Повторить
        </button>
      )}
    </div>
  );
}

/** Подпись под полем формы с ошибкой от API. */
export function FieldError({ children }: { children?: string }) {
  if (!children) return null;
  return <span className="mono-label" style={{ color: "#a33", display: "block", marginTop: 6 }}>{children}</span>;
}
