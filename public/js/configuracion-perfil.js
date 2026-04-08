// Toast para el formulario de editar perfil (toast con id liveToastDatos)
function mostrarToastPerfil(mensaje, tipo = 'info') {
  const toastEl = document.getElementById('liveToastDatos');
  if (!toastEl) return;

  const toastBody = toastEl.querySelector('.toast-body');
  const toastHeader = toastEl.querySelector('.toast-header strong');
  if (!toastBody || !toastHeader) return;

  toastBody.textContent = mensaje;

  switch (tipo) {
    case 'success':
      toastHeader.textContent = 'Éxito';
      toastEl.classList.remove('bg-danger', 'bg-info');
      toastEl.classList.add('bg-success', 'text-white');
      break;
    case 'error':
      toastHeader.textContent = 'Error';
      toastEl.classList.remove('bg-success', 'bg-info');
      toastEl.classList.add('bg-danger', 'text-white');
      break;
    default:
      toastHeader.textContent = 'Información';
      toastEl.classList.remove('bg-success', 'bg-danger');
      toastEl.classList.add('bg-info', 'text-white');
  }

  const toast = new bootstrap.Toast(toastEl);
  toast.show();
}

// Toast para el formulario de cambiar contraseña (toast con id liveToast)
function mostrarToastPassword(mensaje, tipo = 'info') {
  const toastEl = document.getElementById('liveToast');
  if (!toastEl) return;

  const toastBody = toastEl.querySelector('.toast-body');
  const toastHeader = toastEl.querySelector('.toast-header strong');
  if (!toastBody || !toastHeader) return;

  toastBody.textContent = mensaje;

  switch (tipo) {
    case 'success':
      toastHeader.textContent = 'Éxito';
      toastEl.classList.remove('bg-danger', 'bg-info');
      toastEl.classList.add('bg-success', 'text-white');
      break;
    case 'error':
      toastHeader.textContent = 'Error';
      toastEl.classList.remove('bg-success', 'bg-info');
      toastEl.classList.add('bg-danger', 'text-white');
      break;
    default:
      toastHeader.textContent = 'Información';
      toastEl.classList.remove('bg-success', 'bg-danger');
      toastEl.classList.add('bg-info', 'text-white');
  }

  const toast = new bootstrap.Toast(toastEl);
  toast.show();
}

function mostrarError(idElemento, mensaje) {
  const div = document.getElementById(idElemento);
  if (!div) return;
  div.textContent = mensaje;
  div.style.display = 'block';
}

function limpiarErrores() {
  const errores = document.querySelectorAll('div.text-danger');
  errores.forEach((div) => {
    div.textContent = '';
    div.style.display = 'none';
  });
}


