
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const pool = require('../models/db');
const authMiddleware = require('../middlewares/authMiddleware');
const { notifyComment } = require('../sockets/sockets');
const fs = require('fs');
const bcrypt = require('bcrypt');


const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'public/uploads'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });


// const { CloudinaryStorage } = require('multer-storage-cloudinary');
// const cloudinary = require('../cloudinary');

// const storage = new CloudinaryStorage({
//   cloudinary,
//   params: {
//     folder: 'publicaciones',
//     allowed_formats: ['jpg', 'png', 'jpeg', 'webp']
//   }
// });


const storageAlbum = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/uploads/albumes');
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const nombre = Date.now() + '-' + Math.round(Math.random() * 1E9) + ext;
    cb(null, nombre);
  }
});

const uploadAlbum = multer({ storage: storageAlbum });




router.post('/albumes', authMiddleware, uploadAlbum.array('imagenes', 20), async (req, res) => {
  console.log('POST /albumes recibida');
  try {
    const { titulo, tags, visibilidad } = req.body;
    console.log('🟨 req.body:', req.body);
    const usuarioId = req.usuario.id;
    const archivos = req.files;

    if (!titulo || !archivos || archivos.length === 0) {
      return res.status(400).json({ mensaje: 'Título e imágenes son requeridos' });
    }

    const con = pool.promise();

    // ✅ Insertar álbum con visibilidad
    const [resultAlbum] = await con.query(
      'INSERT INTO albumes (usuario_id, titulo, visibilidad) VALUES (?, ?, ?)',
      [usuarioId, titulo, visibilidad || 'solo_seguidores']
    );
    const albumId = resultAlbum.insertId;

    // ✅ Insertar imágenes
    const valuesImgs = archivos.map(img => [albumId, '/uploads/albumes/' + img.filename]);
    await con.query('INSERT INTO imagenes (album_id, url) VALUES ?', [valuesImgs]);

    // ✅ Procesar tags
    if (tags && tags.trim() !== '') {
      const etiquetas = tags
        .split(',')
        .map(t => t.trim().toLowerCase())
        .filter(t => t.length > 0);

      for (const tagNombre of etiquetas) {
        const [rows] = await con.query(
          'SELECT id FROM tags WHERE nombre = ? AND tipo = "album"',
          [tagNombre]
        );
        let tagId;
        if (rows.length > 0) {
          tagId = rows[0].id;
        } else {
          const [insertTag] = await con.query(
            'INSERT INTO tags (nombre, tipo) VALUES (?, "album")',
            [tagNombre]
          );
          tagId = insertTag.insertId;
        }
        await con.query('INSERT INTO album_tags (album_id, tag_id) VALUES (?, ?)', [albumId, tagId]);
      }
    }

    // ✅ Visibilidad personalizada (solo si es "compartida")
    if (visibilidad === 'compartida' && req.body.usuariosCompartidos) {
      let usuarios = req.body.usuariosCompartidos;
      if (!Array.isArray(usuarios)) usuarios = [usuarios];
      const valores = usuarios.map(uid => [albumId, uid, new Date()]);
      await con.query(
        'INSERT INTO visibilidad_albumes (album_id, usuario_id, fecha_compartido) VALUES ?',
        [valores]
      );
    }

    return res.json({ mensaje: 'Álbum creado correctamente', albumId });
  } catch (err) {
    console.error('❌ Error al crear álbum:', err);
    return res.status(500).json({ mensaje: 'Error interno al crear álbum' });
  }
});




//TRAER PUBLICACIONES  CON FOTOS DE PERFIL y DE USUARIOS COMPARTIDOS/privados/defecto
router.post('/publicaciones', authMiddleware, upload.single('imagen'), async (req, res) => {
  const usuarioId = req.usuario.id;
  const { descripcion, tags, visibilidad, usuarios_compartidos } = req.body;
  const imagenUrl = '/uploads/' + req.file.filename;

  

  const con = pool.promise();

  try {
    // 1. Insertar publicación
    const [result] = await con.query(`
      INSERT INTO publicaciones (usuario_id, imagen_url, descripcion, visibilidad)
      VALUES (?, ?, ?, ?)
    `, [usuarioId, imagenUrl, descripcion, visibilidad]);

    const publicacionId = result.insertId;

    // 2. Insertar tags si hay
    if (tags) {
      const tagsArray = tags.split(',').map(t => t.trim().toLowerCase()).filter(t => t.length > 0);

      for (const tagNombre of tagsArray) {
        let tagId;
        const [tagInsert] = await con.query(`INSERT IGNORE INTO tags (nombre) VALUES (?)`, [tagNombre]);

        if (tagInsert.insertId) {
          tagId = tagInsert.insertId;
        } else {
          const [existing] = await con.query(`SELECT id FROM tags WHERE nombre = ?`, [tagNombre]);
          if (existing.length) tagId = existing[0].id;
        }

        if (tagId) {
          await con.query(`INSERT IGNORE INTO publicacion_tags (publicacion_id, tag_id) VALUES (?, ?)`, [publicacionId, tagId]);
        }
      }
    }

    // 3. Insertar visibilidad personalizada si aplica
    if (visibilidad === 'compartida' && usuarios_compartidos) {
      const usuariosIds = JSON.parse(usuarios_compartidos);
      for (const userIdCompartido of usuariosIds) {
        await con.query(`
          INSERT INTO visibilidad_publicaciones (publicacion_id, usuario_compartido_id)
          VALUES (?, ?)
        `, [publicacionId, userIdCompartido]);
      }
    }

    res.status(201).json({
      mensaje: '✅ Publicación creada correctamente.',
      publicacionId,
      imagen_url: imagenUrl
    });

    

  } catch (err) {
    console.error('❌ Error al crear publicación:', err);
    res.status(500).json({ mensaje: 'Error al guardar la publicación.' });
  }
});



