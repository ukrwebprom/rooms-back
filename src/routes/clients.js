const express = require('express');
const { query } = require("../db");
const router = express.Router();


router.get('/', async (req, res) => { 
try {
    const propertyId = String(req.query.propertyId || '').trim();
    const q = String(req.query.query || '').trim();
    const limit = Math.min(Math.max(parseInt(req.query.limit || '10', 10), 1), 50);
    const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);

    if (!propertyId) {
      return res.status(400).json({ error: 'propertyId is required' });
    }

    const hasQ = q && q.length >= 2;

    let where;
    let params;
    
    if (hasQ) {
      where = `
        property_id = $2 AND (
          lower(first_name) LIKE $1 OR
          lower(last_name)  LIKE $1 OR
          email_norm        LIKE $1 OR
          phone_norm        LIKE $1
        )`;
      params = [`%${q.toLowerCase()}%`, propertyId, limit, offset]; // $1..$4
    } else {
      where = `property_id = $1`;
      params = [propertyId, limit, offset]; // $1..$3
    }
    
    const sql = `
      SELECT id, first_name, last_name, email, phone, created_at
      FROM clients
      WHERE ${where}
      ORDER BY last_name NULLS LAST, first_name NULLS LAST, created_at DESC
      LIMIT $${hasQ ? 3 : 2} OFFSET $${hasQ ? 4 : 3};
    `;
    

    const { rows } = await query(sql, params);

    let total;
    if ((req.query.count || '').toString() === 'true') {
      const countSql = `SELECT count(*)::int AS total FROM clients WHERE ${where};`;
      // для count нам не нужны limit/offset → обрежем массив параметров
      const countParams = hasQ ? params.slice(0, 2) : params.slice(0, 1);
      const { rows: crows } = await query(countSql, countParams);
      total = crows[0]?.total || 0;
    }

    res.json({
      items: rows.map(c => ({
        id: c.id,
        firstName: c.first_name,
        lastName: c.last_name,
        email: c.email,
        phone: c.phone,
        createdAt: c.created_at,
        label:
          [c.first_name, c.last_name].filter(Boolean).join(' ') +
          (c.email ? ` · ${c.email}` : '') +
          (c.phone ? ` · ${c.phone}` : '')
      })),
      total
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

module.exports = router;