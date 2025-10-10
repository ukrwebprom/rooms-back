const express = require("express");
const { query } = require("../db");
const auth = require("../middlewares/authMiddleware");
const {requirePropertyAccess} = require('../middlewares/propertyPermission');

const router = express.Router();

const norm = v => {
  if (v === undefined) return undefined;       // поле не прислали — не трогаем
  if (v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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
router.get("/:propertyId", auth, requirePropertyAccess(), async (req, res) => {
  const propertyId = req.propertyId;

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

router.get('/:propertyId/users', auth, requirePropertyAccess(), async (req, res) => {
  const propertyId = req.propertyId;

  try {
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
router.get('/:propertyId/room-classes', auth, requirePropertyAccess(), async (req, res) => {
  const propertyId = req.propertyId;

  try {
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


// POST /properties/:propertyId/room-classes добавить класс номеров в отель
router.post('/:propertyId/room-classes', auth, requirePropertyAccess(), async (req, res) => {
    const propertyId = req.propertyId;
    const {
      name,
      code,
    } = req.body || {};
    // валидация
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'NAME_REQUIRED' });
    }

    const nm = String(name).trim();
    const cd = code && String(code).trim() ? String(code).trim().toUpperCase() : null;

    try {
      const { rows } = await query(
        `
        INSERT INTO room_classes
          (property_id, name, code)
        VALUES
          ($1, $2, $3)
        RETURNING
          id, property_id, name, code
        `,
        [
          propertyId,
          nm,
          cd
        ]
      );

      return res.status(201).json(rows[0]);
    } catch (e) {
      // ловим нарушение уникальности имени/кода внутри property
      if (e.code === '23505') {
        const payload = { error: 'DUPLICATE' };
        if (e.constraint?.includes('name')) payload.field = 'name';
        if (e.constraint?.includes('code')) payload.field = 'code';
        return res.status(409).json(payload);
      }
      console.error(e);
      return res.status(500).json({ error: 'DB_ERROR', details: e.message });
    }
  }
);


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


/**
 * PATCH /properties/:propertyId
 * Body: { name, country, city, address, email, phone, description }
 * Возвращает обновлённую запись.
 */
router.patch('/:propertyId', auth,  requirePropertyAccess(), async (req, res) => {
    const id = req.propertyId;

    // нормализация входных
    const payload = {
      name:        norm(req.body?.name),
      country:     norm(req.body?.country),
      city:        norm(req.body?.city),
      address:     norm(req.body?.address),
      email:       norm(req.body?.email),
      phone:       norm(req.body?.phone),
      description: norm(req.body?.description),
    };

    // простая валидация: если name прислали — не должен быть пустым/null
    if ('name' in payload && !payload.name) {
      return res.status(400).json({ error: 'NAME_REQUIRED' });
    }

    // строим SET только из присланных полей
    const sets = [];
    const vals = [];
    let i = 1;
    for (const [k, v] of Object.entries(payload)) {
      if (v !== undefined) {
        sets.push(`${k} = $${i++}`);
        vals.push(v);
      }
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: 'NO_FIELDS' });
    }

    vals.push(id); // последний параметр в WHERE

    try {
      const { rows } = await query(
        `
        UPDATE properties
           SET ${sets.join(', ')}
         WHERE id = $${vals.length}
        RETURNING id, name, country, city, address, email, phone, description,
                  created_at
        `,
        vals
      );

      if (rows.length === 0) return res.status(404).json({ error: 'NOT_FOUND' });
      res.json(rows[0]);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'DB_ERROR', details: e.message });
    }
  }
);


// DELETE /properties/:propertyId/room-classes/:classId
router.delete('/:propertyId/room-classes/:classId', auth, requirePropertyAccess(), async (req, res) => {
    const propertyId = req.propertyId;
    const { classId } = req.params;

    try {
      const { rowCount } = await query(
        `
        DELETE FROM room_classes
        WHERE id = $1 AND property_id = $2
        `,
        [classId, propertyId]
      );

      if (rowCount === 0) {
        return res.status(404).json({ error: 'NOT_FOUND' });
      }

      return res.status(200).json({ ok: true, id: classId });
    } catch (e) {
      // FK violation (например, если rooms.room_class_id ссылается и стоит RESTRICT)
      if (e.code === '23503') {
        return res.status(409).json({ error: 'FOREIGN_KEY_CONSTRAINT' });
      }
      console.error(e);
      return res.status(500).json({ error: 'DB_ERROR', details: e.message });
    }
  }
);

// PATCH /properties/:propertyId/room-classes/:classId
router.patch('/:propertyId/room-classes/:classId', auth, requirePropertyAccess(), async (req, res) => {
    const propertyId = req.propertyId;
    const { classId } = req.params;
    let { name, code } = req.body || {};

    // простая валидация
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'NAME_REQUIRED' });
    }

    // нормализация
    name = String(name).trim();
    code = code == null ? null : String(code).trim();
    code = code ? code.toUpperCase() : null; // пустую строку превратим в NULL

    try {
      const { rows } = await query(
        `
        UPDATE public.room_classes
           SET name = $1,
               code = $2
         WHERE id = $3
           AND property_id = $4
        RETURNING id, property_id, name, code, created_at
        `,
        [name, code, classId, propertyId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: 'NOT_FOUND' });
      }

      return res.json(rows[0]);
    } catch (e) {
      // конфликт уникальности (если есть индексы уникальности на name/code внутри property)
      if (e.code === '23505') {
        const payload = { error: 'DUPLICATE' };
        if (e.constraint?.includes('name')) payload.field = 'name';
        if (e.constraint?.includes('code')) payload.field = 'code';
        return res.status(409).json(payload);
      }
      console.error(e);
      return res.status(500).json({ error: 'DB_ERROR', details: e.message });
    }
  }
);

