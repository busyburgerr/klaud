import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import api, { ApiError, auth as tokenStore, type Profile, type Role } from "./api";

type AuthCtx = {
  user: Profile | null;
  /** true, пока проверяется сохранённый токен при старте приложения. */
  loading: boolean;
  login: (input: { phone: string; password: string }) => Promise<Profile>;
  register: (input: { name: string; phone: string; password: string; agree: boolean }) => Promise<Profile>;
  logout: () => Promise<void>;
  /** Локально обновить пользователя после сохранения настроек. */
  setUser: (user: Profile) => void;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Восстанавливаем сессию по сохранённому токену или httpOnly-cookie.
  useEffect(() => {
    let cancelled = false;

    api
      .me()
      .then((u) => {
        if (!cancelled) setUser(u);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) tokenStore.token = null;
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (input: { phone: string; password: string }) => {
    const u = await api.login(input);
    setUser(u);
    return u;
  }, []);

  const register = useCallback(
    async (input: { name: string; phone: string; password: string; agree: boolean }) => {
      const u = await api.register(input);
      setUser(u);
      return u;
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, setUser }),
    [user, loading, login, register, logout],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth должен вызываться внутри AuthProvider");
  return ctx;
}

/**
 * Закрывает маршрут от гостей: личный кабинет, сообщения, подача лота.
 * Пока идёт проверка токена — держим экран, чтобы не мигнуть формой входа
 * авторизованному пользователю. После входа возвращаем на исходную страницу.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <ScreenLoader />;

  if (!user) {
    const back = location.pathname + location.search;
    return <Navigate to={`/login?next=${encodeURIComponent(back)}`} replace />;
  }

  return <>{children}</>;
}

/** Роли по возрастанию прав: администратору доступно всё, что и модератору. */
const RANK: Record<Role, number> = { user: 0, moderator: 1, admin: 2 };

export const hasRole = (user: Profile | null, role: Role) =>
  RANK[user?.role ?? "user"] >= RANK[role];

/**
 * Маршрут для персонала: гостя отправляем на вход, пользователя без прав —
 * на главную, чтобы страница модерации не подсказывала о своём существовании.
 */
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <ScreenLoader />;
  if (!user) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  }
  if (!hasRole(user, role)) return <Navigate to="/" replace />;

  return <>{children}</>;
}

export function ScreenLoader() {
  return (
    <div className="flex items-center justify-center" style={{ minHeight: "60vh" }}>
      <span className="mono-label" style={{ color: "#1f232099" }}>Загрузка…</span>
    </div>
  );
}
