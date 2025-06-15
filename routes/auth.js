const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const db = require('../models/db'); // Asume que esta ruta es correcta para tu archivo de DB
const crypto = require('crypto');

const JWT_SECRET = 'clave_super_segura'; // 🔒 RECUERDA: Mueve esto a variables de entorno (.env) en producción
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// Configura el transporte de Nodemailer
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'leo.exerivero@gmail.com', // ✅ TU EMAIL GMAIL AQUÍ
        pass: 'otpqdkydoixxnzhm'     // ✅ TU CONTRASEÑA DE APLICACIÓN DE GMAIL (¡no la contraseña de tu cuenta!)
    }
});

// Mostrar login
router.get('/login', (req, res) => {
    res.render('login');
});

// Mostrar dashboard (NO protegida en el servidor, validación se hace en el cliente)
router.get('/dashboard', (req, res) => {
    res.render('dashboard');
});

// Procesar login (AHORA ENVIANDO TOKEN EN RESPUESTA JSON)
router.post('/login', async (req, res) => {
    const { email, contrasena } = req.body;

    if (!email || !contrasena) {
        return res.status(400).json({ mensaje: 'Todos los campos son obligatorios.' });
    }

    try {
        db.query('SELECT * FROM usuarios WHERE email = ?', [email], async (err, results) => {
            if (err) {
                console.error('Error al consultar la base de datos durante el login:', err);
                return res.status(500).json({ mensaje: 'Error interno del servidor. Inténtalo de nuevo más tarde.' });
            }

            if (results.length === 0) {
                return res.status(401).json({ mensaje: 'Credenciales inválidas.' });
            }

            const user = results[0];

            if (user.activo === 0) {
                return res.status(403).json({ mensaje: 'Tu cuenta no ha sido activada. Por favor, revisa tu correo electrónico.' });
            }

            const passwordMatch = await bcrypt.compare(contrasena, user.contrasena);

            if (passwordMatch) {
                const token = jwt.sign(
                    { id: user.id, email: user.email, nombre: user.nombre, apellido: user.apellido },
                    JWT_SECRET,
                    { expiresIn: '8h' } // El token expira en 1 hora
                );

                // ✨ CAMBIO CLAVE AQUÍ: YA NO SE ESTABLECE LA COOKIE.
                // En su lugar, el token se envía en el cuerpo de la respuesta JSON.

                // Excluir la contraseña del objeto de usuario antes de enviarlo al cliente
                const { contrasena: userPassword, ...userData } = user;

                res.status(200).json({
                    mensaje: 'Inicio de sesión exitoso',
                    token: token, // <-- ✅ ENVIAMOS EL TOKEN AQUÍ
                    usuario: userData // Datos del usuario sin la contraseña
                });

            } else {
                return res.status(401).json({ mensaje: 'Credenciales inválidas.' });
            }
        });
    } catch (error) {
        console.error('Error general en login:', error);
        res.status(500).json({ mensaje: 'Error interno del servidor al procesar el login.' });
    }
});



// Mostrar formulario para solicitar restablecimiento de contraseña
router.get('/olvide-contrasena', (req, res) => {
    res.render('olvide-contrasena');
});

