// middlewares/authMiddleware.js

const jwt = require('jsonwebtoken');
const JWT_SECRET = 'clave_super_segura'; // ¡Usar desde process.env.JWT_SECRET en producción!

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log(`Token ausente o mal formado en: ${req.originalUrl}`);
    return res.status(401).json({ message: 'Token de autenticación no proporcionado.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.usuario = decoded;
    next();
  } catch (error) {
    console.error('Error al verificar token JWT:', error.message);
    return res.status(403).json({ message: 'Token inválido o expirado.' });
  }
};

module.exports = authMiddleware;
