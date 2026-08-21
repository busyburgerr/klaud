import { createApp } from "./app.js";
import { assertProductionConfig, config } from "./config.js";
import { close, migrate } from "./db/index.js";
import { isSeeded, seed } from "./db/seed.js";

assertProductionConfig();

// Схема применяется при каждом старте: файл идемпотентный.
await migrate();

// Пустая база при первом запуске наполняется демо-каталогом.
// SEED=off — запуск с чистой базой (только схема).
if (!(await isSeeded()) && process.env.SEED !== "off") {
  const result = await seed();
  console.log(`[api] база заполнена демо-данными: ${result.listings} лотов`);
}

/** Строка подключения без пароля — её не стыдно показать в логе. */
const dbLabel = () => config.databaseUrl.replace(/\/\/([^:]+):[^@]*@/, "//$1@");

const server = createApp().listen(config.port, config.host, () => {
  console.log(`[api] Клауд слушает http://localhost:${config.port}`);
  console.log(`[api] режим: ${config.isProd ? "production" : "development"}, база: ${dbLabel()}`);
  if (config.serveClient) console.log("[api] раздача собранного фронтенда включена");
});

// Корректное завершение: дать дописать текущие ответы и закрыть базу.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    console.log(`\n[api] ${signal}: завершаем работу…`);
    server.close(async () => {
      await close();
      process.exit(0);
    });
    // Если соединения висят — не ждём дольше десяти секунд.
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
