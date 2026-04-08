async function logout() {
  localStorage.removeItem('authToken');
  localStorage.removeItem('currentUser');
  console.log('Sesión cerrada y datos limpiados.');
  await fetch('/logout', { method: 'POST' }).catch(() => { });
  window.location.href = '/login';
}






async function marcarNotificacionComoLeida(id, enlace = '') {
  const authToken = localStorage.getItem('authToken');

  try {
    const res = await fetch(`/api/notifications/${id}/leida`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    });

    if (res.ok) {
      // 🔻 Remover visualmente
      const li = document.querySelector(`[data-notificacion-id="${id}"]`);
      if (li) {
        li.style.transition = 'opacity 0.5s';
        li.style.opacity = 0;
        setTimeout(() => li.remove(), 500);
      }

      // 🔄 Actualizar contador
      const count = document.getElementById('notificationCount');
      if (count) {
        const actual = parseInt(count.textContent);
        if (!isNaN(actual) && actual > 1) {
          count.textContent = actual - 1;
        } else {
          count.style.display = 'none';
        }
      }

      // 🎯 Scroll dinámico si es una ancla interna (imagen o imagen de álbum)
      if (enlace && (enlace.startsWith('#imagen-') || enlace.startsWith('#img-album-'))) {
        setTimeout(() => {
          const el = document.querySelector(enlace);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('border', 'border-3', 'border-warning');
            setTimeout(() => el.classList.remove('border', 'border-3', 'border-warning'), 3000);
          }
        }, 300);
      }

    }
  } catch (err) {
    console.error('❌ Error al marcar notificación como leída:', err);
  }
}





async function loadNotifications(nuevaNotificacion = null) {
  const authToken = localStorage.getItem('authToken');
  const notificationCount = document.getElementById('notificationCount');
  const notificationList = document.getElementById('notificationList');

  function crearElementoNotificacion(noti) {
    const li = document.createElement('li');
    li.className = 'dropdown-item text-start';

    if (noti.tipo === 'solicitud_pendiente') {
      li.dataset.solicitudId = noti.solicitud_id;
      li.dataset.solicitanteId = noti.solicitante_id;

      li.innerHTML = `
        <div><strong>${noti.nombre} ${noti.apellido} ha solicitado seguirte</strong></div>
        <div class="mt-1 d-flex gap-1">
          <button class="btn btn-sm btn-success" onclick="responderSolicitud(${noti.solicitud_id}, 'accept', ${noti.solicitante_id})">Confirmar</button>
          <button class="btn btn-sm btn-danger" onclick="responderSolicitud(${noti.solicitud_id}, 'reject')">Eliminar</button>
        </div>
      `;
    } else if (noti.tipo === 'seguimiento_aceptado') {
      const id = noti.notificacion_id ?? noti.id;
      li.dataset.notificacionId = id;

      li.innerHTML = `
        <div role="button" onclick="marcarNotificacionComoLeida(${id})" style="cursor: pointer;">
          <div><i class="bi bi-person-check"></i> <strong>${noti.mensaje}</strong></div>
          <div><small class="text-muted">${new Date(noti.fecha_creacion).toLocaleString()}</small></div>
        </div>
      `;
    } else if (noti.tipo === 'seguimiento_mutuo') {
      const id = noti.notificacion_id ?? noti.id;
      li.dataset.notificacionId = id;

      li.innerHTML = `
        <div role="button" onclick="marcarNotificacionComoLeida(${id})" style="cursor: pointer;">
          <div><i class="bi bi-people-fill text-primary"></i> <strong>${noti.mensaje}</strong></div>
          <div><small class="text-muted">${new Date(noti.fecha_creacion).toLocaleString()}</small></div>
        </div>
      `;
    } else if (noti.tipo === 'seguimiento_rechazado') {
      const id = noti.notificacion_id ?? noti.id;
      li.dataset.notificacionId = id;

      li.innerHTML = `
        <div role="button" onclick="marcarNotificacionComoLeida(${id})" style="cursor: pointer;">
          <div><i class="bi bi-person-x"></i> <strong>${noti.mensaje}</strong></div>
          <div><small class="text-muted">${new Date(noti.fecha_creacion).toLocaleString()}</small></div>
        </div>
      `;
    } else if (noti.tipo === 'comentario_album') {
      const id = noti.notificacion_id ?? noti.id;
      li.dataset.notificacionId = id;

      li.innerHTML = `
        <div role="button" onclick="marcarNotificacionComoLeida(${id}, '${noti.enlace ?? ''}')" style="cursor: pointer;">
         <div><i class="bi bi-chat-text"></i> <strong>${noti.mensaje}</strong><strong>:</strong>${noti.contenido ? `<span style="font-weight: normal;">"${noti.contenido}"</span>` : ''} <i class="bi bi-arrow-return-right"></i> 🔗 Ver Imagen</div>
          <div><small class="text-muted">${new Date(noti.fecha_creacion).toLocaleString()}</small></div>
        </div>
      `;
    } else {
      const id = noti.notificacion_id ?? noti.id;
      li.dataset.notificacionId = id;

      li.innerHTML = `
         <div role="button" onclick="marcarNotificacionComoLeida(${id}, '${noti.enlace ?? ''}')" style="cursor: pointer; ">
          <div><i class="bi bi-chat-text"></i> <strong>${noti.mensaje}</strong><strong>:</strong>${noti.detalle ? `<span style="font-weight: normal;">"${noti.detalle}"</span>` : ''} <i class="bi bi-arrow-return-right"></i> 🔗 Ver Imagen</div>
          <div><small class="text-muted">${new Date(noti.fecha_creacion).toLocaleString()}</small></div>
        </div>
      `;
    }

    return li;
  }

  if (nuevaNotificacion) {
    const id = nuevaNotificacion.id ?? nuevaNotificacion.notificacion_id;

    // 🚫 Evitar duplicados
    const yaExiste = document.querySelector(`li[data-notificacion-id="${id}"]`);
    if (yaExiste) return;

    // 🧹 Eliminar mensaje "No hay notificaciones" si existe
    const mensajeVacio = notificationList.querySelector('li.text-muted');
    if (mensajeVacio) mensajeVacio.remove();

    const li = crearElementoNotificacion(nuevaNotificacion);
    notificationList.prepend(li);

    // 🔢 Actualizar contador
    if (notificationCount.style.display === 'none') {
      notificationCount.style.display = 'inline-block';
      notificationCount.textContent = '1';
    } else {
      notificationCount.textContent = (parseInt(notificationCount.textContent) || 0) + 1;
    }

    return;
  }

  // 🗂 Cargar todas las notificaciones desde la API
  try {
    const res = await fetch('/api/notifications', {
      headers: { Authorization: `Bearer ${authToken}` }
    });

    const data = await res.json();

    if (!Array.isArray(data) || data.length === 0) {
      notificationCount.style.display = 'none';
      notificationList.innerHTML = '<li class="text-center text-muted">No hay notificaciones</li>';
      return;
    }

    notificationCount.textContent = data.length;
    notificationCount.style.display = 'inline-block';
    notificationList.innerHTML = '';

    data.forEach(noti => {
      const li = crearElementoNotificacion(noti);
      notificationList.appendChild(li);
    });
  } catch (err) {
    console.error('❌ Error al cargar notificaciones:', err);
  }
}




