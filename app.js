const express = require('express');
const session = require('express-session');
const path = require('path');
const cookieParser = require('cookie-parser');

const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);
app.set('io', io);
// ✅ Configurar sockets en tiempo real
const { configurarSockets } = require('./sockets/sockets');
configurarSockets(io);
const publicacionesRoutes = require('./routes/publicaciones');

// Este orden es importante
app.use(publicacionesRoutes); 
app.use('/api', publicacionesRoutes);

const amigosRoutes = require('./routes/amigos');
app.use(amigosRoutes);


app.use(express.static('public'));
// Para servir imágenes desde /public/uploads
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));


// Configurar motor de vistas Pug
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

// Middlewares para parsear el cuerpo de las peticiones
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Se mantiene cookieParser por si se usan otras cookies, aunque ya no para el authToken JWT
app.use(cookieParser());

app.use(express.static(path.join(__dirname, 'public')));

// Configurar sesión (la mantenemos por ahora, pero las rutas con JWT no la usarán para autenticación)
app.use(session({
    secret: 'clave_secreta_segura',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 } // 1 hora
}));

// Middleware para hacer disponible el usuario en las vistas (si aún usas sesiones en algunas vistas)
app.use((req, res, next) => {
    res.locals.usuario = req.session.usuario || null;
    next();
});

// Importar rutas de autenticación
const authRoutes = require('./routes/auth');
app.use('/', authRoutes);

const userRoutes = require('./routes/users');
app.use('/', userRoutes); 

// Importar el middleware de autenticación
const authMiddleware = require('./middlewares/authMiddleware');

// ✨ CAMBIO CLAVE AQUÍ: La ruta GET /dashboard YA NO usa authMiddleware directamente.
// La protección inicial se hace ahora desde el JavaScript de dashboard.pug
app.get('/dashboard', (req, res) => {
    // Ya no podemos acceder a req.usuario directamente aquí
    // porque el authMiddleware ya no está protegiendo esta ruta de renderizado.
    // La información del usuario (nombre, email) la leerá el frontend desde localStorage
    // y actualizará la página dinámicamente.

    res.render('dashboard', {
        // Podrías pasar datos genéricos o dejar que el frontend los cargue completamente
        // Para simplificar, ya no pasamos nombreUsuario y emailUsuario desde aquí,
        // el frontend de dashboard.pug los leerá de localStorage.
        // Si necesitas que el servidor renderice datos específicos del usuario,
        // deberías implementar un método para obtenerlos aquí (ej. verificar el token
        // aquí mismo si está presente, o usar una sesión para un SSR híbrido).
        // Por ahora, confiamos en la lógica de dashboard.pug para mostrar los datos.
    });
});

// Ejemplo de ruta API protegida (donde SÍ debes usar authMiddleware)
// Si el dashboard necesita cargar datos del usuario o cualquier otra cosa dinámica,
// haría un fetch a una ruta como esta, enviando el token en el encabezado.
app.get('/api/usuario-data', authMiddleware, (req, res) => {
    // Si llegamos aquí, req.usuario estará disponible gracias a authMiddleware
    res.status(200).json({
        nombre: req.usuario.nombre,
        email: req.usuario.email,
        mensaje: 'Datos de usuario obtenidos de una ruta protegida.'
    });
});


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
  });
  


