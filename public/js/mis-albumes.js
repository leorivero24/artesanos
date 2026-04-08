


document.addEventListener('DOMContentLoaded', () => {
  if (window.location.pathname === '/mis-albumes') {
    cargarAlbumes();

    const visibilidadSelect = document.getElementById('visibilidadAlbum');
    const usuariosContainer = document.getElementById('usuariosCompartidosAlbumContainer');
    const usuariosCheckboxList = document.getElementById('usuariosCheckboxListAlbum');

    visibilidadSelect.addEventListener('change', async () => {
      if (visibilidadSelect.value === 'compartida') {
        usuariosContainer.classList.remove('d-none');
        await cargarUsuariosParaCompartir();
      } else {
        usuariosContainer.classList.add('d-none');
        usuariosCheckboxList.innerHTML = ''; // limpiar si cambia
      }
    });



    const form = document.getElementById('formCrearAlbum');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const titulo = document.getElementById('tituloAlbum').value.trim();
        const imagenes = document.getElementById('imagenesAlbum').files;
        const tags = document.getElementById('tagsAlbum').value.trim();

        if (!titulo || imagenes.length === 0) {
          return alert('Debes ingresar un título y al menos una imagen.');
        }

        const formData = new FormData();
        formData.append('titulo', titulo);
        for (let i = 0; i < imagenes.length; i++) {
          formData.append('imagenes', imagenes[i]);
        }
        formData.append('tags', tags);


        // === Agregar usuarios compartidos si la visibilidad es "compartida"
        const visibilidad = document.getElementById('visibilidadAlbum').value;
        formData.append('visibilidad', visibilidad);  // ESTA LÍNEA ES CLAVE ✅
        if (visibilidad === 'compartida') {
          const usuariosCheckbox = document.querySelectorAll('#usuariosCheckboxListAlbum input[type="checkbox"]:checked');
          const usuariosCompartidos = Array.from(usuariosCheckbox).map(cb => cb.value);
          usuariosCompartidos.forEach(id => formData.append('usuariosCompartidos[]', id));
        }

        const token = localStorage.getItem('authToken');

        for (let pair of formData.entries()) {
          console.log(`🟦 ${pair[0]}:`, pair[1]);
        }

        try {
          const res = await fetch('/albumes', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData
          });

          const text = await res.text();
          let data;
          try {
            data = JSON.parse(text);
          } catch {
            throw new Error('La respuesta no es JSON válido');
          }

          if (res.ok) {
            alert('✅ Álbum creado correctamente');
            form.reset();
            cargarAlbumes();
          } else {
            alert(data.mensaje || 'Error al crear el álbum');
          }
        } catch (err) {
          console.error('❌ Error al crear álbum:', err);
          alert('Error al enviar el formulario.');
        }
      });
    }

    const formBusqueda = document.getElementById('formBusquedaMisAlbumes');
    const input = formBusqueda.querySelector('input[name="query"]');

    formBusqueda.addEventListener('submit', e => {
      e.preventDefault();
      const query = input.value.trim();
      if (!query) {
        cargarAlbumes();
      } else {
        buscarAlbumes(query);
      }
    });

    input.addEventListener('input', () => {
      if (input.value.trim() === '') {
        cargarAlbumes();
      }
    });
  }
});





// =================== FUNCIONES ======================


async function cargarAlbumes() {
  const container = document.getElementById('albumesContainer');
  const token = localStorage.getItem('authToken');

  if (!container || !token) return;

  try {
    const res = await fetch('/api/mis-albumes', {
      headers: { Authorization: `Bearer ${token}` }
    });

    const albumes = await res.json();
    container.innerHTML = '';

    if (!albumes.length) {
      container.innerHTML = '<p class="text-muted text-center">No tenés álbumes compartidos aún.</p>';
      return;
    }

    albumes.forEach(album => mostrarAlbum(album));
    scrollToImageInView();
  } catch (err) {
    console.error('❌ Error al cargar álbumes:', err);
    container.innerHTML = '<p class="text-danger">Error al cargar tus álbumes.</p>';
  }
}


