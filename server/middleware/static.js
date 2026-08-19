import fs from "node:fs";
import path from "node:path";
import express from "express";
import { ROOT } from "../config.js";

const DIST = path.join(ROOT, "dist");

/**
 * Раздача собранного фронтенда в проде: хешированные ассеты кешируются
 * навсегда, index.html — никогда, все прочие пути отдают SPA-оболочку,
 * чтобы работали прямые ссылки вида /lot/12 и обновление страницы.
 */
export function serveClient(app) {
  if (!fs.existsSync(path.join(DIST, "index.html"))) {
    console.warn("[api] dist/ не найден — сначала выполните `pnpm build`");
    return;
  }

  app.use(
    express.static(DIST, {
      index: false,
      maxAge: "1y",
      setHeaders: (res, filePath) => {
        if (filePath.endsWith(".html")) res.setHeader("Cache-Control", "no-cache");
      },
    }),
  );

  app.get(/^\/(?!api\/|uploads\/).*/, (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(DIST, "index.html"));
  });
}
