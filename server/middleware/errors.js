import { config } from "../config.js";
import { ApiError } from "../lib/http.js";

export function notFoundHandler(req, res) {
  res.status(404).json({ error: "Маршрут не найден", path: req.originalUrl });
}

// eslint-disable-next-line no-unused-vars -- Express определяет обработчик по арности
export function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Некорректный JSON в теле запроса" });
  }
  if (err?.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "Файл слишком большой" });
  }

  console.error("[api]", err);
  res.status(500).json({
    error: "Внутренняя ошибка сервера",
    ...(config.isProd ? {} : { detail: String(err?.message || err) }),
  });
}
