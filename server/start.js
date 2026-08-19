/**
 * Точка входа для продакшена: `pnpm start`.
 *
 * Ставит NODE_ENV=production, если он не задан снаружи (кроссплатформенно —
 * без cross-env), и принимает PORT, который назначают хостинги. Один процесс
 * отдаёт и API, и собранный фронтенд из dist/.
 */
process.env.NODE_ENV ||= "production";
if (!process.env.API_PORT && process.env.PORT) process.env.API_PORT = process.env.PORT;

await import("./index.js");
