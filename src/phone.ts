/**
 * Номер телефона в интерфейсе.
 *
 * Те же правила, что и на сервере (`server/lib/validate.js`): десять цифр
 * российского мобильного, начиная с девятки. Проверяем на клиенте, чтобы
 * человек увидел ошибку сразу, а не после отправки формы.
 */

/** Только цифры номера, без кода страны: «+7 900 …» → «900…». */
export function phoneDigits(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))) {
    digits = digits.slice(1);
  }
  return digits.slice(0, 10);
}

/** «9001234567» → «900 123-45-67»: то же разбиение, что в макете. */
export function formatPhone(value: string) {
  const d = phoneDigits(value);
  const parts = [d.slice(0, 3), d.slice(3, 6), d.slice(6, 8), d.slice(8, 10)].filter(Boolean);
  if (parts.length <= 2) return parts.join(" ");
  return `${parts[0]} ${parts.slice(1).join("-")}`;
}

/** Пустая строка, если номер годится; иначе — что именно с ним не так. */
export function phoneError(value: string) {
  const d = phoneDigits(value);
  if (!d) return "Обязательное поле";
  if (d.length < 10) return "В номере должно быть 10 цифр после +7";
  if (!d.startsWith("9")) return "Нужен мобильный номер — он начинается с девятки";
  if (/^(\d)\1{9}$/.test(d)) return "Проверьте номер: он выглядит неправдоподобно";
  return "";
}