const KIND = new Set(['FLOOR','BUILDING','WING','ZONE','AREA','OTHER']);

// GET /properties/:propertyId/locations
router.get('/:propertyId/locations', auth, requirePropertyAccess(), async (req, res) => {
    const propertyId = req.propertyId;

    try {
      const { rows } = await query(
        `
        SELECT
          id,
          parent_id,
          kind,
          name,
          code,
          created_at
        FROM public.locations
        WHERE property_id = $1
        ORDER BY parent_id NULLS FIRST, name ASC, created_at ASC
        `,
        [propertyId]
      );

      res.json(rows);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'DB_ERROR', details: e.message });
    }
  }
);

// PATCH /properties/:propertyId/locations/:locationId
router.patch('/:propertyId/locations/:locationId', auth, requirePropertyAccess(), async (req, res) => {

    const propertyId = req.propertyId;
    const locationId = req.params.locationId;

    // body: { parent_id, kind, name, code }
    let { parent_id, kind, name, code } = req.body || {};

    // нормализация входных
    // const norm = (v) => (v === undefined ? undefined : (v === null ? null : String(v).trim()));
    parent_id = norm(parent_id);
    kind      = norm(kind);
    name      = norm(name);
    code      = norm(code);

    if (code === '') code = null;        // пустая строка -> NULL
    if (parent_id === '') parent_id = null;

    // базовые валидации
    if (parent_id && !UUID_RX.test(parent_id)) {
      return res.status(400).json({ error: 'BAD_PARENT_ID' });
    }
    if (parent_id && parent_id === locationId) {
      return res.status(400).json({ error: 'PARENT_EQ_SELF' });
    }
    if (kind !== undefined && !KIND.has(kind)) {
      return res.status(400).json({ error: 'BAD_KIND' });
    }
    if (name !== undefined && !name) {
      return res.status(400).json({ error: 'NAME_REQUIRED' });
    }

    try {
      // если передан parent_id — проверим, что он принадлежит тому же отелю
      if (parent_id) {
        const { rows: pchk } = await query(
          `SELECT 1 FROM public.locations
            WHERE id = $1 AND property_id = $2
            LIMIT 1`,
          [parent_id, propertyId]
        );
        if (!pchk.length) {
          return res.status(400).json({ error: 'PARENT_NOT_IN_PROPERTY' });
        }
      }

      // собираем динамический SET только из переданных полей
      const sets = [];
      const vals = [];
      let i = 1;

      if (parent_id !== undefined) { sets.push(`parent_id = $${i++}`); vals.push(parent_id); }
      if (kind      !== undefined) { sets.push(`kind = $${i++}`);      vals.push(kind); }
      if (name      !== undefined) { sets.push(`name = $${i++}`);      vals.push(name); }
      if (code      !== undefined) { sets.push(`code = $${i++}`);      vals.push(code); }

      if (sets.length === 0) {
        return res.status(400).json({ error: 'NO_FIELDS' });
      }

      vals.push(locationId);   // $i
      vals.push(propertyId);   // $i+1

      const { rows } = await query(
        `
        UPDATE public.locations
           SET ${sets.join(', ')}
         WHERE id = $${i}
           AND property_id = $${i + 1}
        RETURNING id, parent_id, kind, name, code, created_at
        `,
        vals
      );

      if (!rows.length) {
        return res.status(404).json({ error: 'NOT_FOUND' });
      }

      res.json(rows[0]);
    } catch (e) {
      // 23505 — нарушение уникальности (у тебя, вероятно, есть индексы:
      // UNIQUE(property_id, parent_id, lower(name)) и UNIQUE(property_id, lower(code)) WHERE code IS NOT NULL)
      if (e.code === '23505') {
        const payload = { error: 'DUPLICATE' };
        if (e.constraint?.includes('name')) payload.field = 'name';
        if (e.constraint?.includes('code')) payload.field = 'code';
        return res.status(409).json(payload);
      }
      // 23503 — нарушение внешнего ключа (например, плохой parent_id)
      if (e.code === '23503') {
        return res.status(409).json({ error: 'FK_CONSTRAINT' });
      }
      console.error(e);
      return res.status(500).json({ error: 'DB_ERROR', details: e.message });
    }
  }
);

module.exports = router;
