import { config } from "../config.js";
import { displayPhone } from "./format.js";

/**
 * Отправка кодов подтверждения.
 *
 * Провайдер выбирается переменной `SMS_PROVIDER`:
 *
 * - `smsru` — настоящая отправка через sms.ru, нужен `SMS_API_KEY`;
 * - `log`   — код пишется в журнал сервера (режим разработки);
 * - `off`   — подтверждение выключено: вход и регистрация идут по паролю.
 *
 * Пока провайдер не настроен, площадка честно говорит интерфейсу, что кодов
 * нет, — и не делает вид, что сообщение отправлено.
 */

/** Включено ли подтверждение по коду. */
export const smsEnabled = () => config.sms.provider !== "off";

/** Показывать ли код прямо в ответе API (только вне прода, режим `log`). */
export const smsEchoesCode = () => config.sms.provider === "log" && !config.isProd;

/** Четырёхзначный код: столько же цифр, сколько присылают банки и маркетплейсы. */
export function generateCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

const text = (code) => `Код подтверждения Клауд: ${code}. Никому его не сообщайте.`;

/**
 * Отправляет код. Возвращает `{ delivered }` — доставлено ли сообщение
 * настоящему получателю. Ошибку провайдера пробрасывает наверх.
 */
export async function sendCode(phone, code) {
  switch (config.sms.provider) {
    case "smsru":
      return sendViaSmsRu(phone, code);

    case "log":
      console.log(`[sms] ${displayPhone(phone)} — код ${code}`);
      return { delivered: false, provider: "log" };

    default:
      return { delivered: false, provider: "off" };
  }
}

/** sms.ru: простой HTTP-интерфейс, ключ берётся из SMS_API_KEY. */
async function sendViaSmsRu(phone, code) {
  if (!config.sms.apiKey) {
    throw new Error("SMS_API_KEY не задан — отправка кодов невозможна");
  }

  const url = new URL("https://sms.ru/sms/send");
  url.searchParams.set("api_id", config.sms.apiKey);
  url.searchParams.set("to", `7${phone}`);
  url.searchParams.set("msg", text(code));
  url.searchParams.set("json", "1");
  if (config.sms.sender) url.searchParams.set("from", config.sms.sender);

  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  const data = await res.json().catch(() => null);

  if (!res.ok || data?.status !== "OK") {
    const reason = data?.status_text || data?.status_code || res.status;
    throw new Error(`sms.ru отказал: ${reason}`);
  }

  return { delivered: true, provider: "smsru" };
}