//OBTENER PUBLICACIONES de todos los usuarios
router.get('/api/publicaciones', authMiddleware, async (req, res) => {
  try {
    const userId = req.usuario.id;
    const con = pool.promise();

    const [publicaciones] = await con.query(`
      SELECT p.id, p.imagen_url, p.descripcion, p.fecha_publicacion,
             p.visibilidad,
             u.id AS usuario_id, u.nombre AS usuario_nombre, u.apellido AS usuario_apellido, u.imagen_perfil,
             GROUP_CONCAT(t.nombre) AS tags
      FROM publicaciones p
      JOIN usuarios u ON p.usuario_id = u.id
      LEFT JOIN publicacion_tags pt ON p.id = pt.publicacion_id
      LEFT JOIN tags t ON pt.tag_id = t.id
      LEFT JOIN visibilidad_publicaciones vp ON p.id = vp.publicacion_id
      WHERE
        p.usuario_id = ?

        OR
        (
          p.usuario_id IN (SELECT seguido_id FROM seguimientos WHERE seguidor_id = ?)
          AND p.visibilidad IN ('publica', 'solo_seguidores')
        )

        OR
        (
          p.usuario_id IN (SELECT seguido_id FROM seguimientos WHERE seguidor_id = ?)
          AND p.visibilidad = 'compartida'
          AND vp.usuario_compartido_id = ?
        )

      GROUP BY p.id
      ORDER BY p.fecha_publicacion DESC
    `, [userId, userId, userId, userId]);

    // Cargar comentarios por publicación, incluyendo avatar del comentarista
    for (const pub of publicaciones) {
      const [comentarios] = await con.query(`
        SELECT c.id,c.contenido, c.fecha_creacion, 
               u.id AS usuario_id,
               u.nombre AS usuario_nombre, 
               u.apellido AS usuario_apellido,
               u.imagen_perfil
        FROM comentarios c
        JOIN usuarios u ON c.usuario_id = u.id
        WHERE c.publicacion_id = ?
        ORDER BY c.fecha_creacion ASC
      `, [pub.id]);

      pub.comentarios = comentarios;
      pub.tags = pub.tags ? pub.tags.split(',') : [];
    }

    res.json(publicaciones);
  } catch (error) {
    console.error('💥 Error en GET /api/publicaciones:', error);
    res.status(500).json({ mensaje: 'Error al obtener publicaciones.' });
  }
});


//Ruta para denunciar comentarios individuales
router.post('/api/denuncias', authMiddleware, async (req, res) => {
  try {
    const denuncianteId = req.usuario.id;
    const { tipo_contenido, id_contenido_denunciado, motivo } = req.body;

    if (!tipo_contenido || !id_contenido_denunciado || !motivo) {
      return res.status(400).json({ mensaje: 'Faltan datos obligatorios para la denuncia.' });
    }

    const con = pool.promise();

    let comentarioContenido = null;
    let publicacionId = null;
    let imagenUrl = null;
    let publicacionDescripcion = null;
    let comentarioId = null;

    if (tipo_contenido === 'comentario_publicacion') {
      // Obtener contenido del comentario denunciado
      const [comentarios] = await con.query(
        'SELECT contenido FROM comentarios WHERE id = ?',
        [id_contenido_denunciado]
      );

      if (comentarios.length === 0) {
        return res.status(404).json({ mensaje: 'Comentario no encontrado.' });
      }

      comentarioContenido = comentarios[0].contenido;
      comentarioId = id_contenido_denunciado;

    } else if (tipo_contenido === 'publicacion') {
      // Obtener descripción de la publicación denunciada
      const [publicaciones] = await con.query(
        'SELECT id, descripcion FROM publicaciones WHERE id = ?',
        [id_contenido_denunciado]
      );

      if (publicaciones.length === 0) {
        return res.status(404).json({ mensaje: 'Publicación no encontrada.' });
      }

      publicacionId = publicaciones[0].id;
      publicacionDescripcion = publicaciones[0].descripcion;

    } else if (tipo_contenido === 'imagen_publicacion') {
      // Obtener imagen_url y publicación asociada
      const [publicaciones] = await con.query(
        'SELECT id, imagen_url FROM publicaciones WHERE id = ?',
        [id_contenido_denunciado]
      );

      if (publicaciones.length === 0) {
        return res.status(404).json({ mensaje: 'Imagen de publicación no encontrada.' });
      }

      publicacionId = publicaciones[0].id;
      imagenUrl = publicaciones[0].imagen_url;
      //   comentarioContenido = imagenUrl;

    } else {
      return res.status(400).json({ mensaje: 'Tipo de contenido no soportado.' });
    }

    // Insertar denuncia
    await con.query(
      `INSERT INTO denuncias 
       (denunciante_id, tipo_contenido, motivo, comentario_id, publicacion_id, comentario_denunciado, imagen_denunciada, publicacion_denunciada)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        denuncianteId,
        tipo_contenido,
        motivo,
        comentarioId,
        publicacionId,
        comentarioContenido,
        imagenUrl,
        publicacionDescripcion
      ]
    );

    res.status(201).json({ mensaje: 'Denuncia registrada correctamente.' });
  } catch (error) {
    console.error('Error en POST /api/denuncias:', error);
    res.status(500).json({ mensaje: 'Error al registrar la denuncia.' });
  }
});

//Ruta para denunciar comentarios de albumes
router.post('/api/denuncias-albumes', authMiddleware, async (req, res) => {
  const usuarioId = req.usuario.id;
  const { tipo_contenido, id_contenido_denunciado, motivo } = req.body;

  if (!tipo_contenido || !id_contenido_denunciado || !motivo) {
    return res.status(400).json({ mensaje: 'Faltan datos obligatorios.' });
  }

  try {
    const con = pool.promise();

    if (tipo_contenido === 'comentario_imagen_album') {
      // Obtener contenido del comentario
      const [rows] = await con.query(
        'SELECT contenido FROM comentarios_album WHERE id = ?',
        [id_contenido_denunciado]
      );

      if (rows.length === 0) {
        return res.status(404).json({ mensaje: 'Comentario no encontrado.' });
      }

      const contenidoComentario = rows[0].contenido;

      // Denuncia de comentario en álbum con contenido
      await con.query(`
        INSERT INTO denuncias_albumes 
          (denunciante_id, tipo_contenido, motivo, comentario_album_id, contenido_comentario, fecha_denuncia, estado) 
        VALUES (?, ?, ?, ?, ?, NOW(), 'pendiente')
      `, [usuarioId, tipo_contenido, motivo, id_contenido_denunciado, contenidoComentario]);
    } else if (tipo_contenido === 'album') {
      // Denuncia de álbum completo
      await con.query(`
        INSERT INTO denuncias_albumes 
          (denunciante_id, tipo_contenido, motivo, album_id, fecha_denuncia, estado) 
        VALUES (?, ?, ?, ?, NOW(), 'pendiente')
      `, [usuarioId, tipo_contenido, motivo, id_contenido_denunciado]);

    } else if (tipo_contenido === 'imagen_album') {
      // Denuncia de imagen dentro de álbum
      await con.query(`
        INSERT INTO denuncias_albumes 
          (denunciante_id, tipo_contenido, motivo, imagen_album_id, fecha_denuncia, estado) 
        VALUES (?, ?, ?, ?, NOW(), 'pendiente')
      `, [usuarioId, tipo_contenido, motivo, id_contenido_denunciado]);

    } else if (tipo_contenido === 'comentario_album') {
      // Obtener contenido del comentario
      const [rows] = await con.query(
        'SELECT contenido FROM comentarios_album WHERE id = ?',
        [id_contenido_denunciado]
      );

      if (rows.length === 0) {
        return res.status(404).json({ mensaje: 'Comentario no encontrado.' });
      }

      const contenidoComentario = rows[0].contenido;

      await con.query(`
    INSERT INTO denuncias_albumes 
      (denunciante_id, tipo_contenido, motivo, comentario_album_id, contenido_comentario, fecha_denuncia, estado) 
    VALUES (?, ?, ?, ?, ?, NOW(), 'pendiente')
  `, [usuarioId, tipo_contenido, motivo, id_contenido_denunciado, contenidoComentario]);
    }


    else {
      return res.status(400).json({ mensaje: 'Tipo de contenido inválido para denuncia.' });
    }

    return res.json({ mensaje: 'Denuncia enviada correctamente.' });

  } catch (error) {
    console.error('Error en /api/denuncias-albumes:', error);
    return res.status(500).json({ mensaje: 'Error interno del servidor.' });
  }
});


// Ruta para crear un comentario 
router.post('/comentarios/:publicacionId', authMiddleware, express.json(), async (req, res) => {
  const usuarioId = req.usuario.id;
  const { contenido } = req.body;
  const publicacionId = req.params.publicacionId;

  if (!contenido || !publicacionId) {
    return res.status(400).json({ mensaje: 'Datos incompletos.' });
  }

  try {
    const con = pool.promise();

    // 🔹 Guardar comentario
    await con.query(
      `INSERT INTO comentarios (publicacion_id, usuario_id, contenido) VALUES (?, ?, ?);`,
      [publicacionId, usuarioId, contenido.trim()]
    );

    // 🔔 Obtener autor y descripción de la publicación
    const [[publicacion]] = await con.query(`
      SELECT p.descripcion, u.id AS autor_id
      FROM publicaciones p
      JOIN usuarios u ON p.usuario_id = u.id
      WHERE p.id = ?
    `, [publicacionId]);

    if (publicacion.autor_id !== usuarioId) {
      // 🔎 Obtener datos del comentarista
      const [[usuario]] = await con.query(`
        SELECT nombre, apellido FROM usuarios WHERE id = ?
      `, [usuarioId]);

      // const enlace = `/ver-publicacion/${publicacionId}`;
      const enlace = `#imagen-${publicacionId}`;
      //    const enlace = `/inicio#imagen-${publicacionId}`;


      const descripcion = publicacion.descripcion?.trim() || 'una publicación';
      // const comentario = contenido.trim();

      // 📢 Mensaje para notificación
      const mensaje = `${usuario.nombre} ${usuario.apellido} comentó en: "${descripcion}"`; // solo esto en negrita
      const comentario = contenido.trim(); // esto va como "detalle"


      // 💾 Insertar notificación con contenido separado
      const [notiResult] = await con.query(`
        INSERT INTO notificaciones (usuario_id, mensaje, contenido, tipo, enlace)
        VALUES (?, ?, ?, 'comentario_publicacion', ?)
      `, [publicacion.autor_id, mensaje, comentario, enlace]);

      // 🔌 Emitir por socket
      const io = req.app.get('io');
      io.to(`user-${publicacion.autor_id}`).emit('nueva-notificacion', {
        id: notiResult.insertId,
        mensaje,
        detalle: comentario,
        tipo: 'comentario_publicacion',
        enlace,
        fecha_creacion: new Date()
      });
    }

    res.status(201).json({ mensaje: 'Comentario guardado correctamente.' });
  } catch (err) {
    console.error('❌ Error al guardar comentario:', err);
    res.status(500).json({ mensaje: 'Error al guardar comentario.' });
  }
});



