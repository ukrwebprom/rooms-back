const express = require("express");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { query } = require("../db");
const authMiddleware = require("../middlewares/authMiddleware");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1h";

function createToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function generateRefreshToken() {
  const token = crypto.randomBytes(32).toString("hex"); // оригинал
  const hash = crypto.createHash("sha256").update(token).digest("hex"); // хэш для БД
  return { token, hash };
}

async function createRefreshToken(userId) {
  const { token, hash } = generateRefreshToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000); // 7 дней

  await query(
    `insert into refresh_tokens (user_id, token_hash, expires_at)
     values ($1, $2, $3)`,
    [userId, hash, expiresAt]
  );

  return { token, expiresAt }; // этот token пойдёт в cookie
}

router.get("/profile", authMiddleware, async (req, res) => {
  console.log('profile request:', req.user);
  try {
    const { rows } = await query(
      "SELECT id, name, email FROM users WHERE id = $1",
      [req.user.id]
    );
    const user = rows[0];
    if (!user) return res.status(404).json({ error: "USER_NOT_FOUND" });

    const {rows:ab} = await query(
      `select ability_key as key from user_abilities where user_id = $1`,
      [user.id]
    );
    
    const abilities = ab.map(r => r.key);
    console.log(abilities);

    res.json({ user, abilities });
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
  normalemail = String(email).trim().toLowerCase();
  console.log(req.body);
  try {
    // проверка, что email ещё не занят
    const existing = await query("SELECT id FROM users WHERE email = $1", [normalemail]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: "EMAIL_ALREADY_EXISTS" });
    }

    // хэшируем пароль
    const passwordHash = await bcrypt.hash(password, 10);

    // создаём пользователя
    const { rows } = await query(
      "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email",
      [name, normalemail, passwordHash]
    );
    const user = rows[0];
    console.log(user);
    const token = createToken({ id: user.id, email: user.email });
    res.status(201).json({ user, token });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "DB_ERROR", details: e.message });
  }
});

// POST /auth/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: "EMAIL_PASSWORD_REQUIRED" });
  }
  normalemail = String(email).trim().toLowerCase();
  try {
    const { rows } = await query("SELECT * FROM users WHERE email = $1", [normalemail]);
    const user = rows[0];

    if (!user) return res.status(401).json({ error: "INVALID_CREDENTIALS" });

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) return res.status(401).json({ error: "INVALID_CREDENTIALS" });

    // генерируем токен
    const token = createToken({ id: user.id, email: user.email });

     const { token: refreshToken, expiresAt } = await createRefreshToken(user.id);

    const {rows:ab} = await query(
      `select ability_key as key from user_abilities where user_id = $1`,
      [user.id]
    );
    
    const abilities = ab.map(r => r.key);

    const {rows:prop} = await query(
      `select property_id from user_properties where user_id = $1`,
      [user.id]
    );
    const properties = prop.map(r => r.property_id);

    res.cookie("refresh_token", refreshToken, {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    expires: expiresAt,
    path: "/auth",
    });

    res.json({ token, user: { id: user.id, name: user.name, email: user.email, status: user.status },  abilities, properties });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "DB_ERROR", details: e.message });
  }
});

router.post("/logout", async (req, res) => {
  try {
    const raw = req.cookies?.refresh_token;
    console.log('logout: ', raw);
    if (raw) {
      const hash = crypto.createHash("sha256").update(raw).digest("hex");
      await query(
        `update refresh_tokens set revoked_at = now()
         where token_hash = $1 and revoked_at is null`,
        [hash]
      );
    }

    // очищаем куку
    res.clearCookie("refresh_token", { path: "/auth" });

    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "LOGOUT_ERROR" });
  }
});

module.exports = router;
