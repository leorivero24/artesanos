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



// async function actualizarListaAmigos() {
//   const token = localStorage.getItem('authToken');
//   try {
//     const res = await fetch('/api/seguidores', {
//       headers: {
//         'Authorization': `Bearer ${token}`
//       }
//     });

//     if (res.ok) {
//       const amigos = await res.json();
//       const lista = document.getElementById('amigos-list');
//       if (lista) {
//         lista.innerHTML = ''; // Limpiar lista actual

//         amigos.forEach(amigo => {
//           const avatarUrl = amigo.imagen_perfil 
//             ? `/uploads/${amigo.imagen_perfil}` 
//             : '/uploads/default-avatar.png';

//           const item = document.createElement('li');
//           item.className = 'list-group-item d-flex align-items-center mb-2';
//           item.innerHTML = `
//             <img src="${avatarUrl}" class="rounded-circle me-2" style="width: 40px; height: 40px;" alt="Avatar">
//             <div>
//               <strong>${amigo.nombre} ${amigo.apellido}</strong><br>
//               <small class="text-muted">${amigo.email || ''}</small>
//             </div>
//           `;
//           lista.appendChild(item);
//         });
//       }
//     } else {
//       const errorText = await res.text();
//       console.error('Error al cargar amigos:', errorText);
//     }
//   } catch (err) {
//     console.error('Error de red al cargar amigos:', err);
//   }
// }


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
        lista.innerHTML = '';

        // 🔥 mismo estilo que búsqueda
        const getTextoEstado = (estado) => {
          switch (estado) {
            case 'mutuo':
              return 'Siguiéndose';
            case 'yo_sigo':
              return 'Siguiendo';
            case 'me_sigue':
              return 'Te sigue';
            default:
              return '';
          }
        };

        const getClaseEstado = (estado) => {
          switch (estado) {
            case 'mutuo':
              return 'btn-success';
            case 'yo_sigo':
              return 'btn-secondary';
            case 'me_sigue':
              return 'btn-info';
            default:
              return 'btn-primary';
          }
        };

        amigos.forEach(amigo => {
          const avatarUrl = amigo.imagen_perfil
            ? `/uploads/${amigo.imagen_perfil}`
            : '/uploads/default-avatar.png';

          const item = document.createElement('li');
          item.className = 'list-group-item d-flex justify-content-between align-items-center mb-2';

          item.innerHTML = `
            <div class="d-flex align-items-center">
              <img src="${avatarUrl}" class="rounded-circle me-2" style="width: 40px; height: 40px;" alt="Avatar">
              <div>
                <strong>${amigo.nombre} ${amigo.apellido}</strong><br>
                <small class="text-muted">${amigo.email || ''}</small>
              </div>
            </div>

             <button 
             class="btn btn-sm"style="background-color: #b79969; color: white;">
            ${amigo.tipo === 'seguimiento_mutuo' ? 'Mutuamente' : 'Te_sigue'}
             </button>

            
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