// Ruta para obtener publicaciones de un usuario
router.get('/api/publicaciones/mias', authMiddleware, async (req, res) => {
  try {
    const userId = req.usuario.id;
    const con = pool.promise();

    const [publicaciones] = await con.query(`
      SELECT p.id, p.usuario_id, p.imagen_url, p.descripcion, p.fecha_publicacion, p.visibilidad,
             u.nombre AS usuario_nombre, u.apellido AS usuario_apellido, u.imagen_perfil,
             GROUP_CONCAT(t.nombre) AS tags
      FROM publicaciones p
      JOIN usuarios u ON p.usuario_id = u.id
      LEFT JOIN publicacion_tags pt ON p.id = pt.publicacion_id
      LEFT JOIN tags t ON pt.tag_id = t.id
      WHERE p.usuario_id = ?
      GROUP BY p.id
      ORDER BY p.fecha_publicacion DESC
    `, [userId]);

    for (let pub of publicaciones) {
      const [comentarios] = await con.query(`
        SELECT c.id,c.contenido, c.fecha_creacion, 
               u.id AS usuario_id,u.nombre AS usuario_nombre, u.apellido AS usuario_apellido, u.imagen_perfil
        FROM comentarios c
        JOIN usuarios u ON c.usuario_id = u.id
        WHERE c.publicacion_id = ?
        ORDER BY c.fecha_creacion ASC
      `, [pub.id]);

      pub.comentarios = comentarios;
      pub.tags = pub.tags ? pub.tags.split(',') : [];
    }

    res.json(publicaciones);
  } catch (error) {
    console.error('Error en /api/publicaciones/mias:', error);
    res.status(500).json({ mensaje: 'Error interno' });
  }
});



//Obterner álbumes de seguidores y del propio usuario
router.get('/mis-albumes', authMiddleware, async (req, res) => {
  const userId = req.usuario.id;

  try {
    const con = pool.promise();

    const [rows] = await con.query(`
      SELECT a.id AS album_id, a.titulo, a.fecha_creacion,
             i.id AS imagen_id, i.url
      FROM albumes a
      LEFT JOIN imagenes i ON a.id = i.album_id
      WHERE a.usuario_id = ?
      ORDER BY a.fecha_creacion DESC
    `, [userId]);

    // Agrupar imágenes por álbum
    const albumesMap = {};

    rows.forEach(row => {
      if (!albumesMap[row.album_id]) {
        albumesMap[row.album_id] = {
          id: row.album_id,
          titulo: row.titulo,
          fecha: row.fecha_creacion,
          imagenes: []
        };
      }
      if (row.imagen_id) {
        albumesMap[row.album_id].imagenes.push({
          id: row.imagen_id,
          url: row.url
        });
      }
    });

    const albumes = Object.values(albumesMap);

    res.render('mis-albumes', { albumes });

  } catch (err) {
    console.error('❌ Error al cargar álbumes:', err);
    res.status(500).send('Error al cargar álbumes');
  }
});