async function sendFriendRequest(id, btn) {
  btn.disabled = true;
  btn.textContent = 'Enviando...';
  try {
    const res = await fetch('/api/friend-request', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('authToken')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ receptorId: id })
    });
    const data = await res.json();
    if (res.ok) {
      btn.textContent = 'Seguimiento Enviado';
      btn.classList.replace('btn-primary', 'btn-success');

    } else {
      alert(data.message || 'No se pudo enviar.');
      btn.textContent = 'Enviar Solicitud';
      btn.disabled = false;
    }
  } catch (err) {
    alert('Error de red.');
    btn.textContent = 'Enviar Solicitud';
    btn.disabled = false;
  }
}



window.responderSolicitud = async (solicitudId, accion, solicitanteId) => {
  try {
    const res = await fetch(`/api/users/friend-request/${solicitudId}/${accion}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('authToken')}`
      }
    });

    const data = await res.json();
    console.log(data.message);

    const li = document.querySelector(`[data-solicitud-id="${solicitudId}"]`);

    if (accion === 'accept' && li) {
      // Borramos botones Confirmar / Eliminar
      const botonesDiv = li.querySelector('.mt-1');
      if (botonesDiv) botonesDiv.remove();

      // 🔍 Verificar si ya lo sigo (para saber si hay amistad mutua)
      const yaLoSigoRes = await fetch(`/api/ya-sigo-a/${solicitanteId}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('authToken')}`
        }
      });

      const yaLoSigoData = await yaLoSigoRes.json();

      if (yaLoSigoData.yaLoSigo) {
        // 🎉 Ambos se siguen mutuamente
        const msg = document.createElement('div');
        msg.className = 'text-success mt-2 small';
        msg.innerHTML = `
       <div>
       ✔️ Ahora se siguen mutuamente.
       </div>
      `;
        li.appendChild(msg);
      } else {
        // ✅ Mostrar botón "Seguir también"
        const seguirBtn = document.createElement('button');
        seguirBtn.className = 'btn btn-sm btn-outline-success seguir-tambien-btn mt-2';
        seguirBtn.textContent = 'Seguir también';

        seguirBtn.onclick = async () => {
          try {
            const response = await fetch('/api/friend-request', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${localStorage.getItem('authToken')}`
              },
              body: JSON.stringify({ receptorId: solicitanteId })
            });

            const result = await response.json();

            if (response.ok) {
              const successMsg = document.createElement('div');
              successMsg.className = 'text-success mt-1 small';
              successMsg.innerHTML = `<strong>${result.message}</strong>`;
              li.appendChild(successMsg);

              seguirBtn.remove(); // Ocultar botón
            } else if (response.status === 409) {
              alert(result.message || 'Ya existe una solicitud entre ustedes.');
              seguirBtn.remove();
            } else {
              alert(result.message || 'No se pudo enviar la solicitud.');
            }
          } catch (err) {
            console.error('❌ Error al seguir también:', err);
            alert('Error al procesar la solicitud.');
          }
        };

        li.appendChild(seguirBtn);
      }
    }

    if (accion === 'reject') {
      loadNotifications(); // Refrescar la campanita
    }

    actualizarListaAmigos(); // Siempre refrescar lista de amigos


  } catch (err) {
    console.error('Error al responder solicitud:', err);
  }
};



async function seguirUsuario(userId) {
  try {
    const res = await fetch('/api/seguir', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('authToken')}`
      },
      body: JSON.stringify({ seguidoId: userId })
    });

    const data = await res.json();
    if (res.ok) {
      console.log(`✅ Ahora estás siguiendo a ${userId}`);
      loadNotifications();
      actualizarListaAmigos();
    } else {
      alert(data.message || 'No se pudo seguir al usuario.');
    }
  } catch (err) {
    console.error('Error al seguir usuario:', err);
  }
}



