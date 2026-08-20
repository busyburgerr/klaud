import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import api, { type City } from "./api";
import { useAuth } from "./auth";

type CityCtx = {
  /** Выбранный город или null — «Вся Россия». */
  city: string | null;
  cities: City[];
  setCity: (name: string | null) => void;
};

const Ctx = createContext<CityCtx | null>(null);
const STORAGE_KEY = "cloud.city";

export function CityProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [cities, setCities] = useState<City[]>([]);
  const [city, setCityState] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));
  const [touched, setTouched] = useState(() => localStorage.getItem(STORAGE_KEY) !== null);

  useEffect(() => {
    let cancelled = false;
    api
      .cities()
      .then((items) => !cancelled && setCities(items))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Пока выбор не сделан вручную, подставляем город из профиля.
  useEffect(() => {
    if (!touched && user?.city) setCityState(user.city);
  }, [user?.city, touched]);

  const setCity = useCallback((name: string | null) => {
    setTouched(true);
    setCityState(name);
    if (name) localStorage.setItem(STORAGE_KEY, name);
    else localStorage.setItem(STORAGE_KEY, "");
  }, []);

  const value = useMemo(
    () => ({ city: city || null, cities, setCity }),
    [city, cities, setCity],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCity() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCity должен вызываться внутри CityProvider");
  return ctx;
}
