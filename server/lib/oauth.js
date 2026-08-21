import crypto from "node:crypto";
import { config } from "../config.js";

/**
 * Вход через ВКонтакте и Mail.ru.
 *
 * Оба провайдера работают по OAuth 2.0 «authorization code»: площадка уводит
 * человека на страницу согласия, получает одноразовый код и меняет его на
 * токен, по которому забирает профиль. ВК дополнительно требует PKCE.
 *
 * Ключи приложения задаются в `.env`. Пока их нет, провайдер выключен, и
 * кнопка на странице входа честно говорит, что способ пока недоступен.
 */

export const PROVIDERS = ["vk", "mailru"];

export const PROVIDER_LABEL = { vk: "ВКонтакте", mailru: "Mail.ru" };

/** Настроен ли провайдер: нужны идентификатор приложения, секрет и адрес сайта. */
export function providerReady(provider) {
  const keys = config.oauth[provider];
  return Boolean(keys?.clientId && keys?.secret && config.oauth.publicUrl);
}

/** Какие способы показывать на странице входа. */
export const socialOptions = () =>
  Object.fromEntries(PROVIDERS.map((p) => [p, providerReady(p)]));

const redirectUri = (provider) => `${config.oauth.publicUrl}/api/auth/oauth/${provider}/callback`;

/**
 * Настройки для виджета VK ID на странице входа.
 * Секрет приложения сюда не попадает: обмен кода на токен делает сервер.
 */
export const vkidConfig = () => ({
  app: Number(config.oauth.vk.clientId) || 0,
  redirectUrl: config.oauth.publicUrl,
  scope: config.oauth.vk.scope,
});

/** Пара для PKCE: verifier остаётся у нас, challenge уходит провайдеру. */
export function pkce() {
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

/** Адрес страницы согласия провайдера. */
export function authorizeUrl(provider, { state, challenge }) {
  const keys = config.oauth[provider];

  if (provider === "vk") {
    const url = new URL("https://id.vk.com/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", keys.clientId);
    url.searchParams.set("redirect_uri", redirectUri("vk"));
    url.searchParams.set("state", state);
    if (config.oauth.vk.scope) url.searchParams.set("scope", config.oauth.vk.scope);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    return url.toString();
  }

  const url = new URL("https://oauth.mail.ru/login");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", keys.clientId);
  url.searchParams.set("redirect_uri", redirectUri("mailru"));
  url.searchParams.set("state", state);
  url.searchParams.set("scope", "userinfo");
  return url.toString();
}

/**
 * Меняет код на профиль пользователя.
 * Возвращает `{ id, name, email, phone }` — телефон отдаёт только ВК и только
 * если человек разрешил.
 */
export async function fetchProfile(provider, { code, verifier, deviceId, redirect }) {
  return provider === "vk"
    ? fetchVk({ code, verifier, deviceId, redirect })
    : fetchMailru({ code });
}

async function fetchVk({ code, verifier, deviceId, redirect }) {
  const keys = config.oauth.vk;

  const token = await postForm("https://id.vk.com/oauth2/auth", {
    grant_type: "authorization_code",
    code,
    code_verifier: verifier,
    client_id: keys.clientId,
    client_secret: keys.secret,
    device_id: deviceId ?? "",
    // Виджет VK ID возвращает человека на адрес сайта, серверный поток — на
    // страницу callback. При обмене кода адрес должен совпасть с тем, что
    // использовался при входе.
    redirect_uri: redirect || redirectUri("vk"),
  });

  if (!token.access_token) {
    throw new Error(token.error_description || token.error || "ВК не выдал токен");
  }

  const info = await postForm("https://id.vk.com/oauth2/user_info", {
    client_id: keys.clientId,
    access_token: token.access_token,
  });
  const user = info.user ?? {};

  return {
    id: String(user.user_id ?? token.user_id ?? ""),
    name: [user.first_name, user.last_name].filter(Boolean).join(" ").trim(),
    email: user.email ?? null,
    phone: user.phone ?? null,
  };
}

async function fetchMailru({ code }) {
  const keys = config.oauth.mailru;

  const token = await postForm("https://oauth.mail.ru/token", {
    grant_type: "authorization_code",
    code,
    client_id: keys.clientId,
    client_secret: keys.secret,
    redirect_uri: redirectUri("mailru"),
  });

  if (!token.access_token) {
    throw new Error(token.error_description || token.error || "Mail.ru не выдал токен");
  }

  const res = await fetch(
    `https://oauth.mail.ru/userinfo?access_token=${encodeURIComponent(token.access_token)}`,
    { signal: AbortSignal.timeout(10_000) },
  );
  const user = await res.json().catch(() => ({}));
  if (!res.ok || !user.id) throw new Error("Mail.ru не отдал профиль");

  return {
    id: String(user.id),
    name: [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || user.name || "",
    email: user.email ?? null,
    phone: null,
  };
}

async function postForm(url, params) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(10_000),
  });
  return res.json().catch(() => ({}));
}
