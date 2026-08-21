import { Router } from "express";
import bcrypt from "bcryptjs";
import { get, run, tx } from "../db/index.js";
import { config } from "../config.js";
import { displayPhone, normalizePhone, slugify } from "../lib/format.js";
import { generateCode, sendCode, smsEchoesCode, smsEnabled } from "../lib/sms.js";
import {
  authorizeUrl, fetchProfile, pkce, PROVIDERS, PROVIDER_LABEL, providerReady, socialOptions,
  vkidConfig,
} from "../lib/oauth.js";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { badRequest, conflict, forbidden, notFound, unauthorized, wrap } from "../lib/http.js";
import { privateUser } from "../lib/serialize.js";
import { v } from "../lib/validate.js";
import { clearAuthCookie, requireAuth, setAuthCookie, signToken } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";

export const authRouter = Router();

const limiter = rateLimit({ windowMs: 60_000, max: 15 });

/** Свободный slug для страницы продавца: artem-volkov, artem-volkov-2, … */
async function uniqueSlug(name) {
  const base = slugify(name);
  let candidate = base;
  let i = 2;
  while (await get("SELECT 1 AS x FROM users WHERE slug = ?", candidate)) {
    candidate = `${base}-${i++}`;
  }
  return candidate;
}


// ── Подтверждение номера по коду из СМС ──

/** Секунды до момента `iso`; прошедшее время считаем нулём. */
const secondsLeft = (iso) => {
  const at = new Date(String(iso).replace(" ", "T") + "Z").getTime();
  return Math.max(0, Math.ceil((at - Date.now()) / 1000));
};

const secondsSince = (iso) => {
  const at = new Date(String(iso).replace(" ", "T") + "Z").getTime();
  return Math.floor((Date.now() - at) / 1000);
};

/**
 * Проверяет код и гасит его.
 *
 * Код одноразовый: после верной проверки он удаляется, после исчерпания
 * попыток — тоже. Так четыре цифры не подберёшь перебором.
 */
async function consumeCode(phone, purpose, code) {
  const row = await get("SELECT * FROM phone_codes WHERE phone = ?", phone);
  if (!row || row.purpose !== purpose) {
    throw badRequest("Сначала запросите код подтверждения", { code: "Код не запрашивался" });
  }
  if (secondsLeft(row.expires_at) === 0) {
    await run("DELETE FROM phone_codes WHERE phone = ?", phone);
    throw badRequest("Код устарел — запросите новый", { code: "Срок кода истёк" });
  }
  if (!bcrypt.compareSync(code, row.code_hash)) {
    const attempts = row.attempts + 1;
    if (attempts >= config.sms.maxAttempts) {
      await run("DELETE FROM phone_codes WHERE phone = ?", phone);
      throw badRequest("Слишком много попыток — запросите новый код", { code: "Код заблокирован" });
    }
    await run("UPDATE phone_codes SET attempts = ? WHERE phone = ?", attempts, phone);
    throw badRequest("Неверный код из СМС", {
      code: `Осталось попыток: ${config.sms.maxAttempts - attempts}`,
    });
  }

  await run("DELETE FROM phone_codes WHERE phone = ?", phone);
}

// GET /api/auth/options — какие способы входа доступны на площадке
authRouter.get("/options", async (_req, res) => {
  res.json({
    sms: { enabled: smsEnabled(), resendSeconds: config.sms.resendSeconds, codeLength: 4 },
    social: socialOptions(),
  });
});

// GET /api/auth/sms — включено ли подтверждение по коду
authRouter.get("/sms", async (_req, res) => {
  res.json({ enabled: smsEnabled(), resendSeconds: config.sms.resendSeconds, codeLength: 4 });
});

