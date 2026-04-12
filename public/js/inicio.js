async function logout() {
  localStorage.removeItem('authToken');
  localStorage.removeItem('currentUser');
  console.log('Sesión cerrada y datos limpiados.');
  await fetch('/logout', { method: 'POST' }).catch(() => { });
  window.location.href = '/login';
}



function mostrarToastDashboard(mensaje, tipo = 'info') {
  const toastEl = document.getElementById('respuestaToast');
  if (!toastEl) return;

  const toastBody = toastEl.querySelector('.toast-body');
  const toastHeader = toastEl.querySelector('.toast-header strong.me-auto');

  toastBody.textContent = mensaje;

  // Limpiar clases anteriores
  toastEl.classList.remove(
    'bg-success',
    'bg-danger',
    'bg-info',
    'bg-warning',
    'text-white',
    'text-dark'
  );

  switch (tipo) {
    case 'success':
      toastEl.classList.add('bg-success', 'text-white');
      toastHeader.textContent = 'Éxito';
      break;

    case 'error':
      toastEl.classList.add('bg-danger', 'text-white');
      toastHeader.textContent = 'Error';
      break;

    case 'warning':
      toastEl.classList.add('bg-warning', 'text-dark');
      toastHeader.textContent = 'Advertencia';
      break;

    default:
      toastEl.classList.add('bg-info', 'text-white');
      toastHeader.textContent = 'Información';
  }

  const toast = new bootstrap.Toast(toastEl);
  toast.show();
}