router.post('/solicitar-restablecimiento', (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ mensaje: 'Por favor, introduce tu correo electrónico.' });
    }

    db.query('SELECT * FROM usuarios WHERE email = ?', [email], async (err, results) => {
        if (err) {
            console.error('Error al buscar usuario para restablecimiento:', err);
            return res.status(500).json({ mensaje: 'Error del servidor. Inténtalo de nuevo más tarde.' });
        }

        const user = results[0];

        if (!user) {
            return res.status(200).json({
                mensaje: 'Recibirás un enlace para restablecer tu contraseña. Redirigiendo al inicio de sesión...',
                redireccionar: true
            });
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        const expires = Date.now() + 3600000; // El token expira en 1 hora (3600000 ms)

        db.query(
            'UPDATE usuarios SET token_validacion = ?, token_expiracion = ? WHERE id = ?',
            [resetToken, expires, user.id],
            async (updateErr, updateResult) => {
                if (updateErr) {
                    console.error('Error al guardar token de restablecimiento:', updateErr);
                    return res.status(500).json({ mensaje: 'Error del servidor al procesar la solicitud.' });
                }

                const resetUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/restablecer-contrasena?token=${resetToken}`;

                const mailOptions = {
                    from: 'Artesanos <no-reply@artesanos.com>',
                    to: user.email,
                    subject: 'Restablecer tu contraseña de artesanos.com',
                    html: `
                        <p>Hola ${user.nombre || 'usuario'},</p>
                        <p>Has solicitado restablecer tu contraseña para tu cuenta de artesanos.com.</p>
                        <p>Por favor, haz clic en el siguiente enlace para restablecer tu contraseña:</p>
                        <p><a href="${resetUrl}">${resetUrl}</a></p>
                        <p>Este enlace expirará en 1 hora.</p>
                        <p>Si no solicitaste un restablecimiento de contraseña, por favor ignora este correo.</p>
                        <p>Gracias,</p>
                        <p>El equipo de artesanos.com</p>
                    `
                };

                try {
                    await transporter.sendMail(mailOptions);
                    res.status(200).json({
                        mensaje: 'Recibirás un enlace para restablecer tu contraseña. Redirigiendo al inicio de sesión...',
                        redireccionar: true
                    });
                } catch (mailError) {
                    console.error('Error al enviar correo de restablecimiento:', mailError);
                    res.status(500).json({ mensaje: 'Hubo un problema al procesar tu solicitud. Inténtalo de nuevo más tarde.' });
                }
            }
        );
    });
});

router.post('/restablecer-contrasena', async (req, res) => {
    const { token, nuevaContrasena } = req.body;

    if (!token || !nuevaContrasena) {
        return res.status(400).json({ mensaje: 'Token y nueva contraseña son obligatorios.' });
    }

    db.query(
        'SELECT id, email, token_expiracion FROM usuarios WHERE token_validacion = ?',
        [token],
        async (err, results) => {
            if (err) {
                console.error('Error al buscar usuario por token:', err);
                return res.status(500).json({ mensaje: 'Error del servidor. Inténtalo de nuevo más tarde.' });
            }

            const user = results[0];

            if (!user) {
                return res.status(400).json({ mensaje: 'Token inválido o ya ha sido utilizado.' });
            }

            if (user.token_expiracion < Date.now()) {
                db.query('UPDATE usuarios SET token_validacion = NULL, token_expiracion = NULL WHERE id = ?', [user.id]);
                return res.status(400).json({ mensaje: 'El token ha expirado. Por favor, solicita un nuevo enlace de restablecimiento.' });
            }

            const saltRounds = 10;
            const hashedPassword = await bcrypt.hash(nuevaContrasena, saltRounds);

            db.query(
                'UPDATE usuarios SET contrasena = ?, token_validacion = NULL, token_expiracion = NULL WHERE id = ?',
                [hashedPassword, user.id],
                (updateErr, updateResult) => {
                    if (updateErr) {
                        console.error('Error al actualizar contraseña:', updateErr);
                        return res.status(500).json({ mensaje: 'Error del servidor al restablecer la contraseña.' });
                    }

                    res.status(200).json({ mensaje: 'Contraseña restablecida exitosamente.' });
                }
            );
        }
    );
});

// Mostrar formulario para restablecer contraseña (con el token de la URL)
router.get('/restablecer-contrasena', (req, res) => {
    const { token } = req.query; // Obtiene el token de la URL

    if (!token) {
        return res.status(400).send('Token de restablecimiento no proporcionado.');
    }

    res.render('restablecer-contrasena', { token: token });
});

// Mostrar registro
router.get('/registro', (req, res) => {
    res.render('registro');
});

// Procesar registro
router.post('/registro', async (req, res) => {
    const { nombre, apellido, email, contrasena } = req.body;

    if (!nombre || !apellido || !email || !contrasena) {
        return res.send('Todos los campos son obligatorios.');
    }

    try {
        const hashedPassword = await bcrypt.hash(contrasena, 10);

        db.query('SELECT * FROM usuarios WHERE email = ?', [email], async (err, results) => {
            if (err) return res.send('Error de base de datos.');

            if (results.length > 0) {
                return res.render('registro', {
                    mensaje: 'Este correo ya está registrado.',
                    tipo: 'error',
                    nombre: req.body.nombre,
                    apellido: req.body.apellido,
                    email: req.body.email
                });
            }

            const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: '15m' });

            const insertQuery = `
                INSERT INTO usuarios (nombre, apellido, email, contrasena, activo, token_activacion)
                VALUES (?, ?, ?, ?, 0, ?)
            `;

            db.query(insertQuery, [nombre, apellido, email, hashedPassword, token], async (err) => {
                if (err) {
                    console.error(err);
                    return res.send('Error al registrar.');
                }

                const link = `${BASE_URL}/activar?token=${token}`;

                const mailOptions = {
                    from: 'Artesanos <no-reply@artesanos.com>',
                    to: email,
                    subject: 'Activa tu cuenta',
                    html: `<p>Hola ${nombre},</p>
                               <p>Gracias por registrarte. Activa tu cuenta haciendo clic en el siguiente enlace:</p>
                               <a href="${link}">Activar cuenta</a><br/>
                               <small>Este enlace expirará en 15 minutos.</small>`
                };

                try {
                    await transporter.sendMail(mailOptions);
                    console.log('📧 Correo enviado a', email);

                    res.send(`
                        <html>
                          <head>
                            <meta charset="UTF-8">
                            <title>Registro exitoso</title>
                            <style>
                              body { font-family: sans-serif; text-align: center; padding: 50px;  background: linear-gradient(135deg, #d9cbb6, #b79969); }
                              .mensaje { color: white; font-size: 18px; }
                            </style>
                            <script>
                              setTimeout(() => {
                                window.location.href = "/login";
                              }, 3000);
                            </script>
                          </head>
                          <body>
                            <div class="mensaje">
                              <p>✅ Registro exitoso.</p>
                              <p>📧 Correo enviado a <strong>${email}</strong></p>
                              <p>Redirigiendo en 3 segundos...</p>
                            </div>
                          </body>
                        </html>
                    `);
                } catch (mailError) {
                    console.error('Error al enviar correo de activación:', mailError);
                    res.send('Registro exitoso, pero hubo un problema al enviar el correo de activación. Por favor, contáctanos.');
                }
            });
        });
    } catch (error) {
        console.error(error);
        res.send('Error al procesar tu registro.');
    }
});

// Activación de cuenta
router.get('/activar', (req, res) => {
    const { token } = req.query;

    if (!token) return res.send('Token no proporcionado.');

    try {
        console.log('Token recibido:', token);
        const decoded = jwt.verify(token, JWT_SECRET);
        console.log('Token decodificado:', decoded);

        const email = decoded.email;

        db.query('UPDATE usuarios SET activo = 1 WHERE email = ?', [email], (err, result) => {
            if (err) return res.send('Error al activar la cuenta.');

            if (result.affectedRows === 0) {
                return res.send('La cuenta ya estaba activada o no se encontró.');
            }

            res.send('Cuenta activada correctamente. Ya puedes iniciar sesión.');
        });
    } catch (error) {
        console.error('Error al verificar el token:', error);
        return res.send('Token inválido o expirado.');
    }
});

// Redirección raíz
router.get('/', (req, res) => {
    res.redirect('/login');
});

// Manejar logout (ya no necesita borrar la cookie HTTP-only en el servidor)
router.get('/logout', (req, res) => {
    // Para localStorage, el cliente es el responsable de eliminar el token.
    // Esta ruta simplemente redirige al login.
    // Si tuvieras un sistema de revocación de tokens en el servidor (ej. lista negra),
    // aquí harías la lógica para invalidar el token en el lado del servidor.
    res.redirect('/login');
});



module.exports = router;