// POST /api/auth/code — запрос кода на номер
authRouter.post(
  "/code",
  limiter,
  wrap(async (req, res) => {
    if (!smsEnabled()) {
      throw badRequest("Подтверждение по СМС сейчас отключено — войдите по паролю");
    }

    const body = v(req.body)
      .phone("phone")
      .oneOf("purpose", ["register", "login"], { required: true })
      .done();

    const existing = await get(
      "SELECT id, blocked_at, blocked_reason FROM users WHERE phone = ?", body.phone,
    );
    if (body.purpose === "register" && existing) {
      throw conflict("Пользователь с таким номером уже зарегистрирован");
    }
    if (body.purpose === "login") {
      if (!existing) throw badRequest("Аккаунта с таким номером нет — зарегистрируйтесь");
      if (existing.blocked_at) {
        throw forbidden(existing.blocked_reason
          ? `Аккаунт заблокирован: ${existing.blocked_reason}`
          : "Аккаунт заблокирован администрацией");
      }
    }

    // Частые запросы бьют и по кошельку площадки, и по владельцу номера.
    const previous = await get("SELECT sent_at FROM phone_codes WHERE phone = ?", body.phone);
    if (previous) {
      const wait = config.sms.resendSeconds - secondsSince(previous.sent_at);
      if (wait > 0) {
        throw badRequest(`Новый код можно запросить через ${wait} с`, { code: "Подождите" });
      }
    }

    const code = generateCode();
    await run(
      `INSERT INTO phone_codes (phone, code_hash, purpose, attempts, sent_at, expires_at)
       VALUES (?, ?, ?, 0, now_utc(), now_utc() + ?::int * interval '1 second')
       ON CONFLICT (phone) DO UPDATE SET
         code_hash = EXCLUDED.code_hash, purpose = EXCLUDED.purpose,
         attempts = 0, sent_at = now_utc(), expires_at = EXCLUDED.expires_at`,
      body.phone, bcrypt.hashSync(code, 10), body.purpose, config.sms.ttlSeconds,
    );

    let delivered = false;
    try {
      ({ delivered } = await sendCode(body.phone, code));
    } catch (err) {
      await run("DELETE FROM phone_codes WHERE phone = ?", body.phone);
      console.error("[sms] отправка не удалась:", err.message);
      throw badRequest("Не удалось отправить СМС. Попробуйте позже.");
    }

    res.status(201).json({
      sent: true,
      delivered,
      phone: displayPhone(body.phone),
      resendSeconds: config.sms.resendSeconds,
      expiresIn: config.sms.ttlSeconds,
      // В режиме разработки код возвращается прямо здесь: настоящей отправки нет.
      ...(smsEchoesCode() ? { code } : {}),
    });
  }),
);


// ── Вход через соцсети ──

/** Короткая кука для одноразовых значений шага авторизации. */
const stash = (res, name, value) =>
  res.cookie(name, value, {
    httpOnly: true, sameSite: "lax", secure: config.isProd, maxAge: 10 * 60 * 1000, path: "/api/auth",
  });

const drop = (res, name) => res.clearCookie(name, { path: "/api/auth" });

/** Куда вернуть человека после входа: только внутренний путь. */
const safeNext = (value) => {
  const next = String(value ?? "/");
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
};

/** Токен «профиль подтверждён провайдером» — живёт 15 минут. */
const linkToken = (payload) => jwt.sign(payload, config.jwtSecret, { expiresIn: "15m" });


// ── Виджет VK ID ──
// Кнопки рисует официальный SDK на странице, а код на токен меняет сервер:
// секрет приложения в браузер не попадает.

/**
 * Общий разбор профиля из соцсети: связываем, впускаем или отправляем
 * дозаполнять регистрацию. Используется и серверным потоком, и виджетом.
 */
async function signInWithProfile(provider, profile, res) {
  const linked = await get(
    "SELECT user_id FROM social_accounts WHERE provider = ? AND external_id = ?",
    provider, profile.id,
  );

  const finish = async (user) => {
    if (user.blocked_at) {
      throw forbidden(user.blocked_reason
        ? `Аккаунт заблокирован: ${user.blocked_reason}`
        : "Аккаунт заблокирован администрацией");
    }
    const token = signToken(user.id);
    setAuthCookie(res, token);
    return { status: "signed-in", token, user: privateUser(user) };
  };

  if (linked) return finish(await get("SELECT * FROM users WHERE id = ?", linked.user_id));

  const byEmail = profile.email
    ? await get("SELECT * FROM users WHERE email = ?", String(profile.email).toLowerCase())
    : null;
  const byPhone = !byEmail && profile.phone
    ? await get("SELECT * FROM users WHERE phone = ?", normalizePhone(profile.phone))
    : null;
  const existing = byEmail || byPhone;

  if (existing) {
    await run(
      `INSERT INTO social_accounts (provider, external_id, user_id, email)
       VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING`,
      provider, profile.id, existing.id, profile.email ?? null,
    );
    return finish(existing);
  }

  // Новый человек: телефон соцсеть не подтверждает, регистрацию он завершает сам.
  return {
    status: "register",
    social: linkToken({
      provider,
      externalId: profile.id,
      name: profile.name || "",
      email: profile.email || "",
      phone: profile.phone ? normalizePhone(profile.phone) : "",
    }),
  };
}

