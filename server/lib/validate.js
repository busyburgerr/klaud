import { badRequest } from "./http.js";
import { normalizePhone } from "./format.js";

/** Собирает ошибки полей и бросает одну 400 со списком. */
export class Validator {
  constructor(source = {}) {
    this.src = source;
    this.errors = {};
    this.out = {};
  }

  str(field, { required = false, min = 0, max = 5000, trim = true, fallback } = {}) {
    let v = this.src[field];
    if (v === undefined || v === null || v === "") {
      if (required) this.errors[field] = "Обязательное поле";
      else if (fallback !== undefined) this.out[field] = fallback;
      return this;
    }
    v = String(v);
    if (trim) v = v.trim();
    if (v.length < min) this.errors[field] = `Минимум ${min} символов`;
    else if (v.length > max) this.errors[field] = `Максимум ${max} символов`;
    else this.out[field] = v;
    return this;
  }

  int(field, { required = false, min = -Infinity, max = Infinity, fallback } = {}) {
    const raw = this.src[field];
    if (raw === undefined || raw === null || raw === "") {
      if (required) this.errors[field] = "Обязательное поле";
      else if (fallback !== undefined) this.out[field] = fallback;
      return this;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) this.errors[field] = "Ожидается число";
    else if (n < min) this.errors[field] = `Не меньше ${min}`;
    else if (n > max) this.errors[field] = `Не больше ${max}`;
    else this.out[field] = Math.round(n);
    return this;
  }

  oneOf(field, values, { required = false, fallback } = {}) {
    const v = this.src[field];
    if (v === undefined || v === null || v === "") {
      if (required) this.errors[field] = "Обязательное поле";
      else if (fallback !== undefined) this.out[field] = fallback;
      return this;
    }
    if (!values.includes(v)) this.errors[field] = `Допустимо: ${values.join(", ")}`;
    else this.out[field] = v;
    return this;
  }

  bool(field, { fallback } = {}) {
    const v = this.src[field];
    if (v === undefined || v === null) {
      if (fallback !== undefined) this.out[field] = fallback;
      return this;
    }
    this.out[field] = v === true || v === "true" || v === 1 || v === "1";
    return this;
  }

  /**
   * Мобильный номер России: десять цифр, начиная с девятки.
   * Принимаем любую запись — «+7 900 …», «8 (900) …», «900…», — но городские
   * и заведомо неверные номера отклоняем: на них не придёт код подтверждения.
   */
  phone(field = "phone", { required = true } = {}) {
    const digits = normalizePhone(this.src[field]);
    if (!digits) {
      if (required) this.errors[field] = "Обязательное поле";
      return this;
    }
    if (digits.length !== 10) {
      this.errors[field] = "В номере должно быть 10 цифр после +7";
    } else if (!/^9/.test(digits)) {
      this.errors[field] = "Нужен мобильный номер — он начинается с девятки";
    } else if (/^(\d)\1{9}$/.test(digits)) {
      this.errors[field] = "Проверьте номер: он выглядит неправдоподобно";
    } else {
      this.out[field] = digits;
    }
    return this;
  }

  /** Код из СМС: ровно четыре цифры. */
  code(field = "code", { required = true } = {}) {
    const raw = String(this.src[field] ?? "").replace(/\D/g, "");
    if (!raw) {
      if (required) this.errors[field] = "Введите код из СМС";
      return this;
    }
    if (!/^\d{4}$/.test(raw)) this.errors[field] = "Код состоит из четырёх цифр";
    else this.out[field] = raw;
    return this;
  }

  strArray(field, { max = 20, maxLen = 500, fallback } = {}) {
    const v = this.src[field];
    if (v === undefined || v === null) {
      if (fallback !== undefined) this.out[field] = fallback;
      return this;
    }
    if (!Array.isArray(v)) {
      this.errors[field] = "Ожидается массив";
      return this;
    }
    if (v.length > max) {
      this.errors[field] = `Не больше ${max} элементов`;
      return this;
    }
    this.out[field] = v.map((s) => String(s).trim().slice(0, maxLen)).filter(Boolean);
    return this;
  }

  done() {
    if (Object.keys(this.errors).length) {
      throw badRequest("Проверьте заполнение полей", this.errors);
    }
    return this.out;
  }
}

export const v = (source) => new Validator(source);
