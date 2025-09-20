const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { query } = require("../db");
const authMiddleware = require("../middlewares/authMiddleware");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

router.get("/profile", authMiddleware, async (req, res) => {
  try {
    const { rows } = await query(
      "SELECT id, name, email FROM users WHERE id = $1",
      [req.user.id]
    );
    const user = rows[0];
    if (!user) return res.status(404).json({ error: "USER_NOT_FOUND" });

    res.json({ user });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "DB_ERROR", details: e.message });
  }
});

// POST /auth/register
router.post("/register", async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: "NAME_EMAIL_PASSWORD_REQUIRED" });
  }

  try {
    // проверка, что email ещё не занят
    const existing = await query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: "EMAIL_ALREADY_EXISTS" });
    }

    // хэшируем пароль
    const passwordHash = await bcrypt.hash(password, 10);

    // создаём пользователя
    const { rows } = await query(
      "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email",
      [name, email, passwordHash]
    );

    res.status(201).json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "DB_ERROR", details: e.message });
  }
});

// POST /auth/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  console.log('find user', email, password);
  if (!email || !password) {
    return res.status(400).json({ error: "EMAIL_PASSWORD_REQUIRED" });
  }

  try {
    const { rows } = await query("SELECT * FROM users WHERE email = $1", [email]);
    const user = rows[0];
    console.log('find user', user);
    if (!user) return res.status(401).json({ error: "INVALID_CREDENTIALS" });

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) return res.status(401).json({ error: "INVALID_CREDENTIALS" });

    // генерируем токен
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "1h" });

    res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "DB_ERROR", details: e.message });
  }
});

module.exports = router;
