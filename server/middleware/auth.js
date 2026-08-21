import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { get } from "../db/index.js";
import { forbidden, unauthorized } from "../lib/http.js";

export function signToken(userId) {
  return jwt.sign({ sub: String(userId) }, config.jwtSecret, { expiresIn: config.jwtTtl });
}

export function setAuthCookie(res, token) {
  res.cookie(config.cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProd,
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

export function clearAuthCookie(res) {
  res.clearCookie(config.cookieName, { path: "/" });
}

function readToken(req) {
  const header = req.get("authorization");
  if (header && header.startsWith("Bearer ")) return header.slice(7).trim();
  return req.cookies?.[config.cookieName] || null;
}

/** Кладёт req.user, если токен валиден; без токена просто идёт дальше. */
export async function optionalAuth(req, _res, next) {
  const token = readToken(req);
  if (!token) return next();
  try {
    const { sub } = jwt.verify(token, config.jwtSecret);
    req.user = await get("SELECT * FROM users WHERE id = ?", Number(sub));
  } catch {
    // Просроченный или битый токен — считаем гостем.
  }
  next();
}

/** Требует авторизацию; ставится после optionalAuth. */
export function requireAuth(req, _res, next) {
  if (!req.user) return next(unauthorized());
  if (req.user.blocked_at) {
    return next(forbidden(req.user.blocked_reason || "Аккаунт заблокирован администрацией"));
  }
  next();
}

/** Роли по возрастанию прав: у администратора есть всё, что есть у модератора. */
const RANK = { user: 0, moderator: 1, admin: 2 };

export const hasRole = (user, role) => (RANK[user?.role] ?? 0) >= (RANK[role] ?? 0);

/** Требует роль не ниже указанной: requireRole("moderator") пускает и админа. */
export function requireRole(role) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (req.user.blocked_at) return next(forbidden("Аккаунт заблокирован администрацией"));
    if (!hasRole(req.user, role)) return next(forbidden("Недостаточно прав"));
    next();
  };
}
