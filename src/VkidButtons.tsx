import { useEffect, useRef, useState } from "react";
import api, { ApiError, type Profile } from "./api";

/**
 * Кнопки входа VK ID.
 *
 * Официальный SDK рисует привычные кнопки «Войти через VK ID» и «Mail.ru» и
 * возвращает одноразовый код. Меняет код на профиль наш сервер — секрет
 * приложения в браузер не попадает.
 *
 * Если SDK не загрузился (блокировщик, сеть), компонент сообщает об этом
 * наверх, и страница показывает обычные кнопки-заглушки.
 */

const SDK_URL = "https://unpkg.com/@vkid/sdk@<3.0.0/dist-sdk/umd/index.js";

declare global {
  interface Window {
    VKIDSDK?: any;
  }
}

/** Загружает UMD-сборку один раз на страницу. */
function loadSdk(): Promise<any> {
  if (window.VKIDSDK) return Promise.resolve(window.VKIDSDK);

  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SDK_URL}"]`);
    const script = existing ?? document.createElement("script");

    script.addEventListener("load", () => {
      window.VKIDSDK ? resolve(window.VKIDSDK) : reject(new Error("SDK не инициализировался"));
    });
    script.addEventListener("error", () => reject(new Error("SDK не загрузился")));

    if (!existing) {
      script.src = SDK_URL;
      script.async = true;
      document.head.append(script);
    }
  });
}

export default function VkidButtons({
  onSignedIn,
  onRegister,
  onUnavailable,
  onError,
}: {
  /** Профиль уже связан с аккаунтом — вход выполнен. */
  onSignedIn: (user: Profile) => void;
  /** Новый человек: остаётся указать телефон и принять правила. */
  onRegister: (socialToken: string) => void;
  /** Виджет показать не удалось — страница вернёт обычные кнопки. */
  onUnavailable: () => void;
  onError: (message: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const params = await api.vkidParams();
        const VKID = await loadSdk();
        if (cancelled || !box.current) return;

        VKID.Config.init({
          app: params.app,
          redirectUrl: params.redirectUrl,
          responseMode: VKID.ConfigResponseMode.Callback,
          source: VKID.ConfigSource.LOWCODE,
          scope: params.scope,
          state: params.state,
          codeVerifier: params.codeVerifier,
        });

        const list = new VKID.OAuthList();
        list
          .render({ container: box.current, oauthList: ["vkid", "mail_ru"] })
          .on(VKID.WidgetEvents.ERROR, () => onError("ВКонтакте не подтвердил профиль"))
          .on(VKID.OAuthListInternalEvents.LOGIN_SUCCESS, async (payload: any) => {
            try {
              const result = await api.vkidExchange({
                code: payload.code,
                deviceId: payload.device_id,
                state: params.state,
              });
              if (result.status === "signed-in") onSignedIn(result.user);
              else onRegister(result.social);
            } catch (err) {
              onError(err instanceof ApiError ? err.message : "Не удалось войти через ВКонтакте");
            }
          });

        setReady(true);
      } catch {
        // Провайдер не настроен или SDK недоступен — показываем обычные кнопки.
        if (!cancelled) onUnavailable();
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div ref={box} />
      {!ready && (
        <p className="mono-label text-center" style={{ color: "#1f232099" }}>Загружаем VK ID…</p>
      )}
    </div>
  );
}
