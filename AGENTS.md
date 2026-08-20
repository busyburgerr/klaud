# figma-make-app

React + Vite + Tailwind CSS project running inside Figma Make.

## Development Server

A Vite development server is **already running** on `$PORT` (default 8443). You don't need to start it manually.

- Preview URL: The user can access the running app through the preview panel
- Hot reload: Changes to source files are reflected immediately

## Project Structure

This is the canonical project structure. Start with task-relevant files below. Only follow imports or inspect other files when required, when a documented path is missing, or when the repository contradicts this guide.

- `src/main.tsx` - React entrypoint; imports `src/index.css` and mounts `src/App.tsx` into the `#root` element
- `src/App.tsx` - Primary application component and the usual starting point for UI work
- `src/index.css` - Global CSS entrypoint and Tailwind CSS v4 import
- `index.html` - Vite HTML shell containing the `#root` element and loading `src/main.tsx`
- `package.json` - Project dependencies and the Vite build, development, preview, and formatting scripts
- `vite.config.ts` - Vite configuration with React, Tailwind CSS v4, and Figma Make plugins plus the `@` alias for `src`
- `.mise.toml` - Toolchain versions for Node.js and pnpm

## Dependencies

- Runtime: React 19 and React DOM 19
- Styling: Tailwind CSS v4 with the `@tailwindcss/vite` plugin
- Build tooling: Vite 8, TypeScript 5.7, and `@vitejs/plugin-react`
- Formatting: oxfmt

## Styling

This project uses **Tailwind CSS v4** through the `@tailwindcss/vite` plugin configured in `vite.config.ts`. `src/index.css` imports Tailwind with `@import 'tailwindcss';`. Use Tailwind utility classes directly in JSX and put global CSS or Tailwind v4 theme customization in `src/index.css`. This scaffold does not need a Tailwind config file or PostCSS config.

`src/main.tsx` imports `src/index.css`, so global font wiring belongs in `src/index.css`. Keep CSS `@import` statements first, then add any `@font-face` rules and font-family defaults there.

## Code quality

- Use double quotes for strings containing apostrophes (`"We're here to help"`), or escape them in single-quoted strings. An unescaped apostrophe in a single-quoted string breaks the build.
- Ensure JSX tags are closed and braces are balanced.
- Export components as default exports.

## Архитектура

Фронтенд работает целиком на REST API из `server/` — статических данных в
приложении нет.

- `src/api.ts` — типизированный клиент API (единственное место с `fetch`)
- `src/auth.tsx` — `AuthProvider`, `useAuth`, `RequireAuth` для закрытых страниц
- `src/store.tsx` — избранное, синхронизируется с сервером при входе
- `src/city.tsx` — выбранный город (шапка + фильтр каталога), хранится локально
- `src/Reviews.tsx` — сводка рейтинга и список отзывов о сделках
- `src/hooks.ts` — `useAsync` (загрузка с защитой от гонок) и `useDebounced`
- `src/routes.tsx` — маршруты; `/account`, `/messages`, `/new` обёрнуты в `RequireAuth`,
  `/moderation` — в `RequireRole` (роль не ниже `moderator`)
- `src/components.tsx` — карточка лота, сетка со скелетонами, пустые состояния

Гость на закрытой странице уходит на `/login?next=<путь>` и после входа
возвращается обратно. Сердечко у гостя ведёт туда же. Пользователь без прав
модератора на `/moderation` перенаправляется на главную.

### Роли и модерация

`user` → `moderator` → `admin` (права по возрастанию). Лот попадает в каталог
только после одобрения модератором; правки уже опубликованного лота возвращают
его в очередь. Администратор назначает модераторов и блокирует аккаунты.

Модерация и администрирование живут на `/moderation`, редактор журнала — на
`/journal/new` и `/journal/:slug/edit` (тот же `ArticleEditor`). Черновики видит
только редакция. Материал собирается из блоков (абзац, подзаголовок, список,
шаги, врезка); вёрстка блоков — `src/ArticleBody.tsx`, она же в предпросмотре. Подробности и список маршрутов — в `server/README.md`.

## Backend (server/)

REST API на Express 5 + SQLite (`node:sqlite`, без нативных зависимостей). База —
`data/cloud.db`, документация и список маршрутов — в `server/README.md`.

### Разработка

```bash
pnpm run api      # API на :3001
pnpm run dev      # фронтенд на :8443 (проксирует /api и /uploads)
```

### Продакшен

```bash
pnpm build
NODE_ENV=production JWT_SECRET=<секрет> pnpm start
```

Один процесс отдаёт API и собранный `dist/` с SPA-fallback. Без `JWT_SECRET`
запуск в проде прерывается.

### Прочие команды

- `pnpm run api:seed -- --force` — пересоздать демо-данные
- `pnpm run api:reset` — очистить базу до категорий и аккаунтов персонала
- `pnpm run api:catalog` — наполнить каталог лотами во всех разделах
- `pnpm run api:test` — тесты API на `node:test`
- `pnpm run typecheck` — проверка типов
