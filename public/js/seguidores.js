async function cargarConteo(url, ...spanIds) {
  const token = localStorage.getItem('authToken');
  if (!token || spanIds.length === 0) return;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) throw new Error('No se pudo obtener el conteo');

    const data = await res.json();

    spanIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = data.total;
    });

  } catch (err) {
    console.error(`❌ Error al obtener ${url}:`, err);
  }
}
document.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('authToken');
  const currentUser = JSON.parse(localStorage.getItem('currentUser'));
  if (!token || !currentUser) {
    console.warn('Token o usuario ausente. Redirigiendo a login.');
    return window.location.href = '/login';
  }

  const socket = io();
  socket.emit('join', { userId: currentUser.id });

  // Cargar lista de amigos inicial
  actualizarListaAmigos();

  // Escuchar nuevos amigos en tiempo real
  socket.on('nuevo-amigo', (amigo) => {
    console.log('🆕 Nuevo amigo agregado:', amigo);
    actualizarListaAmigos();
  });
  cargarConteo('/api/seguidores/count', 'countSeguidores', 'seguidoresContador');
});



async function actualizarListaAmigos() {
  const token = localStorage.getItem('authToken');
  try {
    const res = await fetch('/api/seguidores', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (res.ok) {
      const amigos = await res.json();
      const lista = document.getElementById('amigos-list');
      if (lista) {
        lista.innerHTML = ''; // Limpiar lista actual

        amigos.forEach(amigo => {
          const avatarUrl = amigo.imagen_perfil 
            ? `/uploads/${amigo.imagen_perfil}` 
            : '/uploads/default-avatar.png';

          const item = document.createElement('li');
          item.className = 'list-group-item d-flex align-items-center mb-2';
          item.innerHTML = `
            <img src="${avatarUrl}" class="rounded-circle me-2" style="width: 40px; height: 40px;" alt="Avatar">
            <div>
              <strong>${amigo.nombre} ${amigo.apellido}</strong><br>
              <small class="text-muted">${amigo.email || ''}</small>
            </div>
          `;
          lista.appendChild(item);
        });
      }
    } else {
      const errorText = await res.text();
      console.error('Error al cargar amigos:', errorText);
    }
  } catch (err) {
    console.error('Error de red al cargar amigos:', err);
  }
}