// GET /api/auth/vkid — настройки для виджета и одноразовые state/verifier
authRouter.get(
  "/vkid",
  wrap(async (req, res) => {
    if (!providerReady("vk")) throw badRequest("Вход через ВКонтакте пока не настроен");

    const state = crypto.randomBytes(16).toString("hex");
    const { verifier } = pkce();

    stash(res, "vkid_state", state);
    stash(res, "vkid_verifier", verifier);

    // codeVerifier отдаём виджету: он сам считает challenge. Секрет приложения
    // при этом остаётся на сервере — только им подписывается обмен кода.
    res.json({ ...vkidConfig(), state, codeVerifier: verifier });
  }),
);

// POST /api/auth/vkid — обмен кода, полученного виджетом
authRouter.post(
  "/vkid",
  limiter,
  wrap(async (req, res) => {
    if (!providerReady("vk")) throw badRequest("Вход через ВКонтакте пока не настроен");

    const state = req.cookies?.vkid_state;
    const verifier = req.cookies?.vkid_verifier;
    drop(res, "vkid_state");
    drop(res, "vkid_verifier");

    if (!state || state !== req.body?.state) {
      throw badRequest("Сессия входа устарела — нажмите кнопку ещё раз");
    }

    let profile;
    try {
      profile = await fetchProfile("vk", {
        code: String(req.body?.code ?? ""),
        deviceId: String(req.body?.deviceId ?? ""),
        verifier,
        redirect: config.oauth.publicUrl,
      });
    } catch (err) {
      console.error("[oauth] vkid:", err.message);
      throw badRequest("ВКонтакте не подтвердил профиль. Попробуйте войти по номеру телефона.");
    }

    if (!profile.id) throw badRequest("ВКонтакте не вернул профиль");

    res.json(await signInWithProfile("vk", profile, res));
  }),
);

// GET /api/auth/oauth/:provider — уводим на страницу согласия
authRouter.get(
  "/oauth/:provider",
  wrap(async (req, res) => {
    const provider = req.params.provider;
    if (!PROVIDERS.includes(provider)) throw notFound("Неизвестный способ входа");
    if (!providerReady(provider)) {
      throw badRequest(`Вход через ${PROVIDER_LABEL[provider]} пока не настроен`);
    }

    const state = crypto.randomBytes(16).toString("hex");
    const { verifier, challenge } = pkce();

    stash(res, "oauth_state", state);
    stash(res, "oauth_verifier", verifier);
    stash(res, "oauth_next", safeNext(req.query.next));

    res.redirect(authorizeUrl(provider, { state, challenge }));
  }),
);

// GET /api/auth/oauth/:provider/callback — провайдер вернул код
authRouter.get(
  "/oauth/:provider/callback",
  wrap(async (req, res) => {
    const provider = req.params.provider;
    if (!PROVIDERS.includes(provider) || !providerReady(provider)) {
      return res.redirect("/login?social=unavailable");
    }

    const next = safeNext(req.cookies?.oauth_next);
    const state = req.cookies?.oauth_state;
    const verifier = req.cookies?.oauth_verifier;
    for (const name of ["oauth_state", "oauth_verifier", "oauth_next"]) drop(res, name);

    // Человек мог отказаться на странице согласия — это не ошибка.
    if (req.query.error) return res.redirect(`/login?social=cancelled`);
    if (!state || state !== req.query.state) return res.redirect("/login?social=state");

    let profile;
    try {
      profile = await fetchProfile(provider, {
        code: String(req.query.code ?? ""),
        verifier,
        deviceId: req.query.device_id,
      });
    } catch (err) {
      console.error(`[oauth] ${provider}:`, err.message);
      return res.redirect("/login?social=failed");
    }

    if (!profile.id) return res.redirect("/login?social=failed");

    let outcome;
    try {
      outcome = await signInWithProfile(provider, profile, res);
    } catch {
      return res.redirect("/login?social=blocked");
    }

    if (outcome.status === "signed-in") return res.redirect(next);
    res.redirect(
      `/register?social=${encodeURIComponent(outcome.social)}&next=${encodeURIComponent(next)}`,
    );
  }),
);

// GET /api/auth/social/:token — что известно о профиле из соцсети
authRouter.get(
  "/social/:token",
  wrap(async (req, res) => {
    const data = readLinkToken(req.params.token);
    res.json({
      provider: data.provider,
      providerLabel: PROVIDER_LABEL[data.provider],
      name: data.name,
      email: data.email,
      phone: data.phone,
    });
  }),
);