function mostrarAlbum(album) {
  const container = document.getElementById('albumesContainer');
  const usuarioActual = JSON.parse(localStorage.getItem('currentUser'));

  const tagsHtml = album.tags
    ? `<div class="mt-2">${album.tags.split(',').map(t => `<span class="badge bg-secondary me-1">#${t.trim()}</span>`).join(' ')}</div>`
    : '';

  const avatarUrl = album.imagen_perfil
    ? `/uploads/${album.imagen_perfil}`
    : '/uploads/default-avatar.png';

  const imagenesHtml = album.imagenes.map((img, index, arr) => {
    let colClass = 'col-md-4';
    if (arr.length === 1) colClass = 'col-12';
    else if (arr.length === 2) colClass = 'col-md-6';

    const botonDenunciarImagen = (usuarioActual.id !== album.usuario_id)
      ? `<button class="btn btn-sm btn-danger position-absolute btn-denuncia"
          style="top: 5px; right: 5px; opacity: 0.7; z-index: 10;"
          data-tipo="imagen_album"
          data-id="${img.id}"
          data-bs-toggle="modal"
          data-bs-target="#modalDenuncia"
          title="Denunciar imagen">
          <i class="bi bi-flag-fill"></i>
        </button>`
      : '';

    return `
      <div class="${colClass} mb-4">
        <div style="position: relative; display: inline-block; width: 100%;">
          <img src="${img.url}" id="img-album-${img.id}" class="album-img mb-2" alt="Imagen" style="width: 100%; display: block;">
          ${botonDenunciarImagen}
        </div>
        <div class="comentarios-imagen mb-2" id="comentarios-imagen-${img.id}"></div>
        <form class="form-comentar-imagen d-flex mt-1" data-imagen-id="${img.id}">
          <input type="text" class="form-control form-control-sm me-2" placeholder="Escribí un comentario..." required>
          <button type="submit" class="btn btn-primary btn-sm">Enviar</button>
        </form>
      </div>
    `;
  }).join('');

  function textoVisibilidad(vis) {
    switch (vis) {
      case 'privada': return 'Privada (solo vos)';
      case 'solo_seguidores': return 'Solo seguidores';
      case 'compartida': return 'Compartida (personalizada)';
      default: return 'Desconocida';
    }
  }

  const botonDenuncia = (usuarioActual.id !== album.usuario_id)
    ? `
    <div class="dropdown text-end" style="position: absolute; top: 5px; right: 10px;">
      <button class="btn btn-sm btn-light dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false" style="background-color: transparent;border: 1px solid #d9cbb6; ">
        <i class="bi bi-three-dots-vertical"></i>
      </button>
      <ul class="dropdown-menu dropdown-menu-end">
        <li>
          <button class="dropdown-item text-danger btn-denuncia"
                  data-tipo="album"
                  data-id="${album.id}"
                  data-bs-toggle="modal"
                  data-bs-target="#modalDenuncia"
                  style="padding: 0.25rem 0.5rem; font-size: 0.8rem; line-height:1;">
            <i class="bi bi-flag-fill me-2"></i> Denunciar álbum
          </button>
        </li>
      </ul>
    </div>
    `
    : '';

  const card = document.createElement('div');
  card.className = 'card mb-3 album-card';

  card.innerHTML = `
    <div class="card-header d-flex align-items-center">
      <img src="${avatarUrl}" alt="Avatar" class="rounded-circle me-2" style="width: 40px; height: 40px;">
      <div>
        <div class="d-flex align-items-center">
          <strong class="me-2">${album.titulo}</strong>
          ${botonDenuncia}
        </div>
        <small class="text-muted">
          Creado por: <strong>${album.usuario_nombre} ${album.usuario_apellido}</strong> · 
          ${new Date(album.fecha_creacion).toLocaleString()}
        </small>
        <span class="badge bg-info text-dark">${textoVisibilidad(album.visibilidad)}</span>
        ${tagsHtml}
      </div>
    </div>
    <div class="card-body row" style="max-width: 1300px; margin: auto;">
      ${imagenesHtml}
    </div>
    <div class="card-footer">
      <div class="comentarios-container" id="comentarios-${album.id}">
        <p class="text-muted">Cargando comentarios...</p>
      </div>
      <form class="form-comentar" data-album-id="${album.id}">
        <textarea class="form-control mb-2" rows="2" placeholder="Escribí un comentario sobre el álbum..." required></textarea>
        <button type="submit" class="btn btn-primary btn-sm">Enviar</button>
      </form>
    </div>
  `;

  container.prepend(card);

  cargarComentarios(album.id);
  album.imagenes.forEach(img => cargarComentariosImagen(img.id));
}


//evento click denuncia
document.addEventListener('click', e => {
  const btn = e.target.closest('.btn-denuncia');
  if (btn) {
    const tipo = btn.dataset.tipo;
    const id = btn.dataset.id;

    document.getElementById('denunciaTipo').value = tipo;
    document.getElementById('denunciaId').value = id;
  }
});




