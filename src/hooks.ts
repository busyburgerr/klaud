import { useCallback, useEffect, useRef, useState } from "react";

type AsyncState<T> = { data: T | null; error: Error | null; loading: boolean };

/**
 * Загрузка данных с API: следит за гонками ответов и умеет перезапрашивать.
 * `deps` — как у useEffect: запрос повторяется при их изменении.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []): AsyncState<T> & { reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ data: null, error: null, loading: true });
  const [nonce, setNonce] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    fnRef
      .current()
      .then((data) => {
        if (!cancelled) setState({ data, error: null, loading: false });
      })
      .catch((error: Error) => {
        // Прежние данные не стираем: при обрыве связи лучше показать
        // список с сообщением об ошибке, чем пустой экран.
        if (!cancelled) setState((prev) => ({ data: prev.data, error, loading: false }));
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}

/** Откладывает значение — чтобы поиск не дёргал API на каждое нажатие. */
export function useDebounced<T>(value: T, delay = 350) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}
