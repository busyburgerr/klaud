import { Router } from "express";
import bcrypt from "bcryptjs";
import { get, run } from "../db/index.js";
import { slugify } from "../lib/format.js";
import { badRequest, conflict, forbidden, unauthorized, wrap } from "../lib/http.js";
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

    await run(
      "INSERT INTO users (slug, name, phone, password_hash, city) VALUES (?, ?, ?, ?, ?)",
      await uniqueSlug(body.name), body.name, body.phone, bcrypt.hashSync(body.password, 10), body.city,
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
    const body = v(req.body)
      .phone("phone")
      .str("password", { required: true, max: 100, trim: false })
      .done();

    const user = await get("SELECT * FROM users WHERE phone = ?", body.phone);
    if (!user || !bcrypt.compareSync(body.password, user.password_hash)) {
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
