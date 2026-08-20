import { Router } from "express";
import { all } from "../db/index.js";
import { PROJECT } from "../db/about-content.js";
import { initialOf } from "../lib/format.js";
import { publicMetrics } from "../lib/stats.js";

export const aboutRouter = Router();

const ROLE_TITLE = {
  admin: "Администрация платформы",
  moderator: "Модерация и редакция",
};

// GET /api/about — всё содержимое страницы «О проекте»
aboutRouter.get("/", (_req, res) => {
  const blocks = all("SELECT kind, label, title, text FROM about_blocks ORDER BY kind, position");

  // Редакция — это настоящие служебные аккаунты, а не выдуманные лица.
  const team = all(
    `SELECT slug, name, role, bio FROM users
      WHERE role IN ('admin', 'moderator')
      ORDER BY CASE role WHEN 'admin' THEN 0 ELSE 1 END, created_at`,
  ).map((u) => ({
    id: u.slug,
    name: u.name,
    initial: initialOf(u.name),
    role: ROLE_TITLE[u.role] ?? "Команда",
    bio: u.bio,
  }));

  res.json({
    project: PROJECT,
    principles: blocks.filter((b) => b.kind === "principle").map(({ label, title, text }) => ({ n: label, title, text })),
    milestones: blocks.filter((b) => b.kind === "milestone").map(({ label, title, text }) => ({ period: label, title, text })),
    team,
    metrics: publicMetrics(),
  });
});
