




const express = require('express');
const session = require('express-session');
const path = require('path');
const cookieParser = require('cookie-parser');

// Importar el middleware de autenticación
const authMiddleware = require('./middlewares/authMiddleware');

const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);
app.set('io', io);
// ✅ Configurar sockets en tiempo real
const { configurarSockets } = require('./sockets/sockets');
configurarSockets(io);
const publicacionesRoutes = require('./routes/publicaciones');



// Middlewares para parsear el cuerpo de las peticiones
app.use(express.urlencoded({ extended: true }));
app.use(express.json());



app.get('/mis-albumes', (req, res) => {
    res.render('mis-albumes'); // deja que JS verifique token
  });

  // Mostrar la vista de álbumes compartidos
app.get('/albumes-compartidos', (req, res) => {
    res.render('albumes-compartidos');
  });
  
  app.get('/configuracion-perfil', (req, res) => {
    res.render('configuracion-perfil', {
        
    });
});
  
app.get('/perfil', (req, res) => {
    res.render('perfil');
  });   
 
  

// Este orden es importante
// app.use(publicacionesRoutes); 
// app.use('/api', publicacionesRoutes);

// const albumesRoutes = require('./routes/publicaciones');
app.use('/', publicacionesRoutes); 



// Para servir imágenes desde /public/uploads
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));


// Configurar motor de vistas Pug
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));



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



// ✨ CAMBIO CLAVE AQUÍ: La ruta GET /dashboard YA NO usa authMiddleware directamente.
// La protección inicial se hace ahora desde el JavaScript de dashboard.pug
app.get('/dashboard',  (req, res) => {
    res.render('dashboard', {  
    });
});

app.get('/inicio', (req, res) => {
    res.render('inicio', {
        // Si querés pasar datos del usuario en la vista, podés incluir:
        usuario: req.session.usuario || null
    });
});




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


  


