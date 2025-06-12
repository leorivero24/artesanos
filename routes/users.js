const express = require('express');
const router = express.Router();
const pool = require('../models/db'); // mysql2 clásico (createConnection)

const authMiddleware = require('../middlewares/authMiddleware');
const { notifyFriendRequest, notifyRequestResponse } = require('../sockets/sockets');


// Buscar usuarios por nombre o apellido (excluyendo al actual)
router.get('/api/users/search', authMiddleware, (req, res) => {
    const query = req.query.q;
    const usuarioActualId = req.usuario.id;

    if (!query || query.trim() === '') {
        return res.status(400).json({ message: 'La búsqueda no puede estar vacía.' });
    }

    const keywords = query.trim().split(/\s+/);
    const whereClause = keywords
        .map(k => `(nombre LIKE ? OR apellido LIKE ?)`)
        .join(' AND ');

    const values = keywords.flatMap(k => [`%${k}%`, `%${k}%`]);
    values.push(usuarioActualId);

    const sql = `SELECT id, nombre, apellido, email FROM usuarios WHERE ${whereClause} AND id != ?`;

    pool.query(sql, values, (err, results) => {
        if (err) {
            console.error('Error en búsqueda de usuarios:', err);
            return res.status(500).json({ message: 'Error al buscar usuarios.' });
        }

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

    const sqlCheck = `
    SELECT * FROM solicitudes_amistad WHERE 
    (solicitante_id = ? AND receptor_id = ?) 
    OR (solicitante_id = ? AND receptor_id = ?)
  `;

    pool.query(sqlCheck, [solicitanteId, receptorId, receptorId, solicitanteId], (err, existing) => {
        if (err) {
            console.error('Error al verificar solicitud existente:', err);
            return res.status(500).json({ message: 'Error al procesar la solicitud.' });
        }

        if (existing.length > 0) {
            return res.status(409).json({ message: 'Ya hay una solicitud o amistad existente.' });
        }

        const sqlInsert = `
      INSERT INTO solicitudes_amistad (solicitante_id, receptor_id, estado)
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





//Aceptar o rechazar solicitud de amistad - NUEVA SEGUIMIENTOS: - NOTIFICACIONES

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
            SELECT solicitante_id, receptor_id, estado FROM solicitudes_amistad
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

            const sqlUpdate = `UPDATE solicitudes_amistad SET estado = ? WHERE id = ?`;

            pool.query(sqlUpdate, [nuevoEstado, solicitudId], (err2) => {
                if (err2) {
                    return pool.rollback(() => {
                        console.error('Error al actualizar solicitud:', err2);
                        res.status(500).json({ message: 'Error interno del servidor.' });
                    });
                }

                if (accion === 'accept') {
                    const insertFollowsSql = `INSERT INTO seguimientos (seguidor_id, seguido_id) VALUES (?, ?), (?, ?)`;
                    pool.query(insertFollowsSql, [
                        solicitud.solicitante_id, solicitud.receptor_id,
                        solicitud.receptor_id, solicitud.solicitante_id
                    ], (err3, followResult) => {
                        if (err3) {
                            return pool.rollback(() => {
                                console.error('Error al insertar seguimientos en la aceptación:', err3);
                                res.status(500).json({ message: 'Error al establecer la amistad.' });
                            });
                        }

                        // Notificación para el solicitante original: ACEPTADA
                        const notificationMessage = `Tu solicitud de amistad con ${req.usuario.nombre} ${req.usuario.apellido} ha sido aceptada.`;
                        const insertNotificationSql = 'INSERT INTO notificaciones (usuario_id, tipo, mensaje) VALUES (?, ?, ?)';
                        pool.query(insertNotificationSql, [solicitud.solicitante_id, 'amistad_aceptada', notificationMessage], (err4, notifResult) => {
                            if (err4) {
                                console.error('Error al insertar notificación de amistad aceptada:', err4);
                            }

                            pool.commit(errCommit => {
                                if (errCommit) {
                                    return pool.rollback(() => {
                                        console.error('Error al confirmar la transacción (aceptar):', errCommit);
                                        res.status(500).json({ message: 'Error interno del servidor al confirmar amistad.' });
                                    });
                                }
                                res.status(200).json({ message: 'Solicitud de amistad aceptada y amistad establecida.' });
                            });
                        });
                    });
                } else { // Si la acción es 'reject' (rechazar)
                    // Notificación para el solicitante original: RECHAZADA
                    const notificationMessage = `Tu solicitud de amistad con ${req.usuario.nombre} ${req.usuario.apellido} ha sido rechazada.`;
                    const insertNotificationSql = 'INSERT INTO notificaciones (usuario_id, tipo, mensaje) VALUES (?, ?, ?)';
                    pool.query(insertNotificationSql, [solicitud.solicitante_id, 'amistad_rechazada', notificationMessage], (err4, notifResult) => {
                        if (err4) {
                            console.error('Error al insertar notificación de amistad rechazada:', err4);
                        }

                        // Notificación en tiempo real (si aplica para rechazos, la que ya tenías)
                        notifyRequestResponse(req.app.get('io'), solicitud.solicitante_id, {
                          responderNombre: req.usuario.nombre,
                          estado: nuevoEstado, // 'rechazada'
                        });

                        pool.commit(errCommit => {
                            if (errCommit) {
                                return pool.rollback(() => {
                                    console.error('Error al confirmar la transacción (rechazar):', errCommit);
                                    res.status(500).json({ message: 'Error interno del servidor al rechazar amistad.' });
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




// Añadir a routes/users.js

router.get('/api/notifications', authMiddleware, (req, res) => {
    const usuarioId = req.usuario.id;

    const sql = `
      SELECT sa.id, u.nombre, u.apellido, u.email
      FROM solicitudes_amistad sa
      JOIN usuarios u ON sa.solicitante_id = u.id
      WHERE sa.receptor_id = ? AND sa.estado = 'pendiente'
    `;

    pool.query(sql, [usuarioId], (err, results) => {
        if (err) {
            console.error('Error al cargar notificaciones:', err);
            return res.status(500).json({ message: 'Error al cargar notificaciones.' });
        }

        res.json(results);
    });
});





router.get('/api/friends', authMiddleware, async (req, res) => {
    const userId = req.usuario.id;

    try {
        const [rows] = await pool.execute(`
        SELECT u.id, u.nombre, u.apellido, u.email
        FROM usuarios u
        JOIN solicitudes_amistad s ON (
          (s.solicitante_id = u.id OR s.receptor_id = u.id)
          AND s.estado = 'aceptada'
        )
        WHERE (s.solicitante_id = ? OR s.receptor_id = ?)
          AND u.id != ?
      `, [userId, userId, userId]);

        res.json(rows);
    } catch (err) {
        console.error('Error al obtener amigos:', err);
        res.status(500).json({ message: 'Error interno al cargar amigos.' });
    }
});





module.exports = router;



