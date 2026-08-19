import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import api from "./api";
import { useAuth } from "./auth";

type WishCtx = {
  wished: Set<number>;
  /** Переключает сердечко. Гостя отправляет на вход. */
  toggle: (id: number) => void;
  /** Синхронизировать список после ответа сервера (например, после /favorites). */
  sync: (ids: number[]) => void;
};

const Ctx = createContext<WishCtx | null>(null);

export function WishProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [wished, setWished] = useState<Set<number>>(new Set());

  // Избранное живёт на сервере: при входе подтягиваем, при выходе очищаем.
  useEffect(() => {
    if (!user) {
      setWished(new Set());
      return;
    }

    let cancelled = false;
    api
      .favoriteIds()
      .then((ids) => {
        if (!cancelled) setWished(new Set(ids));
      })
      .catch(() => {
        // Молча: подсветка сердечек не критична для работы каталога.
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  const toggle = useCallback(
    (id: number) => {
      if (!user) {
        navigate(`/login?next=${encodeURIComponent(window.location.pathname)}`);
        return;
      }

      // Оптимистично: сердечко закрашивается сразу, ошибка откатывает.
      const previous = wished;
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setWished(next);

      api.toggleFavorite(id).catch(() => setWished(previous));
    },
    [user, wished, navigate],
  );

  const sync = useCallback((ids: number[]) => setWished(new Set(ids)), []);

  const value = useMemo(() => ({ wished, toggle, sync }), [wished, toggle, sync]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWish() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useWish must be used within WishProvider");
  return c;
}