document.addEventListener('DOMContentLoaded', () => {


  console.log("✅ script.js se está ejecutando");
  // alert("script.js cargado ✅");

  const authToken = localStorage.getItem('authToken');
  const currentUser = localStorage.getItem('currentUser');
  const userNameSpan = document.getElementById('userName');
  const welcomeHeading = document.getElementById('welcomeHeading');

  if (!authToken) return window.location.href = '/login';


  if (currentUser) {
    try {
      const user = JSON.parse(currentUser);
      if (userNameSpan) userNameSpan.textContent = `${user.nombre} ${user.apellido}`;
      if (welcomeHeading) welcomeHeading.textContent = `¡Bienvenido ${user.nombre} ${user.apellido}!`;

      const avatar = document.getElementById('userAvatar');
    if (avatar) {
      avatar.src = user.imagen_perfil
        ? `/uploads/${user.imagen_perfil}`
        : '/uploads/default-avatar.png';
    }

      // ✅ Conexión única a socket.io
      const socket = io();
      console.log("🔌 Conectando socket...");
      socket.emit('join', { userId: user.id });

      socket.on('connect', () => {
        console.log('✅ Socket conectado con ID:', socket.id);
      });

      // 🔔 Escuchar solicitud entrante
      socket.on('nueva-solicitud', (data) => {
        console.log('📬 Nueva solicitud recibida:', data);
        loadNotifications(); // actualiza la campanita
      });

      // 🔔 Escuchar respuesta a solicitud enviada
      socket.on('respuesta-solicitud', (data) => {
        console.log('📬 Tu solicitud fue respondida:', data);
        loadNotifications(); // actualiza la campanita
        const mensaje = data.estado === 'aceptada'
          ? `🎉 ${data.responderNombre} aceptó tu solicitud. Ahora podés ver sus publicaciones.`
          : `❌ ${data.responderNombre} rechazó tu solicitud de seguimiento.`;
        // alert(mensaje);
        if (data.estado === 'aceptada') {
          actualizarListaAmigos(); // 👈 ✅ recarga lista de amigos
        }
      });

      socket.on('nueva-notificacion', (noti) => {
        console.log('📥 Nueva notificación recibida:', noti);
        loadNotifications(noti);
        if (typeof cargarPublicaciones === 'function') {
          cargarPublicaciones();
        }
        if(typeof cargarAlbumes === 'function') {
          cargarAlbumes();
        }
      });

    } catch (e) {
      console.error('Error al parsear currentUser:', e);
      return logout();
    }
  }



const avatar = document.getElementById('userAvatar');
const avatarInput = document.getElementById('avatarUploadInput');

if (avatarInput) {
  avatarInput.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;

    // Preview inmediato
    const reader = new FileReader();
    reader.onload = e => {
      if (avatar) avatar.src = e.target.result;
    };
    reader.readAsDataURL(file);

    // Luego subimos al servidor
    reader.onloadend = async () => {
      try {
        const formData = new FormData();
        formData.append('fotoPerfil', file);

        const authToken = localStorage.getItem('authToken');
        const res = await fetch('/api/usuario/foto-perfil', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authToken}`
          },
          body: formData
        });

        if (!res.ok) throw new Error(`Error ${res.status}`);

        const data = await res.json();

        if (data.avatar_url && avatar) {
          avatar.src = data.avatar_url;

          // Actualizar localStorage
          const user = JSON.parse(localStorage.getItem('currentUser') || '{}');
          user.imagen_perfil = data.avatar_url.replace('/uploads/', '');
          localStorage.setItem('currentUser', JSON.stringify(user));
        }
      } catch (error) {
        console.error('❌ Error al subir la foto de perfil:', error);
        alert('No se pudo subir la foto de perfil. Intente nuevamente.');
      }
    };
  });
}


  

  const searchForm = document.getElementById('searchForm');
  const searchInput = document.getElementById('searchInput');
  const resultsDiv = document.getElementById('searchResults');

  if (searchForm && searchInput && resultsDiv) {
    searchForm.addEventListener('submit', async e => {
      e.preventDefault();
      const query = searchInput.value.trim();
      
      if (query.length < 2) {
        resultsDiv.innerHTML = `<div class="alert alert-warning">Ingresa al menos 2 caracteres.</div>`;
        return;
      }
      
      resultsDiv.innerHTML = `<div class="text-center">Buscando...</div>`;
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          }
        });

        if (res.status === 401 || res.status === 403) return logout();

        const users = await res.json();
        resultsDiv.innerHTML = '';
        if (!users.length) {
          resultsDiv.innerHTML = `<div class="alert alert-info">No se encontraron usuarios.</div>`;
          return;
        }

    //     users.forEach(user => {
    //       const avatarId = (user.id % 70) + 1; // Garantiza ID entre 1 y 70

    //       const div = document.createElement('div');
    //       div.className = 'list-group-item d-flex justify-content-between align-items-center';
    //       div.innerHTML = `
    //         <div class="d-flex align-items-center">
    //           <img src="https://i.pravatar.cc/30?img=${avatarId}" class="rounded-circle me-2" style="width: 30px; height: 30px;">
    //           <span>${user.nombre} ${user.apellido} (${user.email})</span>
    //         </div>
    //           <div class="d-flex gap-2">
    //   <button class="btn btn-primary btn-sm send-friend-request-btn" data-user-id="${user.id}">Seguir</button>
    //   <a href="/perfil/${user.id}" class="btn btn-outline-secondary btn-sm">Ver Perfil</a>
    // </div>
    //       `;
    //       resultsDiv.appendChild(div);
    //     });


    users.forEach(user => {
      // Usa imagen real si tiene, si no, usa imagen por defecto
      const avatarUrl = user.imagen_perfil 
        ? `/uploads/${user.imagen_perfil}` 
        : '/uploads/default-avatar.png';
    
      const div = document.createElement('div');
      div.className = 'list-group-item d-flex justify-content-between align-items-center';
      div.innerHTML = `
        <div class="d-flex align-items-center">
          <img src="${avatarUrl}" class="rounded-circle me-2" style="width: 30px; height: 30px;" alt="Avatar">
          <span>${user.nombre} ${user.apellido} (${user.email})</span>
        </div>
        <div class="d-flex gap-2">
          <button class="btn btn-primary btn-sm send-friend-request-btn" data-user-id="${user.id}">Seguir</button>
         
        </div>
      `;
      resultsDiv.appendChild(div);
    });
    


        document.querySelectorAll('.send-friend-request-btn').forEach(btn => {
          btn.addEventListener('click', async e => {
            const id = e.target.dataset.userId;
            await sendFriendRequest(id, e.target);
          });
        });

      } catch (err) {
        console.error('Error en la búsqueda:', err);
        resultsDiv.innerHTML = `<div class="alert alert-danger">Error: ${err.message}</div>`;
      }
    });
  }



  // crearFormularioPublicacion();
  if(typeof cargarAlbumesCompartidos === 'function') {
    cargarAlbumesCompartidos();
  }
  if (typeof cargarPublicaciones === 'function') {
    cargarPublicaciones();
  }
  loadNotifications();
});


 // <a href="/perfil/${user.id}" class="btn btn-outline-secondary btn-sm">Ver Perfil</a>