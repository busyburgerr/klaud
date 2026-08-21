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
  /**
   * Отправка кодов подтверждения.
   *
   * `smsru` — настоящая отправка (нужен SMS_API_KEY), `log` — код пишется в
   * журнал сервера (для разработки), `off` — подтверждение по СМС выключено,
   * вход и регистрация работают только по паролю.
   */
  sms: {
    provider: process.env.SMS_PROVIDER
      || (process.env.NODE_ENV === "production" ? "off" : "log"),
    apiKey: process.env.SMS_API_KEY || "",
    sender: process.env.SMS_SENDER || "",
    /** Сколько живёт код и как часто можно просить новый. */
    ttlSeconds: parseInt(process.env.SMS_CODE_TTL || "300", 10),
    resendSeconds: parseInt(process.env.SMS_RESEND || "60", 10),
    maxAttempts: parseInt(process.env.SMS_ATTEMPTS || "5", 10),
  },
  /**
   * Вход через соцсети. Кнопка появляется, только когда заполнены оба ключа
   * приложения: без них обещать вход нечестно.
   */
  oauth: {
    /** Адрес сайта — из него собирается redirect_uri для провайдера. */
    publicUrl: (process.env.PUBLIC_URL || "").replace(/\/+$/, ""),
    vk: {
      clientId: process.env.OAUTH_VK_CLIENT_ID || "",
      secret: process.env.OAUTH_VK_SECRET || "",
      // Доступы запрашиваем те, что разрешены приложению: пустое значение —
      // только базовый профиль.
      scope: process.env.OAUTH_VK_SCOPE || "",
    },
    mailru: {
      clientId: process.env.OAUTH_MAILRU_CLIENT_ID || "",
      secret: process.env.OAUTH_MAILRU_SECRET || "",
    },
  },
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
