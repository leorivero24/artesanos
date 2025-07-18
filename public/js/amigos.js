// document.addEventListener('DOMContentLoaded', async () => {
//     const token = localStorage.getItem('authToken');
//     if (!token) {
//       console.warn('Token ausente. Redirigiendo a login.');
//       return window.location.href = '/login';
//     }
  
//     try {
//       const res = await fetch('/api/amigos', {
//         headers: {
//           'Authorization': `Bearer ${token}`
//         }
//       });
  
//       if (res.ok) {
//         const amigos = await res.json();
//         const lista = document.getElementById('amigos-list');
//         if (lista) {
//           lista.innerHTML = ''; // limpiar antes de agregar
//           amigos.forEach(amigo => {
//             const avatarId = (amigo.id % 70) + 1;
//             const item = document.createElement('li');
//             item.className = 'list-group-item d-flex align-items-center mb-2';
  
//             item.innerHTML = `

//               <img src="https://i.pravatar.cc/40?img=${avatarId}" class="rounded-circle me-2" style="width: 40px; height: 40px;" alt="Avatar">
//               <div>
//                 <strong>${amigo.nombre} ${amigo.apellido}</strong><br>
//                 <small class="text-muted">${amigo.email || ''}</small>
//               </div>
//             `;
  
//             lista.appendChild(item);
//           });
//         }
//       } else {
//         const errorText = await res.text();
//         console.error('Error al cargar amigos:', errorText);
//       }
//     } catch (err) {
//       console.error('Error de red al cargar amigos:', err);
//     }
//   });
  

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
});

async function actualizarListaAmigos() {
  const token = localStorage.getItem('authToken');
  try {
    const res = await fetch('/api/amigos', {
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
          const avatarId = (amigo.id % 70) + 1;
          const item = document.createElement('li');
          item.className = 'list-group-item d-flex align-items-center mb-2';
          item.innerHTML = `
            <img src="https://i.pravatar.cc/40?img=${avatarId}" class="rounded-circle me-2" style="width: 40px; height: 40px;" alt="Avatar">
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

