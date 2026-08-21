import { Router } from "express";
import { all } from "../db/index.js";
import { FAQ_CATEGORIES, SUPPORT } from "../db/help-content.js";
import { TERMS } from "../db/legal-content.js";

export const helpRouter = Router();
export const legalRouter = Router();

// GET /api/legal/terms — пользовательское соглашение
legalRouter.get("/terms", async (_req, res) => {
  res.json({ document: TERMS, support: SUPPORT });
});

// GET /api/help — всё содержимое страницы «Помощь» одним запросом
helpRouter.get("/", async (_req, res) => {
  const questions = await all("SELECT * FROM faq ORDER BY position, id");

  res.json({
    topics: await all("SELECT slug, n, title, blurb FROM help_topics ORDER BY position"),
    questions: questions.map((q) => ({
      id: q.id,
      category: q.category,
      question: q.question,
      answer: q.answer,
    })),
    // Показываем только те разделы, в которых есть вопросы.
    categories: FAQ_CATEGORIES.filter((c) => questions.some((q) => q.category === c)),
    support: SUPPORT,
  });
});
