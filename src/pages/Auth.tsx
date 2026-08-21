import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import api, { ApiError, type SocialProvider } from "../api";
import { useAuth } from "../auth";
import { useAsync } from "../hooks";
import { FieldError } from "../components";
import { formatPhone, phoneError, phoneDigits } from "../phone";
import VkidButtons from "../VkidButtons";

/** Способы входа через соцсети — порядок такой же, как на кнопках. */
const SOCIAL: { key: SocialProvider; label: string }[] = [
  { key: "vk", label: "ВКонтакте" },
  { key: "mailru", label: "Mail.ru" },
];

/** Что показать, если провайдер вернул нас с ошибкой. */
const SOCIAL_ERROR: Record<string, string> = {
  cancelled: "Вход отменён на стороне соцсети",
  state: "Сессия входа устарела — попробуйте ещё раз",
  failed: "Соцсеть не подтвердила профиль. Попробуйте войти по номеру телефона.",
  blocked: "Аккаунт заблокирован администрацией",
  unavailable: "Этот способ входа сейчас недоступен",
};

export default function Auth({ mode }: { mode: "login" | "register" }) {
  const isReg = mode === "register";
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, loading: bootstrapping, login, register, setUser } = useAuth();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pass, setPass] = useState("");
  const [agree, setAgree] = useState(false);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [socialNotice, setSocialNotice] = useState("");
  // Виджет VK ID рисует кнопки сам; если он недоступен, остаются наши.
  const [widgetOff, setWidgetOff] = useState(false);

  // ── Подтверждение номера кодом ──
  const { data: options } = useAsync(() => api.authOptions(), []);
  const byCode = Boolean(options?.sms.enabled);
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [hint, setHint] = useState("");
  const [wait, setWait] = useState(0);

  // Обратный отсчёт до повторной отправки.
  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  /** Ошибка номера видна до отправки формы — не нужно ждать ответа сервера. */
  const localPhoneError = phone ? phoneError(phone) : "";

  // ── Возврат из соцсети ──
  // На регистрации в адресе лежит токен профиля, на входе — код ошибки.
  const socialToken = isReg ? params.get("social") : null;
  const socialFail = !isReg ? SOCIAL_ERROR[params.get("social") ?? ""] : "";
  const { data: socialProfile } = useAsync(
    () => (socialToken ? api.socialProfile(socialToken) : Promise.resolve(null)),
    [socialToken],
  );

  // Имя и телефон, которые соцсеть уже знает, подставляем один раз.
  useEffect(() => {
    if (!socialProfile) return;
    setName((prev) => prev || socialProfile.name);
    setPhone((prev) => prev || socialProfile.phone);
  }, [socialProfile]);

  /**
   * Куда вернуть после входа. Значение появляется только при переходе с
   * закрытой страницы; при обычном нажатии «Вход» его нет — и подсказка
   * «раздел доступен после входа» тогда не нужна.
   */
  const requestedPath = params.get("next");
  const redirected = Boolean(requestedPath) && requestedPath !== "/";
  const next = redirected ? requestedPath! : "/";
  const keepNext = redirected ? `?next=${encodeURIComponent(next)}` : "";

  useEffect(() => {
    if (!bootstrapping && user) navigate(next, { replace: true });
  }, [user, bootstrapping, next, navigate]);

  const fail = (err: unknown) => {
    if (err instanceof ApiError) {
      setError(err.message);
      setFields(err.details ?? {});
    } else {
      setError("Сервер недоступен. Попробуйте ещё раз.");
    }
  };

  /** Запрос кода: тот же обработчик и для первой отправки, и для повтора. */
  const askCode = async () => {
    if (busy || wait > 0) return;
    const local = phoneError(phone);
    if (local) {
      setFields({ phone: local });
      return;
    }

    setBusy(true);
    setError("");
    setFields({});
    try {
      const sent = await api.requestCode(phoneDigits(phone), isReg ? "register" : "login");
      setCodeSent(true);
      setWait(sent.resendSeconds);
      setHint(sent.delivered
        ? `Код отправлен на ${sent.phone}`
        : sent.code
          ? `СМС не подключены: код для проверки — ${sent.code}`
          : "СМС не подключены — код записан в журнал сервера");
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;

    const local = phoneError(phone);
    if (local) {
      setFields({ phone: local });
      return;
    }

    // Пока код не запрошен, кнопка отправляет именно запрос кода.
    if (byCode && !codeSent) {
      await askCode();
      return;
    }

    setBusy(true);
    setError("");
    setFields({});

    try {
      const digits = phoneDigits(phone);
      if (socialToken) {
        const created = await api.registerSocial({
          social: socialToken,
          name,
          phone: digits,
          agree,
          ...(pass ? { password: pass } : {}),
          ...(byCode ? { code } : {}),
        });
        // Регистрация через соцсеть сразу выдаёт токен — обновляем профиль.
        setUser(created);
      } else if (isReg) {
        await register({ name, phone: digits, password: pass, agree, ...(byCode ? { code } : {}) });
      } else if (byCode) {
        await login({ phone: digits, code });
      } else {
        await login({ phone: digits, password: pass });
      }
      navigate(next, { replace: true });
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const field = { border: "1px solid #1f232033", borderRadius: 14, background: "#f6f0e3", padding: "15px 16px", fontSize: 15, outline: "none", width: "100%" } as const;
  const label = { color: "#1f232099", display: "block", marginBottom: 8 } as const;

  return (
    <div className="min-h-screen grid md:grid-cols-2" style={{ background: "#efe8da", color: "#1f2320" }}>
      {/* ── Editorial panel ── */}
      <aside className="relative hidden md:flex flex-col justify-between p-12" style={{ background: "#1f2320", color: "#efe8da" }}>
        <div className="flex items-center justify-between">
          <Link to="/" className="font-display" style={{ color: "#efe8da", textDecoration: "none", fontSize: 34, fontWeight: 900, letterSpacing: "-0.03em" }}>Клауд</Link>
          <span className="mono-label" style={{ color: "#efe8da99" }}>Изд. № 417</span>
        </div>

        <div>
          <span className="mono-label" style={{ color: "#efe8da" }}>{isReg ? "Оформление подписки" : "Личный кабинет"}</span>
          <h2 className="font-display mt-5" style={{ fontSize: "clamp(40px,4.5vw,64px)", fontWeight: 800, lineHeight: 0.92, letterSpacing: "-0.03em" }}>
            {isReg ? <>Впишите себя<br />в ближайший<br /><span style={{ fontStyle: "italic", fontWeight: 500 }}>выпуск</span>.</> : <>С возвращением<br />на <span style={{ fontStyle: "italic", fontWeight: 500 }}>полосы</span><br />каталога.</>}
          </h2>
          <div style={{ borderTop: "3px double #efe8da44", marginTop: 32, paddingTop: 20 }}>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: "#efe8dabb", maxWidth: 340 }}>
              {isReg
                ? "Аккаунт даёт доступ к размещению лотов, сохранённым объявлениям и безопасным сделкам с курьерской доставкой."
                : "Войдите, чтобы вернуться к сохранённым лотам, диалогам с продавцами и своим активным объявлениям."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6 mono-label" style={{ color: "#efe8da77" }}>
          <span>Каталог частных объявлений</span><span>·</span><span>с 2026 года</span>
        </div>
      </aside>

      {/* ── Form panel ── */}
      <main className="flex flex-col justify-center px-6 py-14 md:px-16">
        <div className="w-full mx-auto" style={{ maxWidth: 400 }}>
          {/* Mobile brand */}
          <Link to="/" className="font-display md:hidden block mb-8" style={{ color: "#1f2320", textDecoration: "none", fontSize: 32, fontWeight: 900, letterSpacing: "-0.03em" }}>Клауд</Link>

          <span className="mono-label" style={{ color: "#1f2320" }}>{isReg ? "Регистрация" : "Вход"}</span>
          <h1 className="font-display mt-4 mb-8" style={{ fontSize: "clamp(32px,5vw,48px)", fontWeight: 800, lineHeight: 0.95, letterSpacing: "-0.02em" }}>
            {isReg ? "Создать аккаунт" : "Войти в аккаунт"}
          </h1>

          {redirected && !user && (
            <p className="mono-label mb-6" style={{ color: "#1f232099", background: "#f6f0e3", border: "1px solid #1f232022", borderRadius: 12, padding: "12px 14px" }}>
              Этот раздел доступен после входа
            </p>
          )}

          {socialFail && (
            <p className="mono-label mb-6" style={{ color: "#a33", background: "#f6f0e3", border: "1px solid #a3333322", borderRadius: 12, padding: "12px 14px" }}>
              {socialFail}
            </p>
          )}

          {socialProfile && (
            <p className="mono-label mb-6" style={{ color: "#1f232099", background: "#f6f0e3", border: "1px solid #1f232022", borderRadius: 12, padding: "12px 14px" }}>
              {socialProfile.providerLabel} подтвердил профиль{socialProfile.email ? ` · ${socialProfile.email}` : ""}.
              Остались номер телефона и согласие с правилами.
            </p>
          )}

          {error && (
            <p className="mono-label mb-6" style={{ color: "#a33", background: "#f6f0e3", border: "1px solid #a3333322", borderRadius: 12, padding: "12px 14px" }}>
              {error}
            </p>
          )}

          <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
            {isReg && (
              <div>
                <span className="mono-label" style={label}>Как к вам обращаться</span>
                <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Артём Волков" autoComplete="name" style={field} />
                <FieldError>{fields.name}</FieldError>
              </div>
            )}
            <div>
              <span className="mono-label" style={label}>Номер телефона</span>
              <div className="flex items-center" style={{ ...field, padding: 0, overflow: "hidden" }}>
                <span className="mono-label flex items-center" style={{ padding: "0 14px", borderRight: "1px solid #1f232022", color: "#1f232099", alignSelf: "stretch" }}>+7</span>
                <input
                  required
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  value={formatPhone(phone)}
                  onChange={(e) => { setPhone(phoneDigits(e.target.value)); setFields({}); }}
                  placeholder="900 000-00-00"
                  style={{ border: "none", background: "none", outline: "none", padding: "15px 16px", fontSize: 15, width: "100%" }}
                />
              </div>
              <FieldError>{fields.phone || localPhoneError}</FieldError>
            </div>

            {byCode && codeSent && (
              <div>
                <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                  <span className="mono-label" style={{ color: "#1f232099" }}>Код из СМС</span>
                  <button
                    type="button"
                    onClick={askCode}
                    disabled={wait > 0 || busy}
                    className="mono-label"
                    style={{ background: "none", border: "none", cursor: wait > 0 ? "default" : "pointer", color: wait > 0 ? "#1f232066" : "#1f2320", padding: 0 }}
                  >
                    {wait > 0 ? `Выслать снова через ${wait} с` : "Выслать снова"}
                  </button>
                </div>
                <input
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="0000"
                  style={{ ...field, letterSpacing: "0.5em", fontSize: 20, textAlign: "center" }}
                />
                <FieldError>{fields.code}</FieldError>
                {hint && (
                  <p className="mono-label m-0 mt-2" style={{ color: "#1f232099" }}>{hint}</p>
                )}
              </div>
            )}
            {(isReg || !byCode) && (
            <div>
              <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                <span className="mono-label" style={{ color: "#1f232099" }}>
                  Пароль{socialToken ? " · можно задать позже" : isReg ? " · от 8 символов" : ""}
                </span>
              </div>
              <div className="relative">
                <input required={!socialToken} type={show ? "text" : "password"} value={pass} onChange={(e) => setPass(e.target.value)} placeholder="••••••••" autoComplete={isReg ? "new-password" : "current-password"} style={{ ...field, paddingRight: 52 }} />
                <button type="button" onClick={() => setShow(!show)} className="mono-label" style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#1f232099" }}>
                  {show ? "Скрыть" : "Показать"}
                </button>
              </div>
              <FieldError>{fields.password}</FieldError>
            </div>
            )}

            {isReg && (
              <div>
                <label className="flex items-start gap-3 cursor-pointer" style={{ fontSize: 13, lineHeight: 1.5, color: "#1f2320cc" }}>
                  <span style={{ width: 20, height: 20, borderRadius: 6, border: "1px solid #1f2320", background: agree ? "#1f2320" : "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                    {agree && <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-6" stroke="#efe8da" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </span>
                  <input type="checkbox" checked={agree} onChange={() => setAgree(!agree)} style={{ display: "none" }} />
                  <span>
                    Соглашаюсь с{" "}
                    <Link to="/terms" target="_blank" className="underline-link" style={{ color: "#1f2320", fontWeight: 600, textDecoration: "none" }}>
                      пользовательским соглашением
                    </Link>{" "}
                    и обработкой персональных данных Клауд.
                  </span>
                </label>
                <FieldError>{fields.agree}</FieldError>
              </div>
            )}

            <button type="submit" disabled={busy} className="mono-label" style={{ background: "#1f2320", color: "#efe8da", border: "none", borderRadius: 14, padding: "18px", cursor: busy ? "wait" : "pointer", marginTop: 4, opacity: busy ? 0.7 : 1 }}>
              {busy
                ? "Подождите…"
                : byCode && !codeSent
                  ? "Получить код в СМС →"
                  : socialToken
                    ? "Завершить регистрацию →"
                    : isReg
                      ? "Создать аккаунт →"
                      : "Войти →"}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-4 my-7">
            <div style={{ flex: 1, height: 1, background: "#1f232022" }} />
            <span className="mono-label" style={{ color: "#1f232088" }}>или</span>
            <div style={{ flex: 1, height: 1, background: "#1f232022" }} />
          </div>

          {/* Вход через соцсети: официальный виджет VK ID, если он доступен. */}
          {options?.social.vk && !widgetOff ? (
            <VkidButtons
              onSignedIn={(u) => { setUser(u); navigate(next, { replace: true }); }}
              onRegister={(token) => navigate(`/register?social=${encodeURIComponent(token)}${redirected ? `&next=${encodeURIComponent(next)}` : ""}`)}
              onUnavailable={() => setWidgetOff(true)}
              onError={setError}
            />
          ) : (
          <div className="flex gap-3">
            {SOCIAL.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => {
                  if (options?.social[s.key]) {
                    window.location.href = `/api/auth/oauth/${s.key}?next=${encodeURIComponent(next)}`;
                  } else {
                    setSocialNotice(`Вход через ${s.label} пока не подключён. Используйте номер телефона.`);
                  }
                }}
                className="mono-label flex-1"
                style={{ background: "transparent", border: "1px solid #1f232033", borderRadius: 14, padding: "14px", cursor: "pointer", color: "#1f2320" }}
              >
                {s.label}
              </button>
            ))}
          </div>
          )}
          {socialNotice && (
            <p className="mono-label mt-3 text-center" style={{ color: "#1f232099" }}>{socialNotice}</p>
          )}

          <p className="text-center mt-8" style={{ fontSize: 14, color: "#1f2320cc" }}>
            {isReg ? "Уже есть аккаунт? " : "Ещё нет аккаунта? "}
            <Link to={`${isReg ? "/login" : "/register"}${keepNext}`} className="underline-link" style={{ color: "#1f2320", textDecoration: "none", fontWeight: 600 }}>
              {isReg ? "Войти" : "Зарегистрироваться"}
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
