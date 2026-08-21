import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { config } from "../config.js";

const here = path.dirname(fileURLToPath(import.meta.url));

// ── Разбор значений ──
// COUNT() и SUM() возвращают int8; драйвер отдаёт его строкой, чтобы не
// потерять точность на больших числах. Наши счётчики до таких величин не
// доходят, а API обещает числа.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => (v === null ? null : Number(v)));
// NUMERIC — там же: средние оценки и суммы должны приходить числами.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => (v === null ? null : Number(v)));
// Метки времени отдаём строкой «ГГГГ-ММ-ДД ЧЧ:ММ:СС» — в этом виде их ждёт
// фронтенд, и в этом же виде их принимают запросы с параметром-датой.
pg.types.setTypeParser(pg.types.builtins.TIMESTAMP, (v) => (v === null ? null : v.slice(0, 19)));

// Имя схемы подставляется в SQL и в параметры соединения, поэтому его нельзя
// брать из окружения без проверки.
if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(config.dbSchema)) {
  throw new Error(`Недопустимое имя схемы: ${config.dbSchema}`);
}

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: config.dbPoolMax,
  // Схема и часовой пояс задаются при подключении — отдельных SET не нужно.
  options: `-c search_path=${config.dbSchema} -c timezone=UTC`,
  // Долгий запрос лучше оборвать, чем занимать соединение из пула навсегда.
  statement_timeout: 15_000,
});

// Разрыв соединения в простое не должен ронять процесс.
pool.on("error", (err) => console.error("[db] соединение потеряно:", err.message));

export const close = () => pool.end();

/**
 * Транзакция, внутри которой работают обычные get/all/run.
 *
 * Клиент кладётся в AsyncLocalStorage, поэтому вызовы внутри `fn` не нужно
 * переписывать — они сами попадут в ту же транзакцию. Вложенный вызов `tx`
 * продолжает уже открытую, а не начинает вторую.
 */
const current = new AsyncLocalStorage();

export async function tx(fn) {
  const open = current.getStore();
  if (open) return fn();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await current.run(client, fn);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Плейсхолдеры пишутся как `?` — привычнее и короче, чем `$1, $2, $3`,
 * а нумерацию проставляем сами. Знаки внутри строковых литералов и
 * операторы `??`/`?|` из jsonb не трогаем.
 */
export function toPgPlaceholders(sql) {
  let out = "";
  let n = 0;
  let quote = null;

  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];

    if (quote) {
      out += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      out += ch;
      continue;
    }
    if (ch === "?" && sql[i + 1] === "?") {
      out += "??";
      i += 1;
      continue;
    }
    out += ch === "?" ? `$${(n += 1)}` : ch;
  }

  return out;
}

async function query(sql, params) {
  const client = current.getStore();
  const text = toPgPlaceholders(sql);
  return client ? client.query(text, params) : pool.query(text, params);
}

export const all = async (sql, ...params) => (await query(sql, params)).rows;

export const get = async (sql, ...params) => (await query(sql, params)).rows[0];

/** Возвращает число затронутых строк и строки из RETURNING, если они есть. */
export const run = async (sql, ...params) => {
  const res = await query(sql, params);
  return { changes: res.rowCount, rows: res.rows };
};

/** Выполняет SQL без параметров — в том числе несколько инструкций сразу. */
export const exec = async (sql) => {
  const client = current.getStore();
  if (client) return client.query(sql);
  return pool.query(sql);
};

/** Применяет схему: файл идемпотентен, поэтому запускается при каждом старте. */
export async function migrate() {
  await exec(`CREATE SCHEMA IF NOT EXISTS "${config.dbSchema}"`);
  await exec(fs.readFileSync(path.join(here, "schema.sql"), "utf8"));
}
