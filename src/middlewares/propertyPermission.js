const { query } = require("../db");

async function userHasAccessToProperty(userId, propertyId) {
  if (!userId || !propertyId) return false;
  const { rows } = await query(
    `SELECT 1
       FROM public.user_properties
      WHERE user_id = $1 AND property_id = $2
      LIMIT 1`,
    [userId, propertyId]
  );
  return rows.length > 0;
}

function requirePropertyAccess({ param = 'propertyId' } = {}) {
  return async (req, res, next) => {
    const propertyId =
      req.params?.[param] || req.query?.[param] || req.body?.property_id;

    if (!propertyId) {
      return res.status(400).json({ error: 'PROPERTY_ID_REQUIRED' });
    }

    try {
      const ok = await userHasAccessToProperty(req.user.id, propertyId);
      if (!ok) return res.status(403).json({ error: 'FORBIDDEN' });

      req.propertyId = propertyId;
      next();
    } catch (e) {
      next(e);
    }
  };
}

module.exports = { userHasAccessToProperty, requirePropertyAccess };