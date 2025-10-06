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
      ` SELECT p.id, p.name, p.description, p.address, p.city, p.country, p.phone, p.email, p.created_at
        FROM properties AS p
        JOIN user_properties AS up
        ON up.property_id = p.id
        WHERE up.user_id = $1
        ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "DB_ERROR", details: e.message });
  }
});


// GET /properties/:propertyId - получить данные отеля
router.get("/:propertyId", auth, async (req, res) => {
  const { propertyId } = req.params;

  // (опц.) быстрая валидация UUID, чтобы не долбить БД мусором
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(propertyId);
  if (!isUuid) return res.status(400).json({ error: "BAD_PROPERTY_ID" });

  try {
    const { rows } = await query(
      `
      SELECT p.id, p.name, p.description, p.address, p.city, p.country, p.phone, p.email, p.created_at
      FROM properties AS p
      JOIN user_properties AS up
        ON up.property_id = p.id
      WHERE up.user_id = $1
        AND p.id = $2
      LIMIT 1
      `,
      [req.user.id, propertyId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "NOT_FOUND" });
    }

    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "DB_ERROR", details: e.message });
  }
});

// GET /properties/:propertyId/users получить пользователей имеющих доступ к отелю

router.get('/:propertyId/users', auth, async (req, res) => {
  const { propertyId } = req.params;
  console.log("get users by:", propertyId);
  // быстрая валидация UUID
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(propertyId);
  if (!isUuid) return res.status(400).json({ error: 'BAD_PROPERTY_ID' });

  try {
    // проверяем, что вызывающий сам имеет доступ к этому property
    const check = await query(
      `SELECT 1 FROM user_properties WHERE user_id = $1 AND property_id = $2 LIMIT 1`,
      [req.user.id, propertyId]
    );
    if (!check.rows.length) return res.status(403).json({ error: 'FORBIDDEN' });

    const { rows } = await query(
      `
      SELECT
        u.id,
        u.email,
        u.name,
        u.role,
        u.status,
        COALESCE(
          ARRAY_AGG(DISTINCT ua.ability) FILTER (WHERE ua.ability IS NOT NULL),
          '{}'
        ) AS abilities
      FROM users AS u
      JOIN user_properties AS up
        ON up.user_id = u.id
       AND up.property_id = $1
      LEFT JOIN user_abilities AS ua
        ON ua.user_id = u.id
      GROUP BY u.id, u.email, u.name, u.role, u.status
      ORDER BY u.name NULLS LAST, u.email
      `,
      [propertyId]
    );

    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB_ERROR', details: e.message });
  }
});


// GET /properties/:propertyId/room-classes  получить список типов номеров в отеле
router.get('/:propertyId/room-classes', auth, async (req, res) => {
  const { propertyId } = req.params;

  // быстрая проверка UUID
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(propertyId);
  if (!isUuid) return res.status(400).json({ error: 'BAD_PROPERTY_ID' });

  try {
    // проверим, что запрашивающий пользователь имеет доступ к этому отелю
    const check = await query(
      `SELECT 1 FROM user_properties
        WHERE user_id = $1 AND property_id = $2
        LIMIT 1`,
      [req.user.id, propertyId]
    );
    if (check.rows.length === 0) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }

    // собственно список категорий
    const { rows } = await query(
      `
      SELECT id, name, code, created_at
      FROM room_classes
      WHERE property_id = $1
      ORDER BY name ASC, created_at ASC
      `,
      [propertyId]
    );

    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB_ERROR', details: e.message });
  }
});





/**
 * POST /api/properties
 * Создать отель текущему пользователю
 * body: { name: string, description?: string, address?: object, phone?: string, email?: string, timezone?: string }
 */
router.post("/", auth, async (req, res) => {
  const { name, description, address, phone, email, city, country } = req.body || {};
  if (!name) return res.status(400).json({ error: "NAME_REQUIRED" });

  try {
    await query("BEGIN");
    const { rows: [prop] } = await query(
      `INSERT INTO properties
         (name, description, address, city, country, phone, email)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, description, address, phone, email, created_at`,
      [name, description || null, address || null, city || null, country || null, phone || null, email || null]
    );
    await query(
      `INSERT INTO user_properties (user_id, property_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, property_id) DO NOTHING`,
      [req.user.id, prop.id]
    );
    await query("COMMIT");
    res.status(201).json(prop);
  } catch (e) {
    await query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: "DB_ERROR", details: e.message });
  }
});

module.exports = router;
