import { Router } from "express";
import { all } from "../db/index.js";
import { FAQ_CATEGORIES, SUPPORT } from "../db/help-content.js";

export const helpRouter = Router();

// GET /api/help — всё содержимое страницы «Помощь» одним запросом
helpRouter.get("/", (_req, res) => {
  const questions = all("SELECT * FROM faq ORDER BY position, id");

  res.json({
    topics: all("SELECT slug, n, title, blurb FROM help_topics ORDER BY position"),
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
