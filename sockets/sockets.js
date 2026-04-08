const usuariosConectados = new Map();

function configurarSockets(io) {
  io.on('connection', (socket) => {
    console.log('🔌 Cliente conectado:', socket.id);

    socket.on('join', ({ userId }) => {
      if (userId) {
        socket.join(`user-${userId}`);
        
        usuariosConectados.set(userId, socket.id);
        console.log(`✅ Usuario ${userId} se unió al canal user-${userId}`);
      }
    });

    socket.on('disconnect', () => {
      console.log('❌ Cliente desconectado:', socket.id);
      // Eliminamos el userId si se desconectó
      for (let [uid, sid] of usuariosConectados.entries()) {
        if (sid === socket.id) {
          usuariosConectados.delete(uid);
          break;
        }
      }
    });
  });
}

// Notificar al receptor que recibió una nueva solicitud
function notifyFriendRequest(io, receptorId, data) {
  console.log(`📢 Notificando solicitud de amistad a receptorId: ${receptorId}`);
  io.to(`user-${receptorId}`).emit('nueva-solicitud', data);
}

// Notificar al solicitante que respondieron su solicitud
function notifyRequestResponse(io, solicitanteId, data) {
  console.log(`📢 Notificando respuesta a solicitanteId: ${solicitanteId}`);
  io.to(`user-${solicitanteId}`).emit('respuesta-solicitud', data);
}

function notifyComment(io, receptorId, data) {
  console.log(`📢 Notificando comentario a usuario ${receptorId}`);
  io.to(`user-${receptorId}`).emit('nueva-notificacion', data);
}

module.exports = {
  configurarSockets,
  notifyFriendRequest,
  notifyRequestResponse,
  notifyComment 
};
