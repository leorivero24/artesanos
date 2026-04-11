const express = require('express');
const router = express.Router();
const pool = require('../models/db'); // mysql2 clásico (createConnection)
const authMiddleware = require('../middlewares/authMiddleware');
const { notifyFriendRequest, notifyRequestResponse } = require('../sockets/sockets');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../public/uploads'));
  },
  filename: function (req, file, cb) {
    // Nombre único: usuarioId + timestamp + extensión original
    const ext = path.extname(file.originalname);
    cb(null, `perfil_${req.usuario.id}_${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // máximo 5MB
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const mimetype = allowedTypes.test(file.mimetype);
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Solo se permiten imágenes jpg, jpeg, png o gif'));
  }
});

// Ruta para subir/actualizar foto de perfil
router.post('/api/usuario/foto-perfil', authMiddleware, upload.single('fotoPerfil'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No se envió ninguna imagen.' });
  }

  try {
    const usuarioId = req.usuario.id;

    // Obtener la imagen anterior
    const [rows] = await pool.promise().query('SELECT imagen_perfil FROM usuarios WHERE id = ?', [usuarioId]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Usuario no encontrado.' });
    }

    const imagenAnterior = rows[0].imagen_perfil;

    // Nuevo nombre del archivo subido
    const nuevoNombre = req.file.filename;

    // Actualizar la base de datos
    const [result] = await pool.promise().query(
      'UPDATE usuarios SET imagen_perfil = ? WHERE id = ?',
      [nuevoNombre, usuarioId]
    );

    // Actualizar sesión
    if (req.session && req.session.usuario) {
      req.session.usuario.imagen_perfil = nuevoNombre;
    }

    // Borrar imagen anterior si existe
    if (imagenAnterior) {
      const rutaAnterior = path.join(__dirname, '../public/uploads', imagenAnterior);
      fs.unlink(rutaAnterior, err => {
        if (err && err.code !== 'ENOENT') {
          console.warn('⚠️ No se pudo eliminar imagen anterior:', err.message);
        }
      });
    }

    // ✅ Respuesta con URL completa usable en el navegador
    return res.status(200).json({
      message: 'Foto de perfil actualizada correctamente.',
      avatar_url: `/uploads/${nuevoNombre}` // 👈 clave para el frontend
    });

  } catch (error) {
    console.error('Error al actualizar foto de perfil:', error);
    return res.status(500).json({ message: 'Error al actualizar foto de perfil.' });
  }
});



// Buscar usuarios por nombre o apellido (excluyendo al actual)
router.get('/api/users/search', authMiddleware, (req, res) => {
  const query = req.query.q;
  const usuarioActualId = req.usuario.id;

  if (!query || query.trim() === '') {
    return res.status(400).json({ message: 'La búsqueda no puede estar vacía.' });
  }

  const keywords = query.trim().split(/\s+/);

  const whereClause = keywords
    .map(k => `(u.nombre LIKE ? OR u.apellido LIKE ?)`)
    .join(' AND ');

  const sql = `
  SELECT 
    u.id, 
    u.nombre, 
    u.apellido, 
    u.email, 
    u.imagen_perfil,

    CASE
      -- 1. ambos se siguen (relación real)
      WHEN s1.id IS NOT NULL AND s2.id IS NOT NULL THEN 'seguimiento_mutuo'

      -- 2. yo envié solicitud (PRIORIDAD ALTA)
      WHEN sol1.estado = 'pendiente' THEN 'siguiendo'

      -- 3. él me envió solicitud
      WHEN sol2.estado = 'pendiente' THEN 'te_sigue'

      -- 4. yo ya lo sigo
      WHEN s1.id IS NOT NULL THEN 'siguiendo'

      -- 5. él ya me sigue
      WHEN s2.id IS NOT NULL THEN 'te_sigue'

      -- 6. nada
      ELSE 'seguir'
    END AS estado

  FROM usuarios u

  LEFT JOIN seguimientos s1 
    ON s1.seguidor_id = ? 
    AND s1.seguido_id = u.id

  LEFT JOIN seguimientos s2 
    ON s2.seguidor_id = u.id 
    AND s2.seguido_id = ?

  LEFT JOIN solicitudes_seguimientos sol1
    ON sol1.solicitante_id = ? 
    AND sol1.receptor_id = u.id

  LEFT JOIN solicitudes_seguimientos sol2
    ON sol2.solicitante_id = u.id 
    AND sol2.receptor_id = ?

  WHERE ${whereClause}
    AND u.id != ?
`;


  const values = [
    usuarioActualId,
    usuarioActualId,
    usuarioActualId,
    usuarioActualId,
    ...keywords.flatMap(k => [`%${k}%`, `%${k}%`]),
    usuarioActualId
  ];

  pool.query(sql, values, (err, results) => {
    if (err) {
      console.error('Error en búsqueda de usuarios:', err);
      return res.status(500).json({ message: 'Error al buscar usuarios.' });
    }

    console.log('Resultados búsqueda:', results);

    res.json(results);
  });
});



// Enviar solicitud de amistad // FUNCIONANDO
router.post('/api/friend-request', authMiddleware, (req, res) => {
  const solicitanteId = req.usuario.id;
  const { receptorId } = req.body;

  if (!receptorId || solicitanteId === receptorId) {
    return res.status(400).json({ message: 'Solicitud inválida.' });
  }

  // 🔁 Ahora solo chequeamos si YA le envió a ese usuario (dirección única)
  const sqlCheck = `
        SELECT * FROM solicitudes_seguimientos 
        WHERE solicitante_id = ? AND receptor_id = ?
    `;

  pool.query(sqlCheck, [solicitanteId, receptorId], (err, existing) => {
    if (err) {
      console.error('Error al verificar solicitud existente:', err);
      return res.status(500).json({ message: 'Error al procesar la solicitud.' });
    }

    if (existing.length > 0) {
      return res.status(409).json({ message: 'Ya enviaste una solicitud a este usuario.' });
    }

    const sqlInsert = `
            INSERT INTO solicitudes_seguimientos (solicitante_id, receptor_id, estado)
            VALUES (?, ?, 'pendiente')
        `;

    pool.query(sqlInsert, [solicitanteId, receptorId], (err2) => {
      if (err2) {
        console.error('Error al insertar solicitud:', err2);
        return res.status(500).json({ message: 'Error al procesar la solicitud.' });
      }

      console.log(`📨 Emitiendo solicitud a receptor ID: ${receptorId}`);
      console.log('➡️ Datos enviados al receptor:', {
        solicitanteId,
        solicitanteNombre: req.usuario.nombre,
        solicitanteApellido: req.usuario.apellido,
      });

      // Notificación en tiempo real
      notifyFriendRequest(req.app.get('io'), receptorId, {
        solicitanteId,
        solicitanteNombre: req.usuario.nombre,
        solicitanteApellido: req.usuario.apellido,
      });

      res.status(201).json({ message: 'Solicitud enviada correctamente.' });
    });
  });
});




//Aceptar o rechazar solicitud de SEGUIMIENTOS - NUEVA SEGUIMIENTOS: - NOTIFICACIONES en localhost TIPO INSTAGRAM
router.post('/api/users/friend-request/:id/:accion', authMiddleware, (req, res) => {
  const receptorId = req.usuario.id;
  const solicitudId = req.params.id;
  const accion = req.params.accion;

  if (!['accept', 'reject'].includes(accion)) {
    return res.status(400).json({ message: 'Acción inválida.' });
  }

  pool.beginTransaction(err => {
    if (err) {
      console.error('Error al iniciar la transacción:', err);
      return res.status(500).json({ message: 'Error interno del servidor.' });
    }

    const sqlGet = `
        SELECT solicitante_id, receptor_id FROM solicitudes_seguimientos
        WHERE id = ? AND receptor_id = ? AND estado = 'pendiente'
      `;

    pool.query(sqlGet, [solicitudId, receptorId], (err, solicitudes) => {
      if (err) {
        return pool.rollback(() => {
          console.error('Error al buscar solicitud:', err);
          res.status(500).json({ message: 'Error interno del servidor.' });
        });
      }

      if (solicitudes.length === 0) {
        return pool.rollback(() => {
          res.status(404).json({ message: 'Solicitud no encontrada o ya respondida.' });
        });
      }

      const solicitud = solicitudes[0];
      const nuevoEstado = accion === 'accept' ? 'aceptada' : 'rechazada';

      const sqlUpdate = `UPDATE solicitudes_seguimientos SET estado = ? WHERE id = ?`;

      pool.query(sqlUpdate, [nuevoEstado, solicitudId], (err2) => {
        if (err2) {
          return pool.rollback(() => {
            console.error('Error al actualizar solicitud:', err2);
            res.status(500).json({ message: 'Error interno del servidor.' });
          });
        }

        if (accion === 'accept') {
          const insertFollowSql = `INSERT INTO seguimientos (seguidor_id, seguido_id) VALUES (?, ?)`;

          pool.query(insertFollowSql, [solicitud.solicitante_id, solicitud.receptor_id], async (err3) => {
            if (err3) {
              return pool.rollback(() => {
                console.error('Error al insertar seguimiento (unidireccional):', err3);
                res.status(500).json({ message: 'Error al establecer el seguimiento.' });
              });
            }

            // ✅ Nuevo: verificar si ya existe seguimiento inverso (amistad mutua)
            try {
              const [mutuo] = await pool.promise().query(`
                  SELECT * FROM seguimientos
                  WHERE seguidor_id = ? AND seguido_id = ?
                `, [solicitud.receptor_id, solicitud.solicitante_id]);

              if (mutuo.length > 0) {
                const mutuoMsg = `Ahora vos y ${req.usuario.nombre} ${req.usuario.apellido} se siguen mutuamente.`;
                await pool.promise().query(`
                    INSERT INTO notificaciones (usuario_id, tipo, mensaje)
                    VALUES (?, 'seguimiento_mutuo', ?)
                  `, [solicitud.solicitante_id, mutuoMsg]);
              }
            } catch (errMutuo) {
              console.error('Error al verificar/inserción de seguimiento mutuo:', errMutuo);
            }

            // ✅ Notificación de aceptación normal
            const mensaje = `Tu solicitud para seguir a ${req.usuario.nombre} ${req.usuario.apellido} fue aceptada.`;
            const insertNotificationSql = 'INSERT INTO notificaciones (usuario_id, tipo, mensaje) VALUES (?, ?, ?)';

            pool.query(insertNotificationSql, [solicitud.solicitante_id, 'seguimiento_aceptado', mensaje], (err4) => {
              if (err4) {
                console.error('Error al insertar notificación de aceptación:', err4);
              }

              notifyRequestResponse(req.app.get('io'), solicitud.solicitante_id, {
                responderNombre: req.usuario.nombre,
                estado: nuevoEstado
              });

              pool.commit(errCommit => {
                if (errCommit) {
                  return pool.rollback(() => {
                    console.error('Error al confirmar transacción:', errCommit);
                    res.status(500).json({ message: 'Error al confirmar la solicitud.' });
                  });
                }

                res.status(200).json({ message: 'Solicitud aceptada. El usuario ahora puede ver tus publicaciones.' });
              });
            });
          });

        } else {
          // ❌ Rechazada
          const mensaje = `Tu solicitud para seguir a ${req.usuario.nombre} ${req.usuario.apellido} fue rechazada.`;
          const insertNotificationSql = 'INSERT INTO notificaciones (usuario_id, tipo, mensaje) VALUES (?, ?, ?)';

          pool.query(insertNotificationSql, [solicitud.solicitante_id, 'seguimiento_rechazado', mensaje], (err4) => {
            if (err4) {
              console.error('Error al insertar notificación de rechazo:', err4);
            }

            notifyRequestResponse(req.app.get('io'), solicitud.solicitante_id, {
              responderNombre: req.usuario.nombre,
              estado: nuevoEstado
            });

            pool.commit(errCommit => {
              if (errCommit) {
                return pool.rollback(() => {
                  console.error('Error al confirmar transacción (rechazo):', errCommit);
                  res.status(500).json({ message: 'Error al confirmar el rechazo.' });
                });
              }

              res.status(200).json({ message: `Solicitud ${nuevoEstado}.` });
            });
          });
        }
      });
    });
  });
});






router.post('/api/seguir', authMiddleware, async (req, res) => {
  const seguidorId = req.usuario.id;
  const seguidoId = Number(req.body.seguidoId); // 👈 ID del usuario al que se quiere seguir

  if (!seguidoId || isNaN(seguidoId) || seguidorId === seguidoId) {
    return res.status(400).json({ message: 'Solicitud inválida.' });
  }

  try {
    // 🔍 Verificar si ya existe una solicitud pendiente (en esa dirección)
    const [existingRequests] = await pool.promise().query(
      `SELECT * FROM solicitudes_seguimientos 
         WHERE solicitante_id = ? AND receptor_id = ? AND estado = 'pendiente'`,
      [seguidorId, seguidoId]
    );

    if (existingRequests.length > 0) {
      return res.status(409).json({ message: 'Ya enviaste una solicitud de seguimiento a este usuario.' });
    }

    // 🔍 Verificar si ya estás siguiéndolo (por si se aceptó antes)
    const [existingFollow] = await pool.promise().query(
      `SELECT * FROM seguimientos 
         WHERE seguidor_id = ? AND seguido_id = ?`,
      [seguidorId, seguidoId]
    );

    if (existingFollow.length > 0) {
      return res.status(409).json({ message: 'Ya estás siguiendo a este usuario.' });
    }

    // ✅ Insertar solicitud pendiente
    await pool.promise().query(
      `INSERT INTO solicitudes_seguimientos (solicitante_id, receptor_id, estado)
         VALUES (?, ?, 'pendiente')`,
      [seguidorId, seguidoId]
    );

    // 🔔 Notificación en tiempo real
    notifyFriendRequest(req.app.get('io'), seguidoId, {
      solicitanteId: seguidorId,
      solicitanteNombre: req.usuario.nombre,
      solicitanteApellido: req.usuario.apellido,
    });

    res.status(201).json({ message: 'Solicitud de seguimiento enviada correctamente.' });
  } catch (err) {
    console.error('❌ Error al procesar solicitud de seguimiento:', err);
    res.status(500).json({ message: 'Error al enviar solicitud de seguimiento.' });
  }
});




//ruta ya lo sigo
router.get('/api/ya-sigo-a/:id', authMiddleware, async (req, res) => {
  const yo = req.usuario.id;
  const otro = Number(req.params.id);

  try {
    const [rows] = await pool.promise().query(
      `SELECT * FROM seguimientos WHERE seguidor_id = ? AND seguido_id = ?`,
      [yo, otro]
    );

    res.json({ yaLoSigo: rows.length > 0 });
  } catch (err) {
    console.error('Error al verificar seguimiento mutuo:', err);
    res.status(500).json({ message: 'Error al verificar seguimiento.' });
  }
});





router.get('/api/seguidores', authMiddleware, async (req, res) => {
  try {
    const con = pool.promise();
    const userId = req.usuario.id;

    const [usuarios] = await con.query(`
      SELECT 
        u.id, 
        u.nombre, 
        u.apellido, 
        u.email, 
        u.imagen_perfil,

        CASE
          -- ya se siguen ambos
          WHEN s1.id IS NOT NULL AND s2.id IS NOT NULL THEN 'seguimiento_mutuo'

          -- me sigue (confirmado)
          WHEN s2.id IS NOT NULL THEN 'te_sigue'

          -- me envió solicitud
          WHEN sol.estado = 'pendiente' THEN 'te_sigue'
        END AS tipo

      FROM usuarios u

      -- seguimientos
      LEFT JOIN seguimientos s1
        ON s1.seguidor_id = ?
        AND s1.seguido_id = u.id

      LEFT JOIN seguimientos s2
        ON s2.seguidor_id = u.id
        AND s2.seguido_id = ?

      -- solicitudes que me enviaron
      LEFT JOIN solicitudes_seguimientos sol
        ON sol.solicitante_id = u.id
        AND sol.receptor_id = ?
        AND sol.estado = 'pendiente'

      WHERE 
        s2.id IS NOT NULL
        OR sol.id IS NOT NULL

      AND u.id != ?
    `, [userId, userId, userId, userId]);

    res.json(usuarios);

  } catch (error) {
    console.error('💥 ERROR en GET /api/seguidores:', error);
    res.status(500).json({ mensaje: 'Error al cargar seguidores.' });
  }
});


router.get('/api/notifications', authMiddleware, (req, res) => {
  const usuarioId = req.usuario.id;

  const sqlPendientes = `
    SELECT 
      sa.id AS solicitud_id,
      sa.solicitante_id,
      u.id AS solicitante_id,
      u.nombre,
      u.apellido,
      u.email,
      'solicitud_pendiente' AS tipo
    FROM solicitudes_seguimientos sa
    JOIN usuarios u ON sa.solicitante_id = u.id
    WHERE sa.receptor_id = ? AND sa.estado = 'pendiente'
  `;

  const sqlHistorial = `
    SELECT 
      id AS notificacion_id, 
      tipo, 
      mensaje, 
      contenido AS detalle,  -- para mostrar
      contenido,              -- para scroll y consistencia
      enlace, 
      fecha_creacion
    FROM notificaciones
    WHERE usuario_id = ? AND leida = FALSE
    ORDER BY fecha_creacion DESC
  `;

  pool.query(sqlPendientes, [usuarioId], (err1, pendientes) => {
    if (err1) {
      console.error('❌ Error al obtener solicitudes pendientes:', err1);
      return res.status(500).json({ message: 'Error al cargar solicitudes.' });
    }

    pool.query(sqlHistorial, [usuarioId], (err2, historial) => {
      if (err2) {
        console.error('❌ Error al obtener historial de notificaciones:', err2);
        return res.status(500).json({ message: 'Error al cargar notificaciones.' });
      }

      const notificaciones = [...pendientes, ...historial];
      res.json(notificaciones);
    });
  });
});



router.get('/api/friends', authMiddleware, async (req, res) => {
  const userId = req.usuario.id;

  try {
    const [rows] = await pool.execute(`
        SELECT u.id, u.nombre, u.apellido, u.email
        FROM usuarios u
        WHERE u.id IN (
          SELECT s1.seguido_id
          FROM seguimientos s1
          JOIN seguimientos s2 ON s1.seguido_id = s2.seguidor_id
          WHERE s1.seguidor_id = ? AND s2.seguido_id = ?
        )
      `, [userId, userId]);

    res.json(rows);
  } catch (err) {
    console.error('❌ Error al obtener amigos (seguimiento mutuo):', err);
    res.status(500).json({ message: 'Error al obtener amigos.' });
  }
});


router.patch('/api/notifications/:id/leida', authMiddleware, (req, res) => {

  const notificacionId = req.params.id;
  const usuarioId = req.usuario.id;

  const sql = `UPDATE notificaciones SET leida = TRUE WHERE id = ? AND usuario_id = ?`;

  pool.query(sql, [notificacionId, usuarioId], (err, result) => {
    if (err) {
      console.error('❌ Error al marcar notificación como leída:', err);
      return res.status(500).json({ message: 'Error al actualizar notificación.' });
    }

    if (result.affectedRows === 0) {
      console.warn(`⚠️ No se encontró la notificación id=${notificacionId} para el usuario ${usuarioId}`);
      return res.status(404).json({ message: 'Notificación no encontrada o no pertenece al usuario.' });
    }

    res.status(200).json({ message: 'Notificación marcada como leída.' });
  });
});







//ruta conteo seguidores
router.get('/api/seguidores/count', authMiddleware, (req, res) => {
  const userId = req.usuario.id;

  const sql = `
      SELECT COUNT(*) AS total
      FROM solicitudes_seguimientos
      WHERE receptor_id = ?
    `;

  pool.query(sql, [userId], (err, results) => {
    if (err) {
      console.error('❌ Error al obtener cantidad de seguidores:', err);
      return res.status(500).json({ error: 'Error al obtener seguidores.' });
    }

    const total = results[0].total;
    res.json({ total });
  });
});


//ruta conteo publicaciones
router.get('/api/publicaciones/count', authMiddleware, (req, res) => {
  const userId = req.usuario.id;

  const sql = `
    SELECT COUNT(*) AS total
    FROM publicaciones
    WHERE usuario_id = ?
    `;

  pool.query(sql, [userId], (err, results) => {
    if (err) {
      console.error('❌ Error al obtener cantidad de publicaciones:', err);
      return res.status(500).json({ error: 'Error al obtener publicaciones.' });
    }

    const total = results[0].total;
    res.json({ total });
  });
});

//ruta conteo seguidos
router.get('/api/seguidos/count', authMiddleware, (req, res) => {
  const userId = req.usuario.id;

  const sql = `
      SELECT COUNT(*) AS total
      FROM solicitudes_seguimientos
      WHERE solicitante_id = ?
    `;

  pool.query(sql, [userId], (err, results) => {
    if (err) {
      console.error('❌ Error al obtener cantidad de seguidos:', err);
      return res.status(500).json({ error: 'Error al obtener seguidos.' });
    }

    const total = results[0].total;
    res.json({ total });
  });
});

//ruta conteo albumes
router.get('/api/albumes/count', authMiddleware, (req, res) => {
  const userId = req.usuario.id;

  const sql = `
      SELECT COUNT(*) AS total
      FROM albumes
      WHERE usuario_id = ?
    `;

  pool.query(sql, [userId], (err, results) => {
    if (err) {
      console.error('❌ Error al obtener cantidad de albumes:', err);
      return res.status(500).json({ error: 'Error al obtener albumes.' });
    }

    const total = results[0].total;
    res.json({ total });
  });
})








module.exports = router;



