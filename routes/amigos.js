const express = require('express');
const router = express.Router();
const pool = require('../models/db');
const authMiddleware = require('../middlewares/authMiddleware');

router.get('/api/amigos', authMiddleware, async (req, res) => {
    try {
      const con = pool.promise(); // ✅ conexión con promesa
      const userId = req.usuario.id;
  
      const [amigos] = await con.query(`
        SELECT u.id, u.nombre, u.apellido, u.email
        FROM usuarios u
        WHERE u.id IN (
          SELECT receptor_id FROM solicitudes_amistad
          WHERE solicitante_id = ? AND estado = 'aceptada'
          UNION
          SELECT solicitante_id FROM solicitudes_amistad
          WHERE receptor_id = ? AND estado = 'aceptada'
        )
      `, [userId, userId]);
  
      res.json(amigos);
    } catch (error) {
      console.error('💥 ERROR en GET /api/amigos:', error);
      res.status(500).json({ mensaje: 'Error al cargar amigos.' });
    }
  });
  

module.exports = router;