// Obtiene los álbumes de un usuario Andando C imagen perfil y VISIBILIDAD
router.get('/api/mis-albumes', authMiddleware, async (req, res) => {
  const userId = req.usuario.id;

  try {
    const con = pool.promise();

    const [rows] = await con.query(`
      SELECT a.id AS album_id, a.titulo, a.fecha_creacion, a.visibilidad,
             i.id AS imagen_id, i.url,
             u.nombre AS usuario_nombre, u.apellido AS usuario_apellido, u.imagen_perfil
      FROM albumes a
      LEFT JOIN imagenes i ON a.id = i.album_id
      JOIN usuarios u ON a.usuario_id = u.id
      WHERE a.usuario_id = ?
      ORDER BY a.fecha_creacion DESC
    `, [userId]);

    const albumesMap = {};

    for (const row of rows) {
      if (!albumesMap[row.album_id]) {
        albumesMap[row.album_id] = {
          id: row.album_id,
          titulo: row.titulo,
          fecha_creacion: row.fecha_creacion,
          visibilidad: row.visibilidad, // ✅ AÑADIDO
          usuario_nombre: row.usuario_nombre,
          usuario_apellido: row.usuario_apellido,
          imagen_perfil: row.imagen_perfil,
          imagenes: []
        };
      }

      if (row.imagen_id) {
        albumesMap[row.album_id].imagenes.push({
          id: row.imagen_id,
          url: row.url
        });
      }
    }

    const albumes = Object.values(albumesMap);

    for (const album of albumes) {
      const [tagRows] = await con.query(`
        SELECT t.nombre
        FROM album_tags at
        JOIN tags t ON at.tag_id = t.id
        WHERE at.album_id = ?
      `, [album.id]);

      const tagNombres = tagRows.map(t => t.nombre);
      album.tags = tagNombres.join(', ');
    }

    res.json(albumes);
  } catch (err) {
    console.error('❌ Error en /api/mis-albumes:', err);
    res.status(500).json({ mensaje: 'Error al cargar álbumes' });
  }
});


router.get('/api/albumes-compartidos', authMiddleware, async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const con = pool.promise();

    // Consulta con lógica de visibilidad y seguidores
    const [rows] = await con.query(`
      SELECT 
        a.id AS album_id, a.titulo, a.fecha_creacion, a.visibilidad,
         a.usuario_id,
        a.usuario_id AS autor_id, a.amigo_aceptado_id,
        i.id AS imagen_id, i.url,
        u.nombre AS usuario_nombre, u.apellido AS usuario_apellido, u.imagen_perfil,
        va.usuario_id AS compartido_con_usuario
      FROM albumes a
      LEFT JOIN imagenes i ON a.id = i.album_id
      JOIN usuarios u ON a.usuario_id = u.id
      LEFT JOIN visibilidad_albumes va ON va.album_id = a.id AND va.usuario_id = ?
      LEFT JOIN seguimientos s ON a.usuario_id = s.seguido_id AND s.seguidor_id = ?
      WHERE
        (a.visibilidad = 'privada' AND a.usuario_id = ?)
        OR (a.visibilidad = 'compartida' AND (a.usuario_id = ? OR a.amigo_aceptado_id = ? OR va.usuario_id = ?))
        OR (a.visibilidad = 'solo_seguidores' AND (a.usuario_id = ? OR s.seguidor_id IS NOT NULL))
      ORDER BY a.fecha_creacion DESC
    `, [
      usuarioId,    // para visibilidad_albumes
      usuarioId,    // para seguimientos
      usuarioId,    // para privada: dueño
      usuarioId, usuarioId, usuarioId, // para compartida: dueño, amigo_aceptado, visibilidad_albumes
      usuarioId     // para solo_seguidores: dueño o seguidores
    ]);

    // Agrupar álbumes y sus imágenes
    const albumesMap = {};
    for (const row of rows) {
      if (!albumesMap[row.album_id]) {
        albumesMap[row.album_id] = {
          id: row.album_id,
          titulo: row.titulo,
          fecha_creacion: row.fecha_creacion,
          visibilidad: row.visibilidad,
          usuario_id: row.usuario_id,
          usuario_nombre: row.usuario_nombre,
          usuario_apellido: row.usuario_apellido,
          imagen_perfil: row.imagen_perfil,
          imagenes: []
        };
      }
      if (row.imagen_id) {
        albumesMap[row.album_id].imagenes.push({
          id: row.imagen_id,
          url: row.url
        });
      }
    }

    const albumes = Object.values(albumesMap);

    // Cargar tags para cada álbum
    for (const album of albumes) {
      const [tagRows] = await con.query(`
        SELECT t.nombre
        FROM album_tags at
        JOIN tags t ON at.tag_id = t.id
        WHERE at.album_id = ?
      `, [album.id]);

      album.tags = tagRows.map(t => t.nombre).join(', ');
    }

    // Opcional: agregar leyendas de visibilidad (igual que antes)
    for (const album of albumes) {
      if (album.usuario_id === usuarioId) {
        if (album.visibilidad === 'privada') {
          album.leyendaVisibilidad = 'Este álbum es privado y solo visible para ti';
        } else if (album.visibilidad === 'solo_seguidores') {
          album.leyendaVisibilidad = 'Visible para tus seguidores';
        } else if (album.visibilidad === 'compartida') {
          album.leyendaVisibilidad = 'Compartido con usuarios específicos';
        }
      } else {
        if (album.visibilidad === 'solo_seguidores') {
          album.leyendaVisibilidad = 'Visible para seguidores del propietario';
        } else if (album.visibilidad === 'compartida' && album.compartido_con_usuario === usuarioId) {
          album.leyendaVisibilidad = 'Este álbum se comparte contigo';
        } else {
          album.leyendaVisibilidad = 'No tienes acceso a este álbum';
        }
      }
    }

    res.json(albumes);
  } catch (err) {
    console.error('❌ Error en /api/albumes-compartidos:', err);
    res.status(500).json({ mensaje: 'Error al cargar álbumes' });
  }
});




// OBTENER LOS COMENTARIOS DE UN ALBUM //
//-------------------------------------//
///CREAR COMENTARIOS DE UN ALBUM 


// // Obtener comentarios de un álbum
router.get('/api/albumes/:albumId/comentarios', authMiddleware, async (req, res) => {
  const albumId = req.params.albumId;

  try {
    const con = pool.promise();

    const [comentarios] = await con.query(`
    SELECT c.id, c.usuario_id, c.contenido AS comentario, c.fecha_creacion AS fecha,
             u.nombre, u.apellido, u.imagen_perfil
      FROM comentarios_album c
      JOIN usuarios u ON c.usuario_id = u.id
      WHERE c.album_id = ?
        AND c.imagen_id IS NULL  -- Sólo los comentarios generales del álbum
      ORDER BY c.fecha_creacion ASC

    `, [albumId]);

    console.log('Comentarios álbum:', comentarios); // <--- Aquí

    res.json(comentarios);
  } catch (err) {
    console.error('❌ Error al obtener comentarios:', err);
    res.status(500).json({ mensaje: 'Error al cargar comentarios' });
  }
});


// // Crear comentario para un álbum
router.post('/api/albumes/:albumId/comentarios', authMiddleware, express.json(), async (req, res) => {
  const albumId = req.params.albumId;
  const usuarioId = req.usuario.id;
  const { contenido } = req.body;

  if (!contenido || contenido.trim() === '') {
    return res.status(400).json({ mensaje: 'El contenido es obligatorio' });
  }

  try {
    const con = pool.promise();

    await con.query(`
     INSERT INTO comentarios_album (album_id, usuario_id, contenido)
      VALUES (?, ?, ?)
    `, [albumId, usuarioId, contenido.trim()]);

    res.status(201).json({ mensaje: 'Comentario guardado correctamente' });
  } catch (err) {
    console.error('❌ Error al guardar comentario:', err);
    res.status(500).json({ mensaje: 'Error al guardar comentario' });
  }
});


