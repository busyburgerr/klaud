import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
// Циклический импорт безопасен: applyMigrations вызывается только из migrate().
import { applyMigrations } from "./migrations.js";

const here = path.dirname(fileURLToPath(import.meta.url));

fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });

export const db = new DatabaseSync(config.dbFile);

db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA busy_timeout = 5000");

export const close = () => db.close();

export function migrate() {
  db.exec(fs.readFileSync(path.join(here, "schema.sql"), "utf8"));
  applyMigrations();
}

/** Rows as plain objects — node:sqlite returns null-prototype records. */
export const all = (sql, ...params) =>
  db.prepare(sql).all(...params).map((r) => ({ ...r }));

export const get = (sql, ...params) => {
  const row = db.prepare(sql).get(...params);
  return row ? { ...row } : undefined;
};

export const run = (sql, ...params) => db.prepare(sql).run(...params);

/** Runs `fn` inside a transaction, rolling back on any throw. */
export function tx(fn) {
  db.exec("BEGIN");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
