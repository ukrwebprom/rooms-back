const express = require("express");
const { query } = require("../db");

const router = express.Router();

// GET /api/users — список
router.get("/", async (req, res) => {
  try {
    const { rows } = await query(
      "SELECT id, name, email FROM public.users ORDER BY id ASC"
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "DB_ERROR", details: e.message });
  }
});

// POST /api/users — создать { name, email }
router.post("/", async (req, res) => {
  const { name, email } = req.body || {};
  if (!name || !email) return res.status(400).json({ error: "NAME_EMAIL_REQUIRED" });

  try {
    const { rows } = await query(
      "INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id, name, email",
      [name, email]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "DB_ERROR", details: e.message });
  }
});

module.exports = router;
