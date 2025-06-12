
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const pool = require('../models/db');
const authMiddleware = require('../middlewares/authMiddleware');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'public/uploads'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

router.post('/publicaciones', authMiddleware, upload.single('imagen'), (req, res) => {
  const usuarioId = req.usuario.id;
  const { descripcion } = req.body;
  const imagenUrl = '/uploads/' + req.file.filename;

  const sql = `INSERT INTO publicaciones (usuario_id, imagen_url, descripcion) VALUES (?, ?, ?)`;
  pool.query(sql, [usuarioId, imagenUrl, descripcion], (err, result) => {
    if (err) {
      console.error('Error al insertar publicación:', err);
      return res.status(500).json({ mensaje: 'Error al guardar la publicación.' });
    }
    res.status(201).json({
      mensaje: 'Publicación guardada correctamente.',
      imagen_url: imagenUrl,
      descripcion,
      usuario_id: usuarioId
    });
  });
});



router.get('/api/publicaciones', authMiddleware, async (req, res) => {
  try {
    const con = pool.promise();
    const userId = req.usuario.id;

    const [publicaciones] = await con.query(`
      SELECT p.id, p.imagen_url, p.descripcion, p.fecha_publicacion,
             u.nombre AS usuario_nombre,
             u.apellido AS usuario_apellido
      FROM publicaciones p
      JOIN usuarios u ON p.usuario_id = u.id
      WHERE p.usuario_id = ? 
         OR p.usuario_id IN (
              SELECT seguido_id 
              FROM seguimientos 
              WHERE seguidor_id = ?
         )
      ORDER BY p.fecha_publicacion DESC
    `, [userId, userId]);

    for (let pub of publicaciones) {
      const [comentarios] = await con.query(`
        SELECT c.contenido, c.fecha_creacion, u.nombre AS usuario_nombre, u.apellido AS usuario_apellido
        FROM comentarios c
        JOIN usuarios u ON c.usuario_id = u.id
        WHERE c.imagen_id = ?
        ORDER BY c.fecha_creacion ASC
      `, [pub.id]);

      pub.comentarios = comentarios;
    }

    res.json(publicaciones);
  } catch (error) {
    console.error('💥 ERROR en GET /api/publicaciones:', error);
    res.status(500).json({ mensaje: 'Error al cargar publicaciones.' });
  }
});


router.post('/comentarios/:publicacionId', authMiddleware, express.json(), (req, res) => {
  const usuarioId = req.usuario.id;
  const { contenido } = req.body;
  const imagenId = req.params.publicacionId;

  console.log('📝 Comentario recibido:');
  console.log('ID usuario:', usuarioId);
  console.log('ID imagen:', imagenId);
  console.log('Contenido:', contenido);

  if (!contenido || !imagenId) {
    return res.status(400).json({ mensaje: 'Datos incompletos.' });
  }

  const sql = `INSERT INTO comentarios (imagen_id, usuario_id, contenido) VALUES (?, ?, ?)`;
  pool.query(sql, [imagenId, usuarioId, contenido], (err, result) => {
    if (err) {
      console.error('Error al insertar comentario:', err);
      return res.status(500).json({ mensaje: 'Error al guardar comentario.' });
    }
    res.status(200).json({ mensaje: 'Comentario guardado correctamente.' });
  });
});











// router.post('/comentarios/:publicacionId', authMiddleware, express.json(), (req, res) => {
//   const usuarioId = req.usuario.id;
//   const { contenido } = req.body;
//   const imagenId = req.params.publicacionId;

//   if (!contenido || !imagenId) {
//     return res.status(400).json({ mensaje: 'Datos incompletos.' });
//   }

//   const sql = `INSERT INTO comentarios (imagen_id, usuario_id, contenido) VALUES (?, ?, ?)`;
//   pool.query(sql, [imagenId, usuarioId, contenido], (err, result) => {
//     if (err) {
//       console.error('Error al insertar comentario:', err);
//       return res.status(500).json({ mensaje: 'Error al guardar comentario.' });
//     }
//     res.status(200).json({ mensaje: 'Comentario guardado correctamente.' });
//   });
// });

module.exports = router;
