import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(here, "..");
export const SERVER_DIR = here;

export const config = {
  port: parseInt(process.env.API_PORT || "3001", 10),
  host: process.env.API_HOST || "0.0.0.0",
  dbFile: process.env.DB_FILE || path.join(ROOT, "data", "cloud.db"),
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

  if (problems.length) {
    console.error("[api] Небезопасная конфигурация:");
    for (const p of problems) console.error(`  · ${p}`);
    console.error("  Сгенерировать секрет: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"");
    process.exit(1);
  }
}
