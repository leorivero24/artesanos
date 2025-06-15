// const mysql = require('mysql2');

// const db = mysql.createConnection({
//   host: 'localhost',
//   user: 'root',         // tu usuario de MySQL
//   password: '',         // tu contraseña de MySQL
//   database: 'artesanos' // nombre de la base de datos
// });

// db.connect((err) => {
//   if (err) {
//     console.error('Error al conectar con la base de datos:', err);
//     return;
//   }
//   console.log('🟢 Conectado a la base de datos artesanos');
// });

// module.exports = db;


const mysql = require('mysql2');

// Crear la conexión usando variables de entorno
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,       // Puerto personalizado desde Railway
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

// Intentar conectar
db.connect((err) => {
  if (err) {
    console.error('❌ Error al conectar con la base de datos:', err.message);
    return;
  }
  console.log('🟢 Conectado a la base de datos MySQL en Railway');
});

module.exports = db;
