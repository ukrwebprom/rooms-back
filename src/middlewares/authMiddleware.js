const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "NO_TOKEN" });

  const token = authHeader.split(" ")[1]; // "Bearer <токен>"
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // теперь у нас есть id и email из токена
    next();
  } catch (e) {
    return res.status(401).json({ error: "INVALID_TOKEN" });
  }
}

module.exports = authMiddleware;
