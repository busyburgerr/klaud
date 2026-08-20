import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { config } from "./config.js";
import { migrate, run } from "./db/index.js";
import { errorHandler, notFoundHandler } from "./middleware/errors.js";
import { optionalAuth } from "./middleware/auth.js";
import { serveClient } from "./middleware/static.js";
import { rateLimit } from "./middleware/rateLimit.js";
import { adminRouter } from "./routes/admin.js";
import { authRouter } from "./routes/auth.js";
import { categoriesRouter, sellersRouter } from "./routes/catalog.js";
import { articlesRouter } from "./routes/journal.js";
import { favoritesRouter } from "./routes/favorites.js";
import { listingsRouter } from "./routes/listings.js";
import { aboutRouter } from "./routes/about.js";
import { helpRouter } from "./routes/help.js";
import { citiesRouter, metaRouter, uploadsRouter } from "./routes/misc.js";
import { reviewsRouter } from "./routes/reviews.js";
import { moderationRouter } from "./routes/moderation.js";
import { profileRouter } from "./routes/profile.js";
import { threadsRouter } from "./routes/threads.js";

export function createApp() {
  migrate();

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(
    cors({
      origin: (origin, cb) =>
        cb(null, !origin || config.corsOrigins.includes(origin) || !config.isProd),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(rateLimit({ windowMs: 60_000, max: 600 }));

  app.use("/uploads", express.static(config.uploadsDir, { maxAge: "7d", index: false }));

  // Разбор токена до маршрутов: req.user доступен и гостевым обработчикам.
  app.use(optionalAuth);
  // Отметка присутствия: пишем не чаще раза в минуту на пользователя,
  // иначе каждый GET превращался бы в запись в базу.
  app.use((req, _res, next) => {
    if (req.user) {
      run(
        `UPDATE users SET last_seen_at = datetime('now')
          WHERE id = ? AND last_seen_at < datetime('now', '-60 seconds')`,
        req.user.id,
      );
    }
    next();
  });

  app.get("/api/health", (_req, res) => res.json({ ok: true, at: new Date().toISOString() }));

  app.use("/api/auth", authRouter);
  app.use("/api/categories", categoriesRouter);
  app.use("/api/listings", listingsRouter);
  app.use("/api/sellers", sellersRouter);
  app.use("/api/articles", articlesRouter);
  app.use("/api/favorites", favoritesRouter);
  app.use("/api/threads", threadsRouter);
  app.use("/api/profile", profileRouter);
  app.use("/api/uploads", uploadsRouter);
  app.use("/api/meta", metaRouter);
  app.use("/api/cities", citiesRouter);
  app.use("/api/help", helpRouter);
  app.use("/api/about", aboutRouter);
  app.use("/api/reviews", reviewsRouter);
  app.use("/api/moderation", moderationRouter);
  app.use("/api/admin", adminRouter);

  // В проде тот же процесс отдаёт собранный SPA — один порт, без CORS.
  if (config.serveClient) serveClient(app);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
