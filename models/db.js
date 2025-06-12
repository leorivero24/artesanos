const mysql = require('mysql2');

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',         // tu usuario de MySQL
  password: '',         // tu contraseña de MySQL
  database: 'artesanos' // nombre de la base de datos
});

db.connect((err) => {
  if (err) {
    console.error('Error al conectar con la base de datos:', err);
    return;
  }
  console.log('🟢 Conectado a la base de datos artesanos');
});

module.exports = db;
