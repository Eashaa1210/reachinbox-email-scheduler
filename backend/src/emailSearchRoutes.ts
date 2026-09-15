import { Router } from "express";
import { elasticsearch, EMAIL_INDEX } from "./elasticsearch";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const userId = Number(req.query.userId);
    const q = String(req.query.q || "").trim();

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    if (!q) {
      return res.status(400).json({ error: "q is required" });
    }

    const result = await elasticsearch.search({
      index: EMAIL_INDEX,
      query: {
        bool: {
          must: [
            {
              multi_match: {
                query: q,
                fields: ["recipient", "subject", "body"],
              },
            },
          ],
          filter: [
            {
              term: {
                userId,
              },
            },
          ],
        },
      },
    });

    const results = result.hits.hits.map((hit) => hit._source);

    return res.json({
      count: results.length,
      results,
    });
  } catch (error) {
    console.error("Search error:", error);
    return res.status(500).json({
      error: "Search failed",
    });
  }
});

export default router;