function crearFormularioPublicacion() {
  const contenedor = document.getElementById('formPublicacionContainer');
  contenedor.innerHTML = `
  
    <div class="card p-3 mb-4">
      <h5>Publicar una imagen</h5>
           <div class="mb-3">
        <label for="visibilidadSelect" class="form-label">Visibilidad:</label>
        <select class="form-select" id="visibilidadSelect">
          <option value="solo_seguidores" selected>Seguidores (Por defecto)</option>
          <option value="privada">Solo vos (Privada)</option>
          <option value="compartida">Personalizada... (Elige con quienes compartir)</option>
        </select>
      </div>

        <div class="mb-3 d-none" id="usuariosCompartidosContainer">
        <label class="form-label">Seleccioná usuarios para compartir:</label>
        <div id="usuariosCheckboxList">
          <p class="text-muted small">Cargando usuarios...</p>
        </div>
      </div>

      
      <div class="mb-3">
        <label for="imagenInput" class="form-label">Selecciona una imagen:</label>
        <input type="file" class="form-control" id="imagenInput" accept="image/*">
      </div>
      
      <div class="mb-3">
        <label for="descripcionInput" class="form-label">Descripción:</label>
        <textarea class="form-control" id="descripcionInput" rows="2"></textarea>
      </div>
      
      <div class="mb-3">
        <label for="tagsInput" class="form-label">#Tags (separados por comas):</label>
        <input type="text" class="form-control" id="tagsInput" placeholder="ej: macrame, hechoamano, vintage">
      </div>
 
      <button class="btn btn-primary" id="btnPublicar">Publicar</button>
        <div id="toastContainer" style="position: absolute; top: 100%; left: 0; z-index: 9999; margin-left: 30px;">
  <div id="respuestaToast" class="toast" role="alert" aria-live="assertive" aria-atomic="true">
    <div class="toast-header">
      <strong class="me-auto">Notificación</strong>
      <small class="text-muted">ahora</small>
      <button type="button" class="btn-close" data-bs-dismiss="toast"></button>
    </div>
    <div class="toast-body">
      <span id="toastMessage">Aquí se mostrará la respuesta a tu solicitud</span>
    </div>
  </div>
</div>
    </div>
  `;

  const visSelect = document.getElementById('visibilidadSelect');
  const usuariosContainer = document.getElementById('usuariosCompartidosContainer');

  visSelect.addEventListener('change', () => {
    if (visSelect.value === 'compartida') {
      usuariosContainer.classList.remove('d-none');
      cargarUsuariosParaCompartir();
    } else {
      usuariosContainer.classList.add('d-none');
    }
  });

  document.getElementById('btnPublicar').addEventListener('click', async () => {
    const imagen = document.getElementById('imagenInput').files[0];
    const descripcion = document.getElementById('descripcionInput').value.trim();
    const tagsText = document.getElementById('tagsInput').value.trim();
    const visibilidad = visSelect.value;

     if (!descripcion) {
      mostrarToastDashboard('⚠️ Crea una descripción para tu publicación.', 'warning');
      return;
    } else if(!imagen){
      mostrarToastDashboard('⚠️ Selecciona una imagen.', 'warning');
      return;
    }

    const tags = tagsText ? tagsText.split(',').map(t => t.trim()).filter(t => t.length > 0) : [];

    const formData = new FormData();
    formData.append('imagen', imagen);
    formData.append('descripcion', descripcion);
    formData.append('tags', tags.join(','));
    formData.append('visibilidad', visibilidad);

    if (visibilidad === 'compartida') {
      const seleccionados = Array.from(document.querySelectorAll('#usuariosCheckboxList input:checked'))
        .map(cb => cb.value);
      formData.append('usuarios_compartidos', JSON.stringify(seleccionados));
    }

    const token = localStorage.getItem('authToken');
    try {
      const res = await fetch('/publicaciones', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      if (res.ok) {
        mostrarToastDashboard('✅ Publicación realizada con éxito', 'success');
        document.getElementById('descripcionInput').value = '';
        document.getElementById('imagenInput').value = '';
        document.getElementById('tagsInput').value = '';
        visSelect.value = 'solo_seguidores';
        usuariosContainer.classList.add('d-none'); // Por si estaba visible el personalizado
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

async function cargarUsuariosParaCompartir() {
  const token = localStorage.getItem('authToken');
  const contenedor = document.getElementById('usuariosCheckboxList');
  contenedor.innerHTML = '<p class="text-muted small">Cargando usuarios...</p>';

  try {
    const res = await fetch('/api/usuarios/seguidores', {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) throw new Error('Error al obtener usuarios');

    const usuarios = await res.json();

    if (!usuarios.length) {
      contenedor.innerHTML = '<p class="text-muted small">No seguís a nadie todavía.</p>';
      return;
    }

    contenedor.innerHTML = usuarios.map(u => `
      <div class="form-check">
        <input class="form-check-input" type="checkbox" value="${u.id}" id="user-${u.id}">
        <label class="form-check-label" for="user-${u.id}">
          ${u.nombre} ${u.apellido}
        </label>
      </div>
    `).join('');

  } catch (err) {
    console.error('❌ Error al cargar usuarios para compartir:', err);
    contenedor.innerHTML = '<p class="text-danger small">Error al cargar usuarios.</p>';
  }
}

async function cargarPublicaciones() {
  try {
    const token = localStorage.getItem('authToken');
    if (!token) return window.location.href = '/login';

    const usuarioActual = JSON.parse(localStorage.getItem('currentUser'));

    const res = await fetch('/api/publicaciones', {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      const error = await res.json();
      console.error("❌ Error al obtener publicaciones del usuario:", error.message);
      return;
    }

    const publicaciones = await res.json();
    const contenedor = document.getElementById('publicaciones');
    contenedor.innerHTML = '';

    function textoVisibilidad(vis) {
      switch (vis) {
        case 'publica': return 'Pública (todos pueden ver)';
        case 'solo_seguidores': return 'Solo seguidores';
        case 'privada': return 'Privada (solo vos)';
        case 'compartida': return 'Compartida (personalizada)';
        default: return 'Desconocida';
      }
    }

    publicaciones.forEach(pub => {
      const avatarUrl = pub.imagen_perfil ? `${pub.imagen_perfil}` : '/uploads/default-avatar.png';

      // Verificar si la publicación es propia
      const esPropiaPublicacion = pub.usuario_id === usuarioActual.id;

      // Comentarios HTML con botón denunciar solo si comentario no es propio
      const comentariosHTML = pub.comentarios.map(c => {
        const comentarioAvatar = c.imagen_perfil ? `/uploads/${c.imagen_perfil}` : '/uploads/default-avatar.png';
        const esPropioComentario = c.usuario_id === usuarioActual.id;

        return `
          <li class="list-group-item d-flex align-items-start justify-content-between">
            <div class="d-flex">
              <img src="${comentarioAvatar}" class="rounded-circle me-3 align-self-start" style="width: 40px; height: 40px; margin-top: 2px;" alt="Avatar">
              <div class="d-flex flex-column">
                <strong>${c.usuario_nombre} ${c.usuario_apellido}</strong>
                <span>${c.contenido}</span>
              </div>
            </div>
            ${!esPropioComentario ? `
              <button class="btn btn-sm btn-outline-danger btn-denunciar"
                      data-tipo="comentario_publicacion"
                      data-id="${c.id}">
                Denunciar
              </button>` : ''}
          </li>`;
      }).join('');

      const card = document.createElement('div');
      card.className = 'card mb-3';
      card.innerHTML = `
        ${!esPropiaPublicacion ? `
          <div class="dropdown text-end px-3 py-2" style="background-color: #f5efe6;">
            <button class="btn btn-sm btn-light dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false" style="background: transparent; border: 1px;">
              <i class="bi bi-three-dots-vertical"></i>
            </button>
            <ul class="dropdown-menu dropdown-menu-end">
              <li>
                <button class="dropdown-item text-danger btn-denunciar"
                        data-tipo="publicacion"
                        data-id="${pub.id}">
                  Denunciar publicación
                </button>
              </li>
            </ul>
          </div>
        ` : ''}

        <img id="imagen-${pub.id}" src="${pub.imagen_url}" class="card-img-top" alt="Imagen">

        ${!esPropiaPublicacion ? `
          <div class="dropdown text-end px-3 py-2" style="background-color: #f5efe6;">
            <button class="btn btn-sm btn-light dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false" style="background: transparent; border: none;">
              <i class="bi bi-three-dots-vertical"></i>
            </button>
            <ul class="dropdown-menu dropdown-menu-end">
              <li>
                <button class="dropdown-item text-danger btn-denunciar"
                        data-tipo="imagen_publicacion"
                        data-id="${pub.id}">
                  Denunciar imagen
                </button>
              </li>
            </ul>
          </div>
        ` : ''}

        <div class="card-body" style="background-color: #f5efe6;">
          <div class="d-flex align-items-center mb-2">
            <img src="${avatarUrl}" class="rounded-circle me-2" style="width: 40px; height: 40px;" alt="Avatar">
            <div class="d-flex flex-column">
              <h5 class="card-title m-0">${pub.usuario_nombre} ${pub.usuario_apellido}</h5>
              <span class="badge ms-0 mt-2" style="background-color: #e3caa5; color: #4b2e17; font-size: 0.8rem;">
                ${textoVisibilidad(pub.visibilidad)}
              </span>
            </div>
          </div>

          <p class="card-text">${pub.descripcion}</p>

          <p>
            ${pub.tags && pub.tags.length > 0
              ? pub.tags.map(tag => `<span class="badge bg-secondary me-1">#${tag}</span>`).join(' ')
              : ''}
          </p>

          <p class="text-muted small">Fecha: ${new Date(pub.fecha_publicacion).toLocaleString()}</p>

          <ul class="list-group mb-2" id="comentarios-${pub.id}">
            ${comentariosHTML}
          </ul>

          <form data-comentario="${pub.id}" class="form-comentario">
            <div class="input-group">
              <input type="text" name="contenido" class="form-control" placeholder="Escribe un comentario..." required>
              <button type="submit" class="btn btn-outline-secondary">Comentar</button>
            </div>
          </form>
        </div>
      `;

      contenedor.appendChild(card);
    });

    // Activar botones de denuncia
    document.querySelectorAll('.btn-denunciar').forEach(btn => {
      btn.addEventListener('click', () => {
        const tipo = btn.dataset.tipo;
        const id = btn.dataset.id;

        document.getElementById('denunciaTipo').value = tipo;
        document.getElementById('denunciaId').value = id;

        // mostrar modal aquí si quieres
      });
    });

  } catch (err) {
    console.error('❌ Error al cargar publicaciones personales:', err);
  }
}


//DENUNCIAS
document.addEventListener('DOMContentLoaded', () => {
  const modalDenunciaEl = document.getElementById('modalDenuncia');
  const modalDenuncia = new bootstrap.Modal(modalDenunciaEl);
  const mensajeFeedback = document.getElementById('mensajeDenuncia');

  function mostrarModalDenuncia(tipo, id) {
    document.getElementById('denunciaTipo').value = tipo;
    document.getElementById('denunciaId').value = id;
    document.getElementById('motivo').value = 'contenido_ofensivo';
    document.getElementById('detalle').value = '';
    mensajeFeedback.textContent = '';
    mensajeFeedback.className = '';
    modalDenuncia.show();
  }

  // Delegación para los botones denunciar
  document.body.addEventListener('click', e => {
    if (e.target.classList.contains('btn-denunciar')) {
      const tipo = e.target.dataset.tipo;
      const id = e.target.dataset.id;
      mostrarModalDenuncia(tipo, id);
    }
  });

  // Enviar denuncia
  document.getElementById('btnConfirmarDenuncia').addEventListener('click', async () => {
    const tipo = document.getElementById('denunciaTipo').value;
    const id = document.getElementById('denunciaId').value;
    const motivo = document.getElementById('motivo').value;
    const detalle = document.getElementById('detalle').value.trim();

    if (!motivo) {
      mensajeFeedback.textContent = '⚠️ Por favor, selecciona un motivo para la denuncia.';
      mensajeFeedback.className = 'text-danger mt-2';
      return;
    }

    try {
      const token = localStorage.getItem('authToken');
      const res = await fetch('/api/denuncias', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          tipo_contenido: tipo,
          id_contenido_denunciado: id,
          motivo: detalle ? `${motivo}: ${detalle}` : motivo
        })
      });

      if (res.ok) {
        mensajeFeedback.textContent = '✅ Denuncia realizada con éxito.';
        mensajeDenuncia.className = 'text-white bg-success p-1 rounded';
        setTimeout(() => {
          modalDenuncia.hide();
        }, 1500);
      } else {
        const error = await res.json();
        mensajeFeedback.textContent = '❌ Error al enviar la denuncia: ' + (error.mensaje || 'Error desconocido.');
        mensajeFeedback.className = 'text-danger mt-2';
      }
    } catch (error) {
      console.error('Error al enviar denuncia:', error);
      mensajeFeedback.textContent = '❌ Error de conexión al enviar denuncia.';
      mensajeFeedback.className = 'text-danger mt-2';
    }
  });
});



async function cargarConteoSeguidores() {
  const authToken = localStorage.getItem('authToken');
  const spanSeguidores = document.getElementById('countSeguidores');

  if (!authToken || !spanSeguidores) return;

  try {
    const res = await fetch('/api/seguidores/count', {
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    });

    if (!res.ok) throw new Error('No se pudo obtener el conteo');

    const data = await res.json();
    spanSeguidores.textContent = data.total;
  } catch (err) {
    console.error('❌ Error al obtener seguidores:', err);
  }
}

async function cargarConteoPublicaciones() {
  const authToken = localStorage.getItem('authToken');
  const spanPublicaciones = document.getElementById('countPublicaciones');

  if (!authToken || !spanPublicaciones) return;

  try {
    const res = await fetch('/api/publicaciones/count', {
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    });

    if (!res.ok) throw new Error('No se pudo obtener el conteo');

    const data = await res.json();
    spanPublicaciones.textContent = data.total;
  } catch (err) {
    console.error('❌ Error al obtener publicaciones:', err);
  }

}

async function cargarConteoSeguidos() {
  const authToken = localStorage.getItem('authToken');
  const spanSeguidos = document.getElementById('countSiguiendo');

  if (!authToken || !spanSeguidos) return;

  try {
    const res = await fetch('/api/seguidos/count', {
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    });

    if (!res.ok) throw new Error('No se pudo obtener el conteo');

    const data = await res.json();
    spanSeguidos.textContent = data.total;
  } catch (err) {
    console.error('❌ Error al obtener seguidos:', err);
  }

}

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
  cargarDatosUsuario();

  const currentUser = localStorage.getItem('currentUser');
  const sidebarName = document.getElementById('sidebarUserName');

  if (currentUser && sidebarName) {
    try {
      const user = JSON.parse(currentUser);
      sidebarName.textContent = `${user.nombre} ${user.apellido}`;
    } catch (error) {
      console.error('❌ Error al cargar nombre en sidebar:', error);
    }
  }


  async function cargarDatosUsuario() {
    try {
      const res = await fetch('/api/usuario-datos', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });

      if (!res.ok) throw new Error('No autorizado o error');

      const usuario = await res.json();

      const avatarUrl = usuario.imagen_perfil ? `/uploads/${usuario.imagen_perfil}` : '/uploads/default-avatar.png';
      const avatarImg = document.querySelector('#sidebarUserAvatar');
      if (avatarImg) avatarImg.src = avatarUrl;

      const nombreSpan = document.querySelector('#sidebarUserName');
      if (nombreSpan) nombreSpan.textContent = `${usuario.nombre} ${usuario.apellido}`;
    } catch (error) {
      console.error('Error al cargar datos de usuario:', error);
    }
  }

  cargarConteo('/api/albumes/count', 'countAlbumes');
  cargarConteoSeguidos()
  cargarConteoPublicaciones();
  cargarConteoSeguidores();
  crearFormularioPublicacion();
  cargarPublicaciones();
  loadNotifications();
});


//BUSCAR POR TAGS
document.getElementById('formBusqueda').addEventListener('submit', async (e) => {
  e.preventDefault();

  const formBusqueda = e.target;
  const inputBusqueda = formBusqueda.querySelector('input[name="query"]');
  const contenedor = document.getElementById('publicaciones');

  const query = inputBusqueda.value.trim();

  if (!query || query === '#') {
    await cargarPublicaciones();
    return;
  }

  await buscarYMostrarResultados(query);

  // Escucha para cuando se borra el input
  inputBusqueda.addEventListener('input', () => {
    if (inputBusqueda.value.trim() === '') {
      cargarPublicaciones();
    }
  });

  async function buscarYMostrarResultados(query) {
    const token = localStorage.getItem('authToken');
    try {
      // Construir URL con parámetro adecuado
      let url = new URL('/api/buscar', window.location.origin);

      if (query.startsWith('#')) {
        url.searchParams.append('tag', query.slice(1).toLowerCase());
      } else {
        url.searchParams.append('query', query);
      }

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        console.error('❌ Error al buscar:', await res.text());
        return;
      }

      const resultados = await res.json();
      contenedor.innerHTML = '';

      if (!resultados.length) {
        contenedor.innerHTML = '<div class="alert alert-warning text-center">No se encontraron resultados.</div>';
        return;
      }

      resultados.forEach(pub => {
        const card = document.createElement('div');
        card.className = 'card mb-3';
        card.innerHTML = `
          <img src="${pub.imagen_url}" class="card-img-top" alt="Imagen">
          <div class="card-body" style="background-color: #ede5da;">
            <h5 class="card-title">${pub.usuario_nombre} ${pub.usuario_apellido}</h5>
            <p class="card-text">${pub.descripcion}</p>
            <p>
              ${pub.tags && pub.tags.length > 0
            ? pub.tags.map(tag => `<span class="badge bg-secondary me-1">#${tag}</span>`).join(' ')
            : ''}
            </p>
            <p class="text-muted small">Fecha: ${new Date(pub.fecha_publicacion).toLocaleString()}</p>
            <ul class="list-group mb-2">
              ${pub.comentarios.map(c => `
                <li class="list-group-item"><strong>${c.usuario_nombre} ${c.usuario_apellido}:</strong> ${c.contenido}</li>
              `).join('')}
            </ul>
            <form data-comentario="${pub.id}" class="form-comentario">
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
      console.error('❌ Error al procesar búsqueda:', err);
    }
  }

});




