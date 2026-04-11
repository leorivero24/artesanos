const searchForm = document.getElementById('searchForm');
const searchInput = document.getElementById('searchInput');
const resultsDiv = document.getElementById('searchResults');

if (searchForm && searchInput && resultsDiv) {
    const authToken = localStorage.getItem('authToken');

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

    

            const getTextoEstado = (estado) => {
                switch (estado) {
                    case 'seguimiento_mutuo':
                        return 'Amigos';
                    case 'siguiendo':
                        return 'Siguiendo';
                    case 'te_sigue':
                        return 'Te_sigue';
                    default:
                        return 'Seguir';
                }
            };

          

            const getClaseEstado = (estado) => {
                switch (estado) {
                    case 'seguimiento_mutuo':
                        return 'btn-success';
                    case 'siguiendo':
                        return 'btn-secondary';
                    case 'te_sigue':
                        return 'btn-info';
                    default:
                        return 'btn-primary';
                }
            };

            users.forEach(user => {
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
            <button 
              class="btn btn-sm send-friend-request-btn ${getClaseEstado(user.estado)}" 
              data-user-id="${user.id}">
              ${getTextoEstado(user.estado)}
            </button>
          </div>
        `;

                resultsDiv.appendChild(div);
            });

            // 🔥 evento click en botones
            document.querySelectorAll('.send-friend-request-btn').forEach(btn => {
                btn.addEventListener('click', async e => {
                    const button = e.target;
                    const id = button.dataset.userId;

                    const success = await sendFriendRequest(id, button);

                    // 👉 opcional: actualizar visual al seguir
                    if (success) {
                        button.textContent = 'Siguiendo';
                        button.classList.remove('btn-primary', 'btn-info');
                        button.classList.add('btn-secondary');
                    }
                });
            });

        } catch (err) {
            console.error('Error en la búsqueda:', err);
            resultsDiv.innerHTML = `<div class="alert alert-danger">Error: ${err.message}</div>`;
        }
    });
}