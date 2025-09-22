const express = require('express');
const jwt = require('jsonwebtoken');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1h";

function createToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  }

const AbilitiesByRole = {
    admin: [
      'hotel.create',
      'room_type.create',
      'room.create',
      'reservation.create',
      'reservation.update',
      'report.view',
      'checkin',
      'checkout',
      'user.manage',
    ],
    manager: [
      'reservation.create',
      'reservation.update',
      'report.view',
      'checkin',
      'checkout',
    ],
    receptionist: [
      'reservation.create',
      'checkin',
      'checkout',
    ],
    viewer: [
      'report.view',
    ],
};

// Фейковая структура отелей/организаций
const FakeOrgs = [
    { id: 'org-1', name: 'Nemo Group' },
  ];
  
const FakeProperties = [
    { id: 'prop-101', orgId: 'org-1', name: 'Nemo Resort & Spa' },
    { id: 'prop-102', orgId: 'org-1', name: 'Nemo Downtown' },
  ];

// Роут: GET /api/auth/test-login?role=manager&property=prop-101
router.get('/test-login', (req, res) => {
    const role = (req.query.role || 'manager').toLowerCase();
    const forcedProperty = req.query.property || null;
  
    const abilities = AbilitiesByRole[role] || AbilitiesByRole.manager;
  
    // Подбираем property: если задан в запросе — отдадим его, иначе первый из FakeProperties
    const currentProperty = FakeProperties.find(p => p.id === forcedProperty) || FakeProperties[0];
  
    // Скоуп: массив доступных orgIds/propertyIds (имитируем, что юзер имеет доступ к обоим отелям)
    const scopes = {
      orgIds: FakeOrgs.map(o => o.id),
      propertyIds: FakeProperties.map(p => p.id),
    };
  
    // Фейковые данные пользователя
    const user = {
      id: role === 'admin' ? 'u-admin-1' : 'u-manager-1',
      name: role === 'admin' ? 'Admin User' : 'Manager Ivan',
      email: role === 'admin' ? 'admin@example.com' : 'ivan.manager@example.com',
      role, // для удобства
      phone: '+380501234567',
    };
  
    // Формируем payload для JWT и refresh (в проде не клади туда чувствительные данные)
    const tokenPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      abilities,
      scopes,
      currentPropertyId: currentProperty.id,
    };
  
    const token = createToken(tokenPayload, '1h'); // access token 1 час
    const refreshToken = createToken({ sub: user.id }, '7d'); // простой refresh (только для теста)
  
    // Время истечения в ms
    const tokenExpiresAt = Date.now() + 60 * 60 * 1000;
  
    const session = {
      token,
      refreshToken,
      tokenExpiresAt,
      user,
      abilities,
      scopes,
      currentPropertyId: currentProperty.id,
      // дополнительно можно вернуть список properties/orgs для клиентского селектора
      orgs: FakeOrgs,
      properties: FakeProperties,
    };
  
    // Для удобства в dev: позволяем клиенту получить JSON сессии
    return res.json(session);
  });

  module.exports = router;