///CREAR COMENTARIOS DE UNA IMAGEN Y OBTENERLOS DE UN ALBUM///


// Obtener comentarios de una imagen
router.get('/api/imagenes/:imagenId/comentarios', authMiddleware, async (req, res) => {
  const imagenId = req.params.imagenId;
  const usuarioId = req.usuario.id;

  try {
    const con = pool.promise();

    // Obtener dueño de la imagen
    const [rows] = await con.query(`
      SELECT a.usuario_id
      FROM imagenes i
      JOIN albumes a ON i.album_id = a.id
      WHERE i.id = ?
    `, [imagenId]);

    if (rows.length === 0) return res.status(404).json({ mensaje: 'Imagen no encontrada' });

    const duenioAlbum = rows[0].usuario_id;

    // Verificar si es el dueño o lo sigue
    if (usuarioId !== duenioAlbum) {
      const [seguimiento] = await con.query(`
        SELECT 1 FROM seguimientos 
        WHERE seguidor_id = ? AND seguido_id = ?
      `, [usuarioId, duenioAlbum]);

      if (seguimiento.length === 0) {
        return res.status(403).json({ mensaje: 'No autorizado para ver comentarios de esta imagen' });
      }
    }

    // Obtener comentarios
    const [comentarios] = await con.query(`
      SELECT 
        c.id,c.usuario_id, c.contenido AS comentario, c.fecha_creacion AS fecha,
        u.nombre, u.apellido, u.imagen_perfil
      FROM comentarios_album c
      JOIN usuarios u ON c.usuario_id = u.id
      WHERE c.imagen_id = ?
      ORDER BY c.fecha_creacion ASC
    `, [imagenId]);

    res.json(comentarios);

  } catch (err) {
    console.error('❌ Error al obtener comentarios imagen:', err);
    res.status(500).json({ mensaje: 'Error al cargar comentarios' });
  }
});


// Crear comentario para una imagen
// router.post('/api/imagenes/:imagenId/comentarios', authMiddleware, express.json(), async (req, res) => {
//   const io = req.app.get('io');  // obtenemos io del app

//   const imagenId = req.params.imagenId;
//   const usuarioId = req.usuario.id;
//   const { contenido } = req.body;

//   if (!contenido || contenido.trim() === '') {
//     return res.status(400).json({ mensaje: 'El contenido es obligatorio' });
//   }

//   try {
//     const con = pool.promise();

//     // Obtener dueño de la imagen y album
//     const [rows] = await con.query(`
//       SELECT a.usuario_id, a.id AS album_id, a.titulo AS album_titulo
//       FROM imagenes i
//       JOIN albumes a ON i.album_id = a.id
//       WHERE i.id = ?
//     `, [imagenId]);

//     if (rows.length === 0) return res.status(404).json({ mensaje: 'Imagen no encontrada' });

//     const duenioAlbum = rows[0].usuario_id;
//     const albumId = rows[0].album_id;
//     const albumTitulo = rows[0].album_titulo;

//     // Verificar permisos
//     if (usuarioId !== duenioAlbum) {
//       const [seguimiento] = await con.query(`
//         SELECT 1 FROM seguimientos 
//         WHERE seguidor_id = ? AND seguido_id = ?
//       `, [usuarioId, duenioAlbum]);

//       if (seguimiento.length === 0) {
//         return res.status(403).json({ mensaje: 'No autorizado para comentar esta imagen' });
//       }
//     }

//     // Insertar comentario
//     await con.query(`
//       INSERT INTO comentarios_album (imagen_id, album_id, usuario_id, contenido)
//       VALUES (?, ?, ?, ?)
//     `, [imagenId, albumId, usuarioId, contenido.trim()]);



//     // Insertar notificación y obtener insertId
//     const [result] = await con.query(`
//       INSERT INTO notificaciones (usuario_id, tipo, mensaje, contenido, enlace)
//       VALUES (?, 'comentario_album', ?, ?, ?)
//     `, [
//       duenioAlbum,
//       `${req.usuario.nombre} ${req.usuario.apellido} comentó una imagen de tu álbum: "${albumTitulo}"`,
//       contenido.trim(),
//       `#img-album-${imagenId}`
//     ]);

//     const idNotificacion = result.insertId;

//     // Emitir notificación en tiempo real con id real
//     if (io) {
//       notifyComment(io, duenioAlbum, {
//         id: idNotificacion,
//         tipo: 'comentario_album',
//         mensaje: `${req.usuario.nombre} ${req.usuario.apellido} comentó una imagen de tu álbum "${albumTitulo}"`,
//         contenido: contenido.trim(),
//         enlace: `#img-album-${imagenId}`,
//         fecha_creacion: new Date().toISOString(),
//       });
//     }

//     res.status(201).json({ mensaje: 'Comentario guardado correctamente' });

//   } catch (err) {
//     console.error('❌ Error al guardar comentario imagen:', err);
//     res.status(500).json({ mensaje: 'Error al guardar comentario' });
//   }
// });


