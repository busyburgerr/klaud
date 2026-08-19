import { config } from "../config.js";

/** Минимальный лимитер в памяти — защита форм входа и регистрации. */
export function rateLimit({ windowMs = 60_000, max = 20, key = (req) => req.ip } = {}) {
  if (!config.rateLimitEnabled) return (_req, _res, next) => next();

  const hits = new Map();

  setInterval(() => {
    const now = Date.now();
    for (const [k, entry] of hits) if (entry.resetAt <= now) hits.delete(k);
  }, windowMs).unref?.();

  return (req, res, next) => {
    const now = Date.now();
    const k = key(req);
    const entry = hits.get(k);

    if (!entry || entry.resetAt <= now) {
      hits.set(k, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (entry.count >= max) {
      const retry = Math.ceil((entry.resetAt - now) / 1000);
      res.set("Retry-After", String(retry));
      return res.status(429).json({ error: `Слишком много попыток. Повторите через ${retry} с.` });
    }
    entry.count += 1;
    next();
  };
}
