const express = require("express");
const { query } = require("../db");
const auth = require("../middlewares/authMiddleware");

const router = express.Router();

/**
 * GET /api/properties
 * Вернуть все отели текущего пользователя
 */
router.get("/", auth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, name, description, address, phone, email, timezone, created_at
         FROM public.properties
        WHERE owner_id = $1
        ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "DB_ERROR", details: e.message });
  }
});

/**
 * POST /api/properties
 * Создать отель текущему пользователю
 * body: { name: string, description?: string, address?: object, phone?: string, email?: string, timezone?: string }
 */
router.post("/", auth, async (req, res) => {
  const { name, description, address, phone, email, timezone } = req.body || {};
  if (!name) return res.status(400).json({ error: "NAME_REQUIRED" });

  // address можно принимать как объект или как строку — ниже ожидаем объект (JSON)
  try {
    const { rows } = await query(
      `INSERT INTO public.properties
         (owner_id, name, description, address, phone, email, timezone)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, COALESCE($7, 'Europe/Kyiv'))
       RETURNING id, name, description, address, phone, email, timezone, created_at`,
      [req.user.id, name, description || null, address ? JSON.stringify(address) : null, phone || null, email || null, timezone || null]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "DB_ERROR", details: e.message });
  }
});

module.exports = router;
