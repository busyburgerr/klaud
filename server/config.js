import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(here, "..");
export const SERVER_DIR = here;

export const config = {
  port: parseInt(process.env.API_PORT || "3001", 10),
  host: process.env.API_HOST || "0.0.0.0",
  // Postgres: строка подключения целиком либо отдельные переменные.
  databaseUrl: process.env.DATABASE_URL
    || `postgres://${process.env.PGUSER || "cloud"}:${process.env.PGPASSWORD || "cloud"}`
      + `@${process.env.PGHOST || "127.0.0.1"}:${process.env.PGPORT || 5432}`
      + `/${process.env.PGDATABASE || "cloud"}`,
  // Отдельная схема удобна для тестов: каждый набор работает в своей.
  dbSchema: process.env.DB_SCHEMA || "public",
  dbPoolMax: parseInt(process.env.DB_POOL_MAX || "10", 10),
  uploadsDir: process.env.UPLOADS_DIR || path.join(here, "uploads"),
  jwtSecret: process.env.JWT_SECRET || "cloud-dev-secret-change-me",
  // В проде тот же процесс раздаёт dist/; SERVE_CLIENT=off отключает.
  serveClient: process.env.SERVE_CLIENT
    ? process.env.SERVE_CLIENT !== "off"
    : process.env.NODE_ENV === "production",
  jwtTtl: process.env.JWT_TTL || "30d",
  cookieName: "cloud_token",
  isProd: process.env.NODE_ENV === "production",
  rateLimitEnabled: process.env.RATE_LIMIT !== "off",
  // Origins allowed to send credentialed requests when the API is not proxied.
  corsOrigins: (process.env.CORS_ORIGINS || "http://localhost:8443,http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
};

/**
 * Проверка окружения перед запуском: в проде дефолтный секрет означает, что
 * любой может подписать себе токен, — падаем сразу, а не тихо работаем.
 */
export function assertProductionConfig() {
  if (!config.isProd) return;

  const problems = [];
  if (config.jwtSecret === "cloud-dev-secret-change-me") {
    problems.push("JWT_SECRET не задан — используется значение по умолчанию");
  }
  if (config.jwtSecret.length < 32) {
    problems.push("JWT_SECRET короче 32 символов");
  }
  if (!process.env.DATABASE_URL && !process.env.PGPASSWORD) {
    problems.push("DATABASE_URL не задан — подключение к базе идёт с паролем из примера");
  }

  if (problems.length) {
    console.error("[api] Небезопасная конфигурация:");
    for (const p of problems) console.error(`  · ${p}`);
    console.error("  Сгенерировать секрет: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"");
    process.exit(1);
  }
}