// POST /api/auth/social — завершение регистрации через соцсеть
authRouter.post(
  "/social",
  limiter,
  wrap(async (req, res) => {
    const data = readLinkToken(req.body?.social);

    const body = v(req.body)
      .str("name", { required: true, min: 2, max: 80 })
      .phone("phone")
      .str("password", { min: 8, max: 100, trim: false })
      .str("city", { max: 80, fallback: "Москва" })
      .bool("agree", { fallback: false })
      .done();

    if (!body.agree) throw badRequest("Нужно принять правила публикации", { agree: "Обязательное поле" });
    if (await get("SELECT 1 AS x FROM users WHERE phone = ?", body.phone)) {
      throw conflict("Пользователь с таким номером уже зарегистрирован");
    }

    // Номер соцсеть не подтверждает — проверяем кодом, как при обычной регистрации.
    if (smsEnabled()) {
      const { code } = v(req.body).code("code").done();
      await consumeCode(body.phone, "register", code);
    }

    // Пароль необязателен: вход будет через соцсеть, задать его можно позже.
    const password = body.password || crypto.randomBytes(24).toString("base64url");

    const user = await tx(async () => {
      const created = await get(
        `INSERT INTO users (slug, name, phone, password_hash, city, email, phone_verified)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         RETURNING *`,
        await uniqueSlug(body.name), body.name, body.phone, bcrypt.hashSync(password, 10),
        body.city, data.email ? String(data.email).toLowerCase() : null, smsEnabled() ? 1 : 0,
      );
      await run(
        "INSERT INTO social_accounts (provider, external_id, user_id, email) VALUES (?, ?, ?, ?)",
        data.provider, data.externalId, created.id, data.email || null,
      );
      return created;
    });

    const token = signToken(user.id);
    setAuthCookie(res, token);
    res.status(201).json({ token, user: privateUser(user) });
  }),
);

/** Разбор токена связывания; истёкший и поддельный отличать незачем. */
function readLinkToken(value) {
  try {
    const data = jwt.verify(String(value ?? ""), config.jwtSecret);
    if (!PROVIDERS.includes(data.provider) || !data.externalId) throw new Error("bad payload");
    return data;
  } catch {
    throw badRequest("Ссылка на регистрацию устарела — начните вход заново");
  }
}

authRouter.post(
  "/register",
  limiter,
  wrap(async (req, res) => {
    const body = v(req.body)
      .str("name", { required: true, min: 2, max: 80 })
      .phone("phone")
      .str("password", { required: true, min: 8, max: 100, trim: false })
      .str("city", { max: 80, fallback: "Москва" })
      .bool("agree", { fallback: false })
      .done();

    if (!body.agree) throw badRequest("Нужно принять правила публикации", { agree: "Обязательное поле" });
    if (await get("SELECT 1 AS x FROM users WHERE phone = ?", body.phone)) {
      throw conflict("Пользователь с таким номером уже зарегистрирован");
    }

    // Пока отправка СМС настроена, номер подтверждается кодом.
    if (smsEnabled()) {
      const { code } = v(req.body).code("code").done();
      await consumeCode(body.phone, "register", code);
    }

    await run(
      `INSERT INTO users (slug, name, phone, password_hash, city, phone_verified)
       VALUES (?, ?, ?, ?, ?, ?)`,
      await uniqueSlug(body.name), body.name, body.phone,
      bcrypt.hashSync(body.password, 10), body.city, smsEnabled() ? 1 : 0,
    );

    const user = await get("SELECT * FROM users WHERE phone = ?", body.phone);
    const token = signToken(user.id);
    setAuthCookie(res, token);
    res.status(201).json({ token, user: privateUser(user) });
  }),
);

authRouter.post(
  "/login",
  limiter,
  wrap(async (req, res) => {
    // Войти можно паролем или кодом из СМС — что пришло, то и проверяем.
    const byCode = smsEnabled() && !req.body?.password;
    const body = v(req.body)
      .phone("phone")
      .str("password", { required: !byCode, max: 100, trim: false })
      .done();

    const user = await get("SELECT * FROM users WHERE phone = ?", body.phone);

    if (byCode) {
      if (!user) throw unauthorized("Аккаунта с таким номером нет");
      const { code } = v(req.body).code("code").done();
      await consumeCode(body.phone, "login", code);
      await run("UPDATE users SET phone_verified = 1 WHERE id = ?", user.id);
    } else if (!user || !bcrypt.compareSync(body.password, user.password_hash)) {
      throw unauthorized("Неверный номер телефона или пароль");
    }
    if (user.blocked_at) {
      throw forbidden(user.blocked_reason
        ? `Аккаунт заблокирован: ${user.blocked_reason}`
        : "Аккаунт заблокирован администрацией");
    }

    await run("UPDATE users SET last_seen_at = now_utc() WHERE id = ?", user.id);
    const token = signToken(user.id);
    setAuthCookie(res, token);
    res.json({ token, user: privateUser(user) });
  }),
);

authRouter.post("/logout", async (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  res.json({ user: privateUser(req.user) });
});