router.post('/api/imagenes/:imagenId/comentarios', authMiddleware, express.json(), async (req, res) => {
  const io = req.app.get('io');

  const imagenId = req.params.imagenId;
  const usuarioId = parseInt(req.usuario.id);
  const { contenido } = req.body;

  if (!contenido || contenido.trim() === '') {
    return res.status(400).json({ mensaje: 'El contenido es obligatorio' });
  }

  try {
    const con = pool.promise();

    const [rows] = await con.query(`
      SELECT a.usuario_id, a.id AS album_id, a.titulo AS album_titulo
      FROM imagenes i
      JOIN albumes a ON i.album_id = a.id
      WHERE i.id = ?
    `, [imagenId]);

    if (rows.length === 0) {
      return res.status(404).json({ mensaje: 'Imagen no encontrada' });
    }

    const duenioAlbum = parseInt(rows[0].usuario_id);
    const albumId = rows[0].album_id;
    const albumTitulo = rows[0].album_titulo;

    console.log('DEBUG:', {
      usuarioId,
      duenioAlbum,
      mismo: usuarioId === duenioAlbum
    });

    // permisos
    if (usuarioId !== duenioAlbum) {
      const [seguimiento] = await con.query(
        'SELECT 1 FROM seguimientos WHERE seguidor_id = ? AND seguido_id = ?',
        [usuarioId, duenioAlbum]
      );

      if (seguimiento.length === 0) {
        return res.status(403).json({ mensaje: 'No autorizado' });
      }
    }

    // guardar comentario
    await con.query(
      'INSERT INTO comentarios_album (imagen_id, album_id, usuario_id, contenido) VALUES (?, ?, ?, ?)',
      [imagenId, albumId, usuarioId, contenido.trim()]
    );

    // 🔴 CLAVE: evitar auto-notificación
    if (usuarioId !== duenioAlbum) {
      const [result] = await con.query(
        'INSERT INTO notificaciones (usuario_id, tipo, mensaje, contenido, enlace) VALUES (?, ?, ?, ?, ?)',
        [
          duenioAlbum,
          'comentario_album',
          req.usuario.nombre + ' ' + req.usuario.apellido + ' comentó una imagen de tu álbum: "' + albumTitulo + '"',
          contenido.trim(),
          '#img-album-' + imagenId
        ]
      );

      const idNotificacion = result.insertId;

      if (io) {
        notifyComment(io, duenioAlbum, {
          id: idNotificacion,
          tipo: 'comentario_album',
          mensaje: req.usuario.nombre + ' ' + req.usuario.apellido + ' comentó una imagen de tu álbum "' + albumTitulo + '"',
          contenido: contenido.trim(),
          enlace: '#img-album-' + imagenId,
          fecha_creacion: new Date()
        });
      }
    }

    res.status(201).json({ mensaje: 'Comentario guardado correctamente' });

  } catch (err) {
    console.error('❌ Error:', err);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});



//Buscar por TAGS EN INICIO
router.get('/api/buscar', authMiddleware, async (req, res) => {
  try {
    const con = pool.promise();
    const userId = req.usuario.id;

    const tag = (req.query.tag || '').trim().toLowerCase();
    const query = (req.query.query || '').trim().toLowerCase();

    if (!tag && !query) {
      return res.status(400).json({ mensaje: 'Falta parámetro de búsqueda.' });
    }

    let publicaciones;

    if (tag) {
      // Buscar por etiqueta con prefijo (LIKE 'tag%')
      console.log('Buscando publicaciones por tag (prefijo):', tag);

      const [results] = await con.query(`
        SELECT DISTINCT p.id, p.imagen_url, p.descripcion, p.fecha_publicacion,
               u.nombre AS usuario_nombre, u.apellido AS usuario_apellido
        FROM publicaciones p
        JOIN usuarios u ON p.usuario_id = u.id
        JOIN publicacion_tags pt ON p.id = pt.publicacion_id
        JOIN tags t ON pt.tag_id = t.id
        WHERE (p.usuario_id = ? OR p.usuario_id IN (
          SELECT seguido_id FROM seguimientos WHERE seguidor_id = ?
        ))
        AND LOWER(t.nombre) LIKE CONCAT(?, '%')
        ORDER BY p.fecha_publicacion DESC
      `, [userId, userId, tag]);

      publicaciones = results;

    } else {
      // Buscar por usuario (nombre/apellido) o descripción (texto libre)
      console.log('Buscando publicaciones con texto:', query);

      const [results] = await con.query(`
        SELECT DISTINCT p.id, p.imagen_url, p.descripcion, p.fecha_publicacion,
               u.nombre AS usuario_nombre, u.apellido AS usuario_apellido
        FROM publicaciones p
        JOIN usuarios u ON p.usuario_id = u.id
        LEFT JOIN publicacion_tags pt ON p.id = pt.publicacion_id
        LEFT JOIN tags t ON pt.tag_id = t.id
        WHERE (p.usuario_id = ? OR p.usuario_id IN (
          SELECT seguido_id FROM seguimientos WHERE seguidor_id = ?
        ))
        AND (
          LOWER(u.nombre) LIKE CONCAT('%', ?, '%')
          OR LOWER(u.apellido) LIKE CONCAT('%', ?, '%')
          OR LOWER(p.descripcion) LIKE CONCAT('%', ?, '%')
        )
        ORDER BY p.fecha_publicacion DESC
      `, [userId, userId, query, query, query]);

      publicaciones = results;
    }

    // Agregar comentarios y tags a cada publicación
    for (let pub of publicaciones) {
      const [comentarios] = await con.query(`
        SELECT c.contenido, c.fecha_creacion, u.nombre AS usuario_nombre, u.apellido AS usuario_apellido
        FROM comentarios c
        JOIN usuarios u ON c.usuario_id = u.id
        WHERE c.publicacion_id = ?
        ORDER BY c.fecha_creacion ASC
      `, [pub.id]);
      pub.comentarios = comentarios;

      const [tags] = await con.query(`
        SELECT t.nombre FROM tags t
        JOIN publicacion_tags pt ON t.id = pt.tag_id
        WHERE pt.publicacion_id = ?
      `, [pub.id]);
      pub.tags = tags.map(t => t.nombre);
    }

    res.json(publicaciones);

  } catch (error) {
    console.error('Error en /api/buscar:', error);
    res.status(500).json({ mensaje: 'Error al realizar la búsqueda.' });
  }
});




//Buscar por TAGS EN DASHBOARD
router.get('/api/buscardashboard', authMiddleware, async (req, res) => {
  try {
    const con = pool.promise();
    const userId = req.usuario.id;
    const tag = (req.query.tag || '').trim().toLowerCase();
    const query = (req.query.query || '').trim().toLowerCase();

    if (!tag && !query) {
      return res.status(400).json({ mensaje: 'Falta parámetro de búsqueda.' });
    }

    let publicaciones;

    if (tag) {
      console.log('🔍 Búsqueda por tag en dashboard:', tag);
      [publicaciones] = await con.query(`
        SELECT DISTINCT p.id, p.imagen_url, p.descripcion, p.fecha_publicacion,
               u.nombre AS usuario_nombre, u.apellido AS usuario_apellido
        FROM publicaciones p
        JOIN usuarios u ON p.usuario_id = u.id
        JOIN publicacion_tags pt ON p.id = pt.publicacion_id
        JOIN tags t ON pt.tag_id = t.id
        WHERE p.usuario_id = ?
          AND LOWER(t.nombre) LIKE CONCAT(?, '%')
        ORDER BY p.fecha_publicacion DESC
      `, [userId, tag]);

    } else {
      console.log('🔍 Búsqueda general en dashboard (sin tags):', query);
      [publicaciones] = await con.query(`
        SELECT DISTINCT p.id, p.imagen_url, p.descripcion, p.fecha_publicacion,
               u.nombre AS usuario_nombre, u.apellido AS usuario_apellido
        FROM publicaciones p
        JOIN usuarios u ON p.usuario_id = u.id
        WHERE p.usuario_id = ?
          AND (
            LOWER(u.nombre) LIKE CONCAT('%', ?, '%')
            OR LOWER(u.apellido) LIKE CONCAT('%', ?, '%')
            OR LOWER(p.descripcion) LIKE CONCAT('%', ?, '%')
            OR LOWER(SUBSTRING_INDEX(p.imagen_url, '/', -1)) LIKE CONCAT('%', ?, '%')
          )
        ORDER BY p.fecha_publicacion DESC
      `, [userId, query, query, query, query]);
    }

    console.log('✅ Publicaciones encontradas:', publicaciones.length);

    for (let pub of publicaciones) {
      const [comentarios] = await con.query(`
        SELECT c.contenido, c.fecha_creacion, u.nombre AS usuario_nombre, u.apellido AS usuario_apellido
        FROM comentarios c
        JOIN usuarios u ON c.usuario_id = u.id
        WHERE c.publicacion_id = ?
        ORDER BY c.fecha_creacion ASC
      `, [pub.id]);
      pub.comentarios = comentarios;

      const [tags] = await con.query(`
        SELECT t.nombre FROM tags t
        JOIN publicacion_tags pt ON t.id = pt.tag_id
        WHERE pt.publicacion_id = ?
      `, [pub.id]);
      pub.tags = tags.map(t => t.nombre);
    }

    res.json(publicaciones);

  } catch (error) {
    console.error('❌ Error en /api/buscardashboard:', error);
    res.status(500).json({ mensaje: 'Error al realizar la búsqueda.' });
  }
});



//BUSCAR POR TAGS EN MI ALBUMES
router.get('/api/buscar-albumes', authMiddleware, async (req, res) => {
  const { titulo, tag } = req.query;
  const usuarioId = req.usuario.id;

  try {
    let query = `
      SELECT a.*, 
        GROUP_CONCAT(t.nombre) as tags,
        u.nombre as usuario_nombre,
        u.apellido as usuario_apellido,
        u.imagen_perfil
      FROM albumes a
      LEFT JOIN album_tags at ON at.album_id = a.id
      LEFT JOIN tags t ON t.id = at.tag_id
      JOIN usuarios u ON u.id = a.usuario_id
      WHERE a.usuario_id = ?
    `;
    const params = [usuarioId];

    if (titulo && tag) {
      query += ` AND (a.titulo LIKE ? OR t.nombre LIKE ?)`;
      params.push(`%${titulo}%`, `%${tag.toLowerCase()}%`);
    } else if (titulo) {
      query += ` AND a.titulo LIKE ?`;
      params.push(`%${titulo}%`);
    } else if (tag) {
      query += ` AND t.nombre LIKE ?`;
      params.push(`%${tag.toLowerCase()}%`);
    }

    query += ' GROUP BY a.id ORDER BY a.fecha_creacion ';

    const [albumes] = await pool.promise().query(query, params);

    for (const album of albumes) {
      const [imagenes] = await pool.promise().query(
        'SELECT id, url FROM imagenes WHERE album_id = ? ORDER BY id',
        [album.id]
      );
      album.imagenes = imagenes;
    }

    res.json(albumes);
  } catch (error) {
    console.error('Error en búsqueda de álbumes:', error);
    res.status(500).json({ mensaje: 'Error en la búsqueda por título o tag' });
  }
});

//BUSCAR POR TAGS EN ALBUMES-COMPARTIDOS
router.get('/api/buscar-albumes-compartidos', authMiddleware, async (req, res) => {
  const { titulo, tag } = req.query;

  try {
    let query = `
      SELECT a.*, 
        GROUP_CONCAT(t.nombre) as tags,
        u.nombre as usuario_nombre,
        u.apellido as usuario_apellido,
        u.imagen_perfil
      FROM albumes a
      LEFT JOIN album_tags at ON at.album_id = a.id
      LEFT JOIN tags t ON t.id = at.tag_id
      JOIN usuarios u ON u.id = a.usuario_id
      WHERE 1
    `;
    const params = [];

    if (titulo && tag) {
      query += ` AND (a.titulo LIKE ? OR t.nombre LIKE ?)`;
      params.push(`%${titulo}%`, `%${tag.toLowerCase()}%`);
    } else if (titulo) {
      query += ` AND a.titulo LIKE ?`;
      params.push(`%${titulo}%`);
    } else if (tag) {
      query += ` AND t.nombre LIKE ?`;
      params.push(`%${tag.toLowerCase()}%`);
    }

    query += ' GROUP BY a.id ORDER BY a.fecha_creacion ASC';

    const [albumes] = await pool.promise().query(query, params);

    for (const album of albumes) {
      const [imagenes] = await pool.promise().query(
        'SELECT id, url FROM imagenes WHERE album_id = ? ORDER BY id',
        [album.id]
      );
      album.imagenes = imagenes;
    }

    res.json(albumes);
  } catch (error) {
    console.error('Error en búsqueda de álbumes:', error);
    res.status(500).json({ mensaje: 'Error en la búsqueda por título o tag' });
  }
});







//TRAER IMAGEN USUARIO EN DASHBOARD
router.get('/api/usuario-datos', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.promise().query(
      'SELECT nombre, apellido, imagen_perfil FROM usuarios WHERE id = ?',
      [req.usuario.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error en el servidor' });
  }
});


router.get('/api/usuarios/seguidores', authMiddleware, async (req, res) => {
  const userId = req.usuario.id;

  try {
    const con = pool.promise();
    const [rows] = await con.query(`
      SELECT u.id, u.nombre, u.apellido
      FROM seguimientos s
      JOIN usuarios u ON s.seguido_id = u.id
      WHERE s.seguidor_id = ?
    `, [userId]);

    res.json(rows);
  } catch (err) {
    console.error('❌ Error al obtener seguidores:', err);
    res.status(500).json({ mensaje: 'Error interno' });
  }
});


//*****RUTAS DE CONFIGURACION DE PERFIL*****//

//ruta para traer el email
router.get('/api/perfil', authMiddleware, async (req, res) => {
  try {
    const con = pool.promise();
    const userId = req.usuario.id;

    const [rows] = await con.query(`
      SELECT email
      FROM usuarios
      WHERE id = ?
    `, [userId]);

    const usuario = rows[0];

    if (!usuario) return res.status(404).json({ mensaje: 'Usuario no encontrado' });

    res.json(usuario); // solo email
  } catch (error) {
    console.error('Error en GET /api/perfil:', error);
    res.status(500).json({ mensaje: 'Error al obtener perfil' });
  }
});




//Ruta para actualizar perfil
router.post('/api/perfil', authMiddleware, upload.single('imagen'), async (req, res) => {
  try {
    const con = pool.promise();
    const userId = req.usuario.id;

    const {
      nombre,
      apellido,
      intereses,
      antecedentes,
    } = req.body;

    const hayNombre = nombre && nombre.trim() !== '';
    const hayApellido = apellido && apellido.trim() !== '';
    // const hayNuevaImagen = !!req.file;
    const hayIntereses = intereses && intereses.trim() !== '';
    const hayAntecedentes = antecedentes && antecedentes.trim() !== '';

    if (
      !hayNombre &&
      !hayApellido &&
      // !hayNuevaImagen &&
      !hayIntereses &&
      !hayAntecedentes
    ) {
      return res.status(400).json({ mensaje: 'No hay datos para actualizar.' });
    }

    // Actualizar usuarios
    const camposUsuario = [];
    const valoresUsuario = [];

    if (hayNombre) {
      camposUsuario.push('nombre = ?');
      valoresUsuario.push(nombre.trim());
    }
    if (hayApellido) {
      camposUsuario.push('apellido = ?');
      valoresUsuario.push(apellido.trim());
    }
    // if (hayNuevaImagen) {
    //   const nuevaImagen = req.file.filename;
    //   camposUsuario.push('imagen_perfil = ?');
    //   valoresUsuario.push(nuevaImagen);

    //   // Eliminar imagen anterior si existe
    //   // const [[usuario]] = await con.query(`SELECT imagen_perfil FROM usuarios WHERE id = ?`, [userId]);
    //   // if (usuario && usuario.imagen_perfil) {
    //   //   const rutaVieja = path.join(__dirname, '..', 'public', 'uploads', usuario.imagen_perfil);
    //   //   if (fs.existsSync(rutaVieja)) fs.unlinkSync(rutaVieja);
    //   // }
    // }

    if (camposUsuario.length > 0) {
      valoresUsuario.push(userId);
      await con.query(`UPDATE usuarios SET ${camposUsuario.join(', ')} WHERE id = ?`, valoresUsuario);
    }

    // Actualizar perfiles
    const [[perfil]] = await con.query(`SELECT intereses, antecedentes FROM perfiles WHERE usuario_id = ?`, [userId]);

    if (hayIntereses || hayAntecedentes) {
      const interesesFinal = hayIntereses ? intereses.trim() : (perfil ? perfil.intereses : null);
      const antecedentesFinal = hayAntecedentes ? antecedentes.trim() : (perfil ? perfil.antecedentes : null);

      if (perfil) {
        await con.query(
          `UPDATE perfiles SET intereses = ?, antecedentes = ? WHERE usuario_id = ?`,
          [interesesFinal, antecedentesFinal, userId]
        );
      } else {
        await con.query(
          `INSERT INTO perfiles (usuario_id, intereses, antecedentes) VALUES (?, ?, ?)`,
          [userId, interesesFinal, antecedentesFinal]
        );
      }
    }

    res.json({ mensaje: 'Perfil actualizado correctamente.' });
  } catch (error) {
    console.error('Error en POST /api/perfil:', error);
    res.status(500).json({ mensaje: 'Error al actualizar perfil' });
  }
});


//Ruta para actualizar contraseña 
router.post('/api/perfil/password', authMiddleware, express.json(), async (req, res) => {
  try {
    const userId = req.usuario.id;
    const { passwordNueva, passwordConfirmar } = req.body;
    const errores = [];

    if (!passwordNueva || !passwordConfirmar) {
      errores.push('Todos los campos son obligatorios');
      return res.status(400).json({ errores });
    }

    if (passwordNueva.length < 6) {
      errores.push('La nueva contraseña debe tener al menos 6 caracteres');
    }

    if (passwordNueva !== passwordConfirmar) {
      errores.push('Las contraseñas no coinciden');
    }

    if (errores.length > 0) {
      return res.status(400).json({ errores });
    }

    const con = pool.promise();

    // Hashear y actualizar sin validar contraseña actual
    const hash = await bcrypt.hash(passwordNueva, 10);
    await con.query('UPDATE usuarios SET contrasena = ? WHERE id = ?', [hash, userId]);

    return res.json({ mensaje: 'Contraseña actualizada correctamente' });
  } catch (error) {
    console.error('Error en POST /api/perfil/password:', error);
    res.status(500).json({ mensaje: 'Error al actualizar contraseña' });
  }
});

//****RUTAS DE PERFIL*****//

router.get('/api/perfil-usuario', authMiddleware, async (req, res) => {
  try {
    const con = pool.promise();
    const userId = req.usuario.id;

    // Info básica y perfil
    const [rows] = await con.query(`
      SELECT u.imagen_perfil, u.nombre, u.apellido, u.email, 
             p.intereses, p.antecedentes
      FROM usuarios u
      LEFT JOIN perfiles p ON p.usuario_id = u.id
      WHERE u.id = ?
    `, [userId]);

    const usuario = rows[0];
    if (!usuario) {
      return res.status(404).json({ mensaje: 'Usuario no encontrado' });
    }

    // Conteo de imágenes en publicaciones y álbumes
    const [[{ total_imagenes }]] = await con.query(`
      SELECT (
        (
          SELECT COUNT(*) 
          FROM imagenes i
          INNER JOIN albumes a ON i.album_id = a.id
          WHERE a.usuario_id = ?
        ) +
        (
          SELECT COUNT(*) 
          FROM publicaciones 
          WHERE usuario_id = ? AND imagen_url IS NOT NULL
        )
      ) AS total_imagenes
    `, [userId, userId]);

    usuario.total_imagenes = total_imagenes;

    // Conteo de comentarios recibidos en publicaciones del usuario
    const [[{ total_comentarios }]] = await con.query(`
      SELECT COUNT(*) AS total_comentarios
      FROM comentarios c
      INNER JOIN publicaciones p ON c.publicacion_id = p.id
      WHERE p.usuario_id = ?
    `, [userId]);

    usuario.total_comentarios = total_comentarios;

    const [[{ total_seguidores }]] = await con.query(`
    
       SELECT COUNT(*) AS total_seguidores
      FROM solicitudes_seguimientos
      WHERE receptor_id = ?
    `, [userId]);

    usuario.total_seguidores = total_seguidores;

    const [[{ total_seguidos }]] = await con.query(`
     
      SELECT COUNT(*) AS total_seguidos
      FROM solicitudes_seguimientos
      WHERE solicitante_id = ?
    `, [userId]);

    usuario.total_seguidos = total_seguidos;

    const [[{ total_publicaciones }]] = await con.query(`
      SELECT COUNT(*) AS total_publicaciones
      FROM publicaciones
      WHERE usuario_id = ?
    `, [userId]);

    usuario.total_publicaciones = total_publicaciones;

    const [[{ total_albumes }]] = await con.query(`
      SELECT COUNT(*) AS total_albumes
      FROM albumes
      WHERE usuario_id = ?
    `, [userId]);

    usuario.total_albumes = total_albumes;

    const [[{ comentarios_hechos }]] = await con.query(`
      SELECT COUNT(*) AS comentarios_hechos
      FROM comentarios
      WHERE usuario_id = ?
    `, [userId]);

    usuario.comentarios_hechos = comentarios_hechos;

    const [[{ tiempo_en_plataforma }]] = await con.query(`
      SELECT TIMESTAMPDIFF(DAY, u.creado_en, NOW()) AS tiempo_en_plataforma
      FROM usuarios u
      WHERE u.id = ?
    `, [userId]);

    usuario.tiempo_en_plataforma = tiempo_en_plataforma;

    const [[{ ultima_conexion }]] = await con.query(`
      SELECT u.ultima_conexion
      FROM usuarios u
      WHERE u.id = ?
    `, [userId]);

    usuario.ultima_conexion = ultima_conexion;


    res.json(usuario);

  } catch (error) {
    console.error('Error en GET /api/perfil-usuario:', error);
    res.status(500).json({ mensaje: 'Error al obtener perfil' });
  }
});







module.exports = router;