// Código para formulario editar perfil
document.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('authToken');
  const form = document.getElementById('formEditarPerfil');
  if (!token || !form) return;

  let cambiosDetectados = false;
  const valoresIniciales = {};

  try {
    const res = await fetch('/api/perfil', {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) throw new Error('No autorizado');
    const usuario = await res.json();

    // Inputs
    const inputNombre = document.getElementById('inputNombre');
    const inputApellido = document.getElementById('inputApellido');
    const inputEmail = document.getElementById('inputEmail');
    const inputIntereses = document.getElementById('inputIntereses');
    const inputAntecedentes = document.getElementById('inputAntecedentes');

    inputNombre.value = valoresIniciales.nombre = usuario.nombre || '';
    inputApellido.value = valoresIniciales.apellido = usuario.apellido || '';
    inputEmail.value = valoresIniciales.email = usuario.email || '';
    inputIntereses.value = valoresIniciales.intereses = usuario.intereses || '';
    inputAntecedentes.value = valoresIniciales.antecedentes = usuario.antecedentes || '';

    [inputNombre, inputApellido, inputIntereses, inputAntecedentes].forEach((input) => {
      if (input) {
        input.addEventListener('input', () => (cambiosDetectados = true));
        input.addEventListener('change', () => (cambiosDetectados = true));
      }
    });
  } catch (error) {
    console.error('Error al cargar perfil:', error);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    limpiarErrores();

    if (!cambiosDetectados) {
      mostrarToastPerfil('No realizaste ningún cambio.', 'info');
      return;
    }

    const formData = new FormData(form);
    const camposPerfil = ['nombre', 'apellido', 'intereses', 'antecedentes'];
    const algunoConValor = camposPerfil.some(campo => {
      const valor = formData.get(campo);
      return valor?.trim() !== '';
    });

    if (!algunoConValor) {
      mostrarToastPerfil('Debes completar al menos un campo para guardar cambios.', 'error');
      return;
    }

    try {
      const res = await fetch('/api/perfil', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      const result = await res.json();

      if (!res.ok) {
        if (result.errores) {
          for (const campo in result.errores) {
            mostrarError(`error${campo}`, result.errores[campo]);
          }
        } else {
          mostrarToastPerfil(result.mensaje || 'Error al actualizar perfil', 'error');
        }
      } else {
        mostrarToastPerfil('Perfil actualizado correctamente.', 'success');

        form.reset();

        setTimeout(() => {
          window.location.reload();
        }, 3000); 
       



        const user = JSON.parse(localStorage.getItem('currentUser'));
        const nuevoNombre = formData.get('nombre')?.trim();
        const nuevoApellido = formData.get('apellido')?.trim();

        if (nuevoNombre) user.nombre = nuevoNombre;
        if (nuevoApellido) user.apellido = nuevoApellido;

        const userNameSpan = document.getElementById('userName');
        if (userNameSpan) userNameSpan.textContent = `${user.nombre} ${user.apellido}`;

        localStorage.setItem('currentUser', JSON.stringify(user));
        cambiosDetectados = false;
      }
    } catch (error) {
      console.error('Error al enviar perfil:', error);
      mostrarToastPerfil('Error al actualizar perfil.', 'error');
    }
  });
});


// Código para formulario cambiar contraseña
document.getElementById('formCambiarPassword').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const passwordNueva = form.passwordNueva.value.trim();
  const passwordConfirmar = form.passwordConfirmar.value.trim();
  const authToken = localStorage.getItem('authToken');

  // Limpiar errores
  ['errorNuevaPassword', 'errorRepetirPassword', 'errorGeneral'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  if (!passwordNueva || !passwordConfirmar) {
    mostrarToastPassword('Por favor, completa todos los campos.', 'error');
    return; // no enviar
  }

  if (passwordNueva.length < 6) {
    mostrarError('errorNuevaPassword', 'Debe tener al menos 6 caracteres.');
    return; // no enviar
  }

  if (passwordNueva !== passwordConfirmar) {
    mostrarError('errorRepetirPassword', 'Las contraseñas no coinciden.');
    return; // no enviar
  }

  try {
    const res = await fetch('/api/perfil/password', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ passwordNueva, passwordConfirmar })
    });

    const result = await res.json();

    if (res.ok) {
      mostrarToastPassword('Contraseña actualizada correctamente.', 'success');
      form.reset();
    } else {
      if (result.errores) {
        if (result.errores.includes('Todos los campos son obligatorios')) {
          mostrarToastPassword('Por favor, completa todos los campos.', 'error');
        }
        if (result.errores.includes('Las contraseñas no coinciden')) {
          mostrarError('errorRepetirPassword', 'Las contraseñas no coinciden.');
        }
        if (result.errores.includes('La nueva contraseña debe tener al menos 6 caracteres')) {
          mostrarError('errorNuevaPassword', 'Debe tener al menos 6 caracteres.');
        }
      } else {
        mostrarToastPassword('Ocurrió un error inesperado.', 'error');
      }
    }
  } catch (error) {
    console.error('Error en la solicitud:', error);
    mostrarToastPassword('Error de conexión al servidor.', 'error');
  }
});
