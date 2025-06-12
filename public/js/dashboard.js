async function logout() {
  localStorage.removeItem('authToken');
  localStorage.removeItem('currentUser');
  console.log('Sesión cerrada y datos limpiados.');
  await fetch('/logout', { method: 'POST' }).catch(() => {});
  window.location.href = '/login';
}

function crearFormularioPublicacion() {
  const contenedor = document.getElementById('formPublicacionContainer');
  contenedor.innerHTML = `
    <div class="card p-3 mb-4">
      <h5>Publicar una imagen</h5>
      <div class="mb-3">
        <label for="imagen" class="form-label">Selecciona una imagen:</label>
        <input type="file" class="form-control" id="imagenInput" accept="image/*">
      </div>
      <div class="mb-3">
        <label for="descripcion" class="form-label">Descripción:</label>
        <textarea class="form-control" id="descripcionInput" rows="2"></textarea>
      </div>
      <button class="btn btn-primary" id="btnPublicar">Publicar</button>
    </div>
  `;

  document.getElementById('btnPublicar').addEventListener('click', async () => {
    const imagen = document.getElementById('imagenInput').files[0];
    const descripcion = document.getElementById('descripcionInput').value.trim();
    if (!imagen) return alert('Selecciona una imagen.');

    const formData = new FormData();
    formData.append('imagen', imagen);
    formData.append('descripcion', descripcion);

    const token = localStorage.getItem('authToken');
    try {
      const res = await fetch('/publicaciones', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      if (res.ok) {
        alert("✅ Publicación realizada con éxito");

        document.getElementById('descripcionInput').value = '';
        document.getElementById('imagenInput').value = '';
        cargarPublicaciones();
      } else {
        const data = await res.json();
        alert(data.mensaje || 'Error al subir publicación.');
      }
    } catch (err) {
      console.error('Error al subir publicación:', err);
      alert('Hubo un error al subir la imagen.');
    }
  });
}




async function cargarPublicaciones() {
  try {
    const token = localStorage.getItem('authToken');
    console.log("🔐 Token enviado:", token);

    if (!token) {
      console.warn('⚠️ No hay token en localStorage, redirigiendo a login...');
      return window.location.href = '/login';
    }

    const res = await fetch('/api/publicaciones', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!res.ok) {
      const error = await res.json();
      console.error("❌ Error del servidor:", error.message);
      return;
    }

    const publicaciones = await res.json();
    if (!Array.isArray(publicaciones)) {
      console.error("⚠️ El servidor no devolvió una lista:", publicaciones);
      return;
    }

    const contenedor = document.getElementById('publicaciones');
    contenedor.innerHTML = '';

    publicaciones.forEach(pub => {
      const card = document.createElement('div');
      card.className = 'card mb-3';
      card.innerHTML = `
        <img src="${pub.imagen_url}" class="card-img-top" alt="Imagen">
        <div class="card-body">
          <h5 class="card-title">${pub.usuario_nombre} ${pub.usuario_apellido}</h5>
          <p class="card-text">${pub.descripcion}</p>
          <p class="text-muted small">Fecha de publicación: ${new Date(pub.fecha_publicacion).toLocaleString()}</p>
          <ul class="list-group mb-2">
            ${pub.comentarios.map(c => `
              <li class="list-group-item"><strong>${c.usuario_nombre} ${c.usuario_apellido}:</strong> ${c.contenido}</li>
            `).join('')}
          </ul>
          <form data-comentario="${pub.id}">
            <div class="input-group">
              <input type="text" name="contenido" class="form-control" placeholder="Escribe un comentario..." required>
              <button type="submit" class="btn btn-outline-secondary">Comentar</button>
            </div>
          </form>
        </div>
      `;
      contenedor.appendChild(card);
    });

  } catch (err) {
    console.error('❌ Error al cargar publicaciones:', err);
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
      btn.textContent = 'Solicitud Enviada';
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

async function loadNotifications() {
  const authToken = localStorage.getItem('authToken');
  const notificationCount = document.getElementById('notificationCount');
  const notificationList = document.getElementById('notificationList');

  try {
    const res = await fetch('/api/notifications', {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    const data = await res.json();
    if (!data.length) {
      notificationCount.style.display = 'none';
      notificationList.innerHTML = '<li class="text-center text-muted">No hay solicitudes pendientes</li>';
      return;
    }

    notificationCount.textContent = data.length;
    notificationCount.style.display = 'inline-block';
    notificationList.innerHTML = '';
    data.forEach(s => {
      const li = document.createElement('li');
      li.className = 'dropdown-item d-flex justify-content-between align-items-center';
      li.innerHTML = `
        <div><strong>${s.nombre} ${s.apellido}</strong><br><small>${s.email}</small></div>
        <div>
          <button class="btn btn-sm btn-success me-1" onclick="responderSolicitud(${s.id}, 'accept')">✔</button>
          <button class="btn btn-sm btn-danger" onclick="responderSolicitud(${s.id}, 'reject')">✖</button>
        </div>
      `;
      notificationList.appendChild(li);
    });
  } catch (err) {
    console.error('Error al cargar notificaciones:', err);
  }
}

window.responderSolicitud = async (solicitudId, accion) => {
  try {
    const res = await fetch(`/api/users/friend-request/${solicitudId}/${accion}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('authToken')}`
      }
    });
    const data = await res.json();
    console.log(data.message);
    loadNotifications();
    actualizarListaAmigos(); // 👈 recargar amigos si se aceptó
  } catch (err) {
    console.error('Error al responder solicitud:', err);
  }
};

document.addEventListener('submit', async (e) => {
  console.log("comentario enviado");
  if (e.target.matches('form[data-comentario]')) {
    e.preventDefault();
    const form = e.target;
    const input = form.querySelector('input[name="contenido"]');
    const contenido = input.value.trim();
    const publicacionId = form.dataset.comentario;
    if (!contenido) return;

    try {
      const res = await fetch(`/comentarios/${publicacionId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('authToken')}`
        },
        body: JSON.stringify({ contenido })
      });

      if (res.ok) {
        input.value = '';
        cargarPublicaciones();
      } else {
        const data = await res.json();
        alert(data.mensaje || 'Error al comentar.');
      }
    } catch (err) {
      console.error('Error al enviar comentario:', err);
      alert('Hubo un error al comentar.');
    }
  }
});

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
      const socket = io();
      socket.emit('join', { userId: user.id });

      socket.on('nueva-solicitud', (data) => {
        console.log('📬 Nueva solicitud recibida:', data);
        loadNotifications();
      });

      socket.on('respuesta-solicitud', (data) => {
        console.log('📬 Tu solicitud fue respondida:', data);
        loadNotifications();
      });
    } catch (e) {
      console.error('Error al parsear currentUser:', e);
      return logout();
    }
  }

  const avatar = document.getElementById('userAvatar');
  const avatarInput = document.getElementById('avatarUploadInput');
  if (avatar && avatarInput) {
    avatar.addEventListener('click', () => avatarInput.click());
    avatarInput.addEventListener('change', e => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = e => avatar.src = e.target.result;
        reader.readAsDataURL(file);
      }
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

        users.forEach(user => {
          const avatarId = (user.id % 70) + 1; // Garantiza ID entre 1 y 70

          const div = document.createElement('div');
          div.className = 'list-group-item d-flex justify-content-between align-items-center';
          div.innerHTML = `
            <div class="d-flex align-items-center">
              <img src="https://i.pravatar.cc/30?img=${avatarId}" class="rounded-circle me-2" style="width: 30px; height: 30px;">
              <span>${user.nombre} ${user.apellido} (${user.email})</span>
            </div>
            <button class="btn btn-primary btn-sm send-friend-request-btn" data-user-id="${user.id}">Enviar Solicitud</button>
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

 
  

  crearFormularioPublicacion();
  cargarPublicaciones();
  loadNotifications();
});