/** Ошибка с HTTP-статусом — её ловит обработчик в middleware/errors.js. */
export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new ApiError(400, msg, details);
export const unauthorized = (msg = "Требуется авторизация") => new ApiError(401, msg);
export const forbidden = (msg = "Нет доступа") => new ApiError(403, msg);
export const notFound = (msg = "Не найдено") => new ApiError(404, msg);
export const conflict = (msg) => new ApiError(409, msg);

/** Оборачивает async-обработчик, чтобы отказ промиса дошёл до next(). */
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
