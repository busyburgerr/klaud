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

  phone(field = "phone", { required = true } = {}) {
    const digits = normalizePhone(this.src[field]);
    if (!digits) {
      if (required) this.errors[field] = "Обязательное поле";
      return this;
    }
    if (digits.length !== 10) this.errors[field] = "Ожидается 10 цифр номера";
    else this.out[field] = digits;
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