//CARGAR COMENTARIOS DE ALBUM CON IMAGEN PERFIL
async function cargarComentarios(albumId) {
  const token = localStorage.getItem('authToken');
  const contenedor = document.getElementById(`comentarios-${albumId}`);
  const usuarioActual = JSON.parse(localStorage.getItem('currentUser'));

  try {
    const res = await fetch(`/api/albumes/${albumId}/comentarios`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const comentarios = await res.json();

    if (!comentarios.length) {
      contenedor.innerHTML = '<p class="text-muted">Sin comentarios aún.</p>';
      return;
    }

    contenedor.innerHTML = comentarios.map(c => {
      const avatarUrl = c.imagen_perfil ? `/uploads/${c.imagen_perfil}` : '/uploads/default-avatar.png';

      // Botón de denuncia solo si no es el autor del comentario
      const botonDenuncia = c.usuario_id !== usuarioActual.id
        ? `<button class="btn btn-sm btn-outline-danger btn-denunciar-comentario-album"
      data-comentario-id="${c.id}"
      data-album-id="${albumId}"
      style="padding: 2px 8px; font-size: 0.75rem; margin-top: -15px;">
     <i class="bi bi-flag-fill"></i> Denunciar
     </button>`
        : '';

      return `
        <div class="comentario mb-2 d-flex align-items-start">
          <img src="${avatarUrl}" alt="Avatar" class="rounded-circle me-2" style="width: 40px; height: 40px; margin-top: 3px;">
          <div class="w-100">
            <div class="d-flex align-items-center">
              <div class="me-2">
                <strong>${c.nombre} ${c.apellido}</strong>: <span>${c.comentario}</span><br>
                <small class="text-muted">${new Date(c.fecha).toLocaleString()}</small>
              </div>
              ${botonDenuncia}
            </div>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('❌ Error al cargar comentarios del álbum:', err);
    contenedor.innerHTML = '<p class="text-danger">Error al cargar comentarios del álbum.</p>';
  }
}


//evento del boton denunciar comentario album
document.addEventListener('click', e => {
  if (e.target.classList.contains('btn-denunciar-comentario-album')) {
    const comentarioId = e.target.dataset.comentarioId;
    // const albumId = e.target.dataset.albumId;

    // Preparar y mostrar modal de denuncia
    document.getElementById('denunciaTipo').value = 'comentario_album';
    document.getElementById('denunciaId').value = comentarioId;

    const modal = new bootstrap.Modal(document.getElementById('modalDenuncia'));
    modal.show();
  }
});




document.getElementById('btnConfirmarDenuncia').addEventListener('click', async () => {
  const tipo = document.getElementById('denunciaTipo').value;
  const id = document.getElementById('denunciaId').value;
  const motivo = document.getElementById('motivo').value;
  const detalle = document.getElementById('detalle').value.trim();
  const mensajeFeedback = document.getElementById('mensajeDenuncia');

  if (!motivo) {
    mensajeFeedback.textContent = '⚠️ Por favor, selecciona un motivo para la denuncia.';
    mensajeFeedback.className = 'text-danger mt-2';
    mensajeFeedback.classList.remove('d-none');
    return;
  }

  try {
    const token = localStorage.getItem('authToken');
    const res = await fetch('/api/denuncias-albumes', {
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
      mensajeFeedback.className = 'text-white bg-success p-1 rounded';
      mensajeFeedback.classList.remove('d-none');

      setTimeout(() => {
        // Intentar obtener instancia del modal y ocultarlo
        const modalInstance = bootstrap.Modal.getInstance(document.getElementById('modalDenuncia'));
        if (modalInstance) {
          modalInstance.hide();
        }
        // Limpiar campos
        document.getElementById('motivo').value = 'contenido_ofensivo';
        document.getElementById('detalle').value = '';
        mensajeFeedback.textContent = '';
        mensajeFeedback.classList.add('d-none');
      }, 1500);
    } else {
      const error = await res.json();
      mensajeFeedback.textContent = '❌ Error al enviar la denuncia: ' + (error.mensaje || 'Error desconocido.');
      mensajeFeedback.className = 'text-danger mt-2';
      mensajeFeedback.classList.remove('d-none');
    }
  } catch (error) {
    console.error('Error al enviar denuncia:', error);
    mensajeFeedback.textContent = '❌ Error de conexión al enviar denuncia.';
    mensajeFeedback.className = 'text-danger mt-2';
    mensajeFeedback.classList.remove('d-none');
  }
});



async function cargarComentariosImagen(imagenId) {
  const container = document.getElementById(`comentarios-imagen-${imagenId}`);
  const token = localStorage.getItem('authToken');
  const usuarioActual = JSON.parse(localStorage.getItem('currentUser'));

  if (!container || !token || !usuarioActual) return;

  let lista = container.querySelector('.comentarios-list');
  if (!lista) {
    lista = document.createElement('div');
    lista.className = 'comentarios-list';
    container.prepend(lista);
  }

  try {
    const res = await fetch(`/api/imagenes/${imagenId}/comentarios`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const comentarios = await res.json();
    lista.innerHTML = '';

    if (!comentarios.length) {
      lista.innerHTML = '<p class="text-muted small">Sin comentarios todavía.</p>';
      return;
    }

    comentarios.forEach(c => {
      const usuario = `${c.nombre || ''} ${c.apellido || ''}`.trim() || 'Anónimo';
      const texto = c.comentario || c.contenido || '';
      const fecha = c.fecha || c.fecha_creacion || '';
      const avatarUrl = c.imagen_perfil ? `/uploads/${c.imagen_perfil}` : '/uploads/default-avatar.png';

      // Botón de denuncia solo si no es del usuario actual
      const botonDenuncia = c.usuario_id !== usuarioActual.id
        ? `<button class="btn btn-sm btn-outline-danger btn-denuncia-comentario-album"
             data-tipo="comentario_imagen_album"
             data-id="${c.id}"
             data-img-id="${imagenId}"
             style="font-size: 0.375rem; padding: 1px 6px; font-size: 0.75rem; margin-top: -15px;">
             <i class="bi bi-flag-fill"></i> 
           </button>`
        : '';

      const div = document.createElement('div');
      div.className = 'comentario-item mb-2 d-flex align-items-start';

      div.innerHTML = `
        <img src="${avatarUrl}" alt="Avatar" class="rounded-circle me-2" style="width: 35px; height: 35px; margin-top: 3px;">
        <div class="w-100">
          <div class="d-flex align-items-center justify-content-between">
            <div>
              <strong>${usuario}:</strong> ${texto}<br>
              <small class="text-muted">${new Date(fecha).toLocaleString()}</small>
            </div>
            ${botonDenuncia}
          </div>
        </div>
      `;

      lista.appendChild(div);
    });
  } catch (err) {
    console.error(`❌ Error al cargar comentarios de imagen ${imagenId}:`, err);
    lista.innerHTML = '<p class="text-danger small">Error al cargar comentarios.</p>';
  }
}

//click denuncia comentario de imagenes album
document.addEventListener('click', e => {
  const btn = e.target.closest('.btn-denuncia-comentario-album');
  if (btn) {
    // Obtener datos del botón
    const tipo = btn.dataset.tipo;         // debe ser "comentario_imagen_album"
    const id = btn.dataset.id;             // id del comentario
   // const imgId = btn.dataset.imgId;       // id de la imagen (opcional)

    // Poner valores en inputs ocultos o campos del modal
    document.getElementById('denunciaTipo').value = tipo;
    document.getElementById('denunciaId').value = id;

    // Opcional: guardar imagenId en campo oculto si lo usas
    // const imgIdInput = document.getElementById('denunciaImagenId');
    // if (imgIdInput) {
    //   imgIdInput.value = imgId;
    // }

    // Mostrar modal con Bootstrap 5
    const modalEl = document.getElementById('modalDenuncia');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
  }
});




//SCROLL A LA IMAGEN DEL ALBUM
function scrollToImageInView() {
  const hash = window.location.hash;
  if (hash && (hash.startsWith('#imagen-') || hash.startsWith('#img-album-'))) {
    setTimeout(() => {
      const el = document.querySelector(hash);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('border', 'border-3', 'border-warning');
        setTimeout(() => el.classList.remove('border', 'border-3', 'border-warning'), 3000);
      }
    }, 500); // Tiempo suficiente para que rendericen los álbumes
  }
}



// =================== EVENTOS ======================

// ✅ Único listener para comentarios de imagen
document.addEventListener('submit', async (e) => {
  if (e.target.classList.contains('form-comentar-imagen')) {
    e.preventDefault();

    const form = e.target;
    const imagenId = form.dataset.imagenId;
    const input = form.querySelector('input');
    const comentario = input.value.trim();
    const token = localStorage.getItem('authToken');

    if (!comentario) {
      return alert('El comentario no puede estar vacío.');
    }

    try {
      const res = await fetch(`/api/imagenes/${imagenId}/comentarios`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ contenido: comentario })
      });

      if (!res.ok) throw new Error('Error al comentar');

      input.value = '';
      cargarComentariosImagen(imagenId);
    } catch (err) {
      console.error('❌ Error al enviar comentario de imagen:', err);
      alert('Ocurrió un error al comentar la imagen.');
    }
  }

  if (e.target.classList.contains('form-comentar')) {
    e.preventDefault();

    const form = e.target;
    const albumId = form.dataset.albumId;
    const textarea = form.querySelector('textarea');
    const contenido = textarea.value.trim();
    const token = localStorage.getItem('authToken');

    if (!contenido) {
      return alert('El comentario no puede estar vacío.');
    }

    try {
      const res = await fetch(`/api/albumes/${albumId}/comentarios`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ contenido })
      });

      if (!res.ok) throw new Error('Error al enviar comentario de álbum');

      textarea.value = '';
      cargarComentarios(albumId);
    } catch (err) {
      console.error('❌ Error al enviar comentario de álbum:', err);
      alert('Error al enviar el comentario del álbum.');
    }
  }
});

// =================== BÚSQUEDA ======================

async function buscarAlbumes(query) {
  const token = localStorage.getItem('authToken');

  try {
    const params = new URLSearchParams();
    if (query.startsWith('#')) {
      params.append('tag', query.slice(1).toLowerCase());
    } else {
      params.append('titulo', query);
    }

    const res = await fetch(`/api/buscar-albumes-compartidos?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) throw new Error('Error en la búsqueda por título o tag');

    const albumes = await res.json();
    const container = document.getElementById('albumesContainer');
    container.innerHTML = '';
    albumes.forEach(album => mostrarAlbum(album));

  } catch (error) {
    console.error('Error al buscar álbumes:', error);
    const container = document.getElementById('albumesContainer');
    container.innerHTML = '<div class="alert alert-danger text-center">Error al realizar la búsqueda.</div>';
  }
}





// // =================== FUNCIONES ======================


// async function cargarUsuariosParaCompartir() {
//   const token = localStorage.getItem('authToken');
//   const contenedor = document.getElementById('usuariosCheckboxListAlbum'); // CORREGIDO el id
//   if (!contenedor) return;

//   contenedor.innerHTML = '<p class="text-muted small">Cargando usuarios...</p>';

//   try {
//     const res = await fetch('/api/usuarios/seguidores', {  // Usa la ruta correcta que devuelve los usuarios a compartir
//       headers: { Authorization: `Bearer ${token}` }
//     });

//     if (!res.ok) throw new Error('Error al obtener usuarios');

//     const usuarios = await res.json();

//     if (!usuarios.length) {
//       contenedor.innerHTML = '<p class="text-muted small">No seguís a nadie todavía.</p>';
//       return;
//     }

//     contenedor.innerHTML = usuarios.map(u => `
//       <div class="form-check">
//         <input class="form-check-input" type="checkbox" value="${u.id}" id="user-${u.id}" name="usuariosCompartidos[]">
//         <label class="form-check-label" for="user-${u.id}">
//           ${u.nombre} ${u.apellido}
//         </label>
//       </div>
//     `).join('');

//   } catch (err) {
//     console.error('❌ Error al cargar usuarios para compartir:', err);
//     contenedor.innerHTML = '<p class="text-danger small">Error al cargar usuarios.</p>';
//   }
// }



// async function cargarAlbumes() {
//   const container = document.getElementById('albumesContainer');
//   const token = localStorage.getItem('authToken');

//   if (!container || !token) return;

//   try {
//     const res = await fetch('/api/mis-albumes', {
//       headers: { Authorization: `Bearer ${token}` }
//     });

//     const albumes = await res.json();
//     container.innerHTML = '';

//     if (!albumes.length) {
//       container.innerHTML = '<p class="text-muted text-center">No tenés álbumes creados aún.</p>';
//       return;
//     }

//     albumes.forEach(album => mostrarAlbum(album));
//   } catch (err) {
//     console.error('❌ Error al cargar álbumes:', err);
//     container.innerHTML = '<p class="text-danger">Error al cargar tus álbumes.</p>';
//   }
// }


// function mostrarAlbum(album) {
//   const container = document.getElementById('albumesContainer');

//   const tagsHtml = album.tags
//     ? `<div class="mt-2">${album.tags.split(',').map(t => `<span class="badge bg-secondary me-1">#${t.trim()}</span>`).join(' ')}</div>`
//     : '';

//   const avatarUrl = album.imagen_perfil
//     ? `/uploads/${album.imagen_perfil}`
//     : '/uploads/default-avatar.png';

//   const imagenesHtml = album.imagenes.map((img, index, arr) => {
//     let colClass = 'col-md-4';
//     if (arr.length === 1) colClass = 'col-12';
//     else if (arr.length === 2) colClass = 'col-md-6';

//     return `
//       <div class="${colClass} mb-4">
//         <img src="${img.url}" class="album-img mb-2" alt="Imagen">
//         <div class="comentarios-imagen mb-2" id="comentarios-imagen-${img.id}"></div>
//         <form class="form-comentar-imagen d-flex mt-1" data-imagen-id="${img.id}">
//           <input type="text" class="form-control form-control-sm me-2" placeholder="Escribí un comentario..." required>
//           <button type="submit" class="btn btn-primary btn-sm">Enviar</button>
//         </form>
//       </div>
//     `;
//   }).join('');

//   // Función embebida para texto legible de visibilidad
//   function textoVisibilidad(vis) {
//     switch (vis) {
//       case 'privada': return 'Privada (solo vos)';
//       case 'solo_seguidores': return 'Solo seguidores';
//       case 'compartida': return 'Compartida (personalizada)';
//       default: return 'Desconocida';
//     }
//   }

//   const card = document.createElement('div');
//   card.className = 'card mb-3 album-card';

//   card.innerHTML = `
//     <div class="card-header d-flex align-items-center">
//       <img src="${avatarUrl}" alt="Avatar" class="rounded-circle me-2" style="width: 40px; height: 40px;">
//       <div>
//         <strong>${album.titulo}</strong><br>
//         <small class="text-muted">
//           Creado por: <strong>${album.usuario_nombre} ${album.usuario_apellido}</strong> · 
//           ${new Date(album.fecha_creacion).toLocaleString()} 
          
//         </small>
//         <span class="badge bg-info text-dark">${textoVisibilidad(album.visibilidad)}</span>
//         ${tagsHtml}
//       </div>
//     </div>
//     <div class="card-body row" style="max-width: 1300px; margin: auto;">
//       ${imagenesHtml}
//     </div>
//     <div class="card-footer">
//       <div class="comentarios-container" id="comentarios-${album.id}">
//         <p class="text-muted">Cargando comentarios...</p>
//       </div>
//       <form class="form-comentar" data-album-id="${album.id}">
//         <textarea class="form-control mb-2" rows="2" placeholder="Escribí un comentario sobre el álbum..." required></textarea>
//         <button type="submit" class="btn btn-primary btn-sm">Enviar</button>
//       </form>
//     </div>
//   `;

//   container.prepend(card);

//   cargarComentarios(album.id);
//   album.imagenes.forEach(img => cargarComentariosImagen(img.id));
// }


// //CARGAR COMENTARIOS DE ALBUM CON IMAGEN PERFIL
// async function cargarComentarios(albumId) {
//   const token = localStorage.getItem('authToken');
//   const contenedor = document.getElementById(`comentarios-${albumId}`);
//   const usuarioActual = JSON.parse(localStorage.getItem('currentUser'));

//   try {
//     const res = await fetch(`/api/albumes/${albumId}/comentarios`, {
//       headers: { Authorization: `Bearer ${token}` }
//     });

//     const comentarios = await res.json();

//     if (!comentarios.length) {
//       contenedor.innerHTML = '<p class="text-muted">Sin comentarios aún.</p>';
//       return;
//     }

//     contenedor.innerHTML = comentarios.map(c => {
//       const avatarUrl = c.imagen_perfil ? `/uploads/${c.imagen_perfil}` : '/uploads/default-avatar.png';

//       // Botón de denuncia solo si no es el autor del comentario
//       const botonDenuncia = c.usuario_id !== usuarioActual.id
//         ? `<button class="btn btn-sm btn-outline-danger btn-denunciar-comentario-album"
//       data-comentario-id="${c.id}"
//       data-album-id="${albumId}"
//       style="padding: 2px 8px; font-size: 0.75rem; margin-top: -15px;">
//      <i class="bi bi-flag-fill"></i> Denunciar
//      </button>`
//         : '';

//       return `
//         <div class="comentario mb-2 d-flex align-items-start">
//           <img src="${avatarUrl}" alt="Avatar" class="rounded-circle me-2" style="width: 40px; height: 40px; margin-top: 3px;">
//           <div class="w-100">
//             <div class="d-flex align-items-center">
//               <div class="me-2">
//                 <strong>${c.nombre} ${c.apellido}</strong>: <span>${c.comentario}</span><br>
//                 <small class="text-muted">${new Date(c.fecha).toLocaleString()}</small>
//               </div>
//               ${botonDenuncia}
//             </div>
//           </div>
//         </div>
//       `;
//     }).join('');
//   } catch (err) {
//     console.error('❌ Error al cargar comentarios del álbum:', err);
//     contenedor.innerHTML = '<p class="text-danger">Error al cargar comentarios del álbum.</p>';
//   }
// }


// //evento del boton denunciar comentario album
// document.addEventListener('click', e => {
//   if (e.target.classList.contains('btn-denunciar-comentario-album')) {
//     const comentarioId = e.target.dataset.comentarioId;
//     // const albumId = e.target.dataset.albumId;

//     // Preparar y mostrar modal de denuncia
//     document.getElementById('denunciaTipo').value = 'comentario_album';
//     document.getElementById('denunciaId').value = comentarioId;

//     const modal = new bootstrap.Modal(document.getElementById('modalDenuncia'));
//     modal.show();
//   }
// });






// document.getElementById('btnConfirmarDenuncia').addEventListener('click', async () => {
//   const tipo = document.getElementById('denunciaTipo').value;    // Ej: 'comentario_album'
//   const id = document.getElementById('denunciaId').value;        // id del comentario denunciado
//   const motivo = document.getElementById('motivo').value;
//   const detalle = document.getElementById('detalle').value.trim();
//   const mensajeFeedback = document.getElementById('mensajeDenuncia');

//   if (!motivo) {
//     // Mostrar error si no hay motivo
//     mensajeFeedback.textContent = '⚠️ Por favor, selecciona un motivo para la denuncia.';
//     mensajeFeedback.className = 'text-danger mt-2';
//     return;
//   }

//   try {
//     const token = localStorage.getItem('authToken');
//     const res = await fetch('/api/denuncias-albumes', {   // Ruta que crea denuncias para álbumes
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json',
//         'Authorization': `Bearer ${token}`
//       },
//       body: JSON.stringify({
//         tipo_contenido: tipo,
//         id_contenido_denunciado: id,
//         motivo: detalle ? `${motivo}: ${detalle}` : motivo
//       })
//     });

//     if (res.ok) {
//       mensajeFeedback.textContent = '✅ Denuncia realizada con éxito.';
//       mensajeFeedback.className = 'text-white bg-success p-1 rounded';

//       setTimeout(() => {
//         const modal = bootstrap.Modal.getInstance(document.getElementById('modalDenuncia'));
//         if (modal) {
//           modal.hide();
//         }
//         document.getElementById('motivo').value = 'contenido_ofensivo'; // O valor por defecto que quieras
//         document.getElementById('detalle').value = '';
//         mensajeFeedback.textContent = '';
//         mensajeFeedback.className = '';
//       }, 1500);

//     } else {
//       const error = await res.json();
//       mensajeFeedback.textContent = '❌ Error al enviar la denuncia: ' + (error.mensaje || 'Error desconocido.');
//       mensajeFeedback.className = 'text-danger mt-2';
//     }
//   } catch (error) {
//     console.error('Error al enviar denuncia:', error);
//     mensajeFeedback.textContent = '❌ Error de conexión al enviar denuncia.';
//     mensajeFeedback.className = 'text-danger mt-2';
//   }
// });



// async function cargarComentariosImagen(imagenId) {
//   const container = document.getElementById(`comentarios-imagen-${imagenId}`);
//   const token = localStorage.getItem('authToken');
//   const usuarioActual = JSON.parse(localStorage.getItem('currentUser'));

//   if (!container || !token || !usuarioActual) return;

//   let lista = container.querySelector('.comentarios-list');
//   if (!lista) {
//     lista = document.createElement('div');
//     lista.className = 'comentarios-list';
//     container.prepend(lista);
//   }

//   try {
//     const res = await fetch(`/api/imagenes/${imagenId}/comentarios`, {
//       headers: { Authorization: `Bearer ${token}` }
//     });

//     const comentarios = await res.json();
//     lista.innerHTML = '';

//     if (!comentarios.length) {
//       lista.innerHTML = '<p class="text-muted small">Sin comentarios todavía.</p>';
//       return;
//     }

//     comentarios.forEach(c => {
//       const usuario = `${c.nombre || ''} ${c.apellido || ''}`.trim() || 'Anónimo';
//       const texto = c.comentario || c.contenido || '';
//       const fecha = c.fecha || c.fecha_creacion || '';
//       const avatarUrl = c.imagen_perfil ? `/uploads/${c.imagen_perfil}` : '/uploads/default-avatar.png';

//       // Botón de denuncia solo si no es del usuario actual
//       const botonDenuncia = c.usuario_id !== usuarioActual.id
//         ? `<button class="btn btn-sm btn-outline-danger btn-denuncia-comentario-album"
//              data-tipo="comentario_imagen_album"
//              data-id="${c.id}"
//              data-img-id="${imagenId}"
//              style="font-size: 0.375rem; padding: 1px 6px; font-size: 0.75rem; margin-top: -15px;">
//              <i class="bi bi-flag-fill"></i> 
//            </button>`
//         : '';

//       const div = document.createElement('div');
//       div.className = 'comentario-item mb-2 d-flex align-items-start';

//       div.innerHTML = `
//         <img src="${avatarUrl}" alt="Avatar" class="rounded-circle me-2" style="width: 35px; height: 35px; margin-top: 3px;">
//         <div class="w-100">
//           <div class="d-flex align-items-center justify-content-between">
//             <div>
//               <strong>${usuario}:</strong> ${texto}<br>
//               <small class="text-muted">${new Date(fecha).toLocaleString()}</small>
//             </div>
//             ${botonDenuncia}
//           </div>
//         </div>
//       `;

//       lista.appendChild(div);
//     });
//   } catch (err) {
//     console.error(`❌ Error al cargar comentarios de imagen ${imagenId}:`, err);
//     lista.innerHTML = '<p class="text-danger small">Error al cargar comentarios.</p>';
//   }
// }

// document.addEventListener('click', e => {
//   const btn = e.target.closest('.btn-denuncia-comentario-album');
//   if (btn) {
//     // Obtener datos del botón
//     const tipo = btn.dataset.tipo;         // debe ser "comentario_imagen_album"
//     const id = btn.dataset.id;             // id del comentario
//    // const imgId = btn.dataset.imgId;       // id de la imagen (opcional)

//     // Poner valores en inputs ocultos o campos del modal
//     document.getElementById('denunciaTipo').value = tipo;
//     document.getElementById('denunciaId').value = id;

//     // Opcional: guardar imagenId en campo oculto si lo usas
//     // const imgIdInput = document.getElementById('denunciaImagenId');
//     // if (imgIdInput) {
//     //   imgIdInput.value = imgId;
//     // }

//     // Mostrar modal con Bootstrap 5
//     const modalEl = document.getElementById('modalDenuncia');
//     const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
//     modal.show();
//   }
// });


// // =================== EVENTOS ======================

// // ✅ Único listener para comentarios de imagen
// document.addEventListener('submit', async (e) => {
//   if (e.target.classList.contains('form-comentar-imagen')) {
//     e.preventDefault();

//     const form = e.target;
//     const imagenId = form.dataset.imagenId;
//     const input = form.querySelector('input');
//     const comentario = input.value.trim();
//     const token = localStorage.getItem('authToken');

//     if (!comentario) {
//       return alert('El comentario no puede estar vacío.');
//     }

//     try {
//       const res = await fetch(`/api/imagenes/${imagenId}/comentarios`, {
//         method: 'POST',
//         headers: {
//           'Content-Type': 'application/json',
//           Authorization: `Bearer ${token}`
//         },
//         body: JSON.stringify({ contenido: comentario })
//       });

//       if (!res.ok) throw new Error('Error al comentar');

//       input.value = '';
//       cargarComentariosImagen(imagenId);
//     } catch (err) {
//       console.error('❌ Error al enviar comentario de imagen:', err);
//       alert('Ocurrió un error al comentar la imagen.');
//     }
//   }

//   if (e.target.classList.contains('form-comentar')) {
//     e.preventDefault();

//     const form = e.target;
//     const albumId = form.dataset.albumId;
//     const textarea = form.querySelector('textarea');
//     const contenido = textarea.value.trim();
//     const token = localStorage.getItem('authToken');

//     if (!contenido) {
//       return alert('El comentario no puede estar vacío.');
//     }

//     try {
//       const res = await fetch(`/api/albumes/${albumId}/comentarios`, {
//         method: 'POST',
//         headers: {
//           'Content-Type': 'application/json',
//           Authorization: `Bearer ${token}`
//         },
//         body: JSON.stringify({ contenido })
//       });

//       if (!res.ok) throw new Error('Error al enviar comentario de álbum');

//       textarea.value = '';
//       cargarComentarios(albumId);
//     } catch (err) {
//       console.error('❌ Error al enviar comentario de álbum:', err);
//       alert('Error al enviar el comentario del álbum.');
//     }
//   }
// });

// // =================== BÚSQUEDA ======================

// async function buscarAlbumes(query) {
//   const token = localStorage.getItem('authToken');

//   try {
//     const params = new URLSearchParams();
//     if (query.startsWith('#')) {
//       params.append('tag', query.slice(1).toLowerCase());
//     } else {
//       params.append('titulo', query);
//     }

//     const res = await fetch(`/api/buscar-albumes?${params.toString()}`, {
//       headers: { Authorization: `Bearer ${token}` }
//     });

//     if (!res.ok) throw new Error('Error en la búsqueda por título o tag');

//     const albumes = await res.json();
//     const container = document.getElementById('albumesContainer');
//     container.innerHTML = '';
//     albumes.forEach(album => mostrarAlbum(album));

//   } catch (error) {
//     console.error('Error al buscar álbumes:', error);
//     const container = document.getElementById('albumesContainer');
//     container.innerHTML = '<div class="alert alert-danger text-center">Error al realizar la búsqueda.</div>';
//   }
// }
