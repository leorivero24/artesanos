
      const restablecerContrasenaForm = document.getElementById('restablecerContrasenaForm');
      const nuevaContrasenaInput = document.getElementById('nuevaContrasena');
      const confirmarContrasenaInput = document.getElementById('confirmarContrasena');
      const tokenInput = document.getElementById('token'); 
      const nuevaContrasenaError = document.getElementById('nuevaContrasenaError'); 
      const confirmarContrasenaError = document.getElementById('confirmarContrasenaError'); 
      const mensajeElement = document.getElementById('mensaje'); 

      function getParameterByName(name, url = window.location.href) {
        name = name.replace(/[\[\]]/g, '\\$&');
        var regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)'),
            results = regex.exec(url);
        if (!results) return null;
        if (!results[2]) return '';
        return decodeURIComponent(results[2].replace(/\+/g, ' '));
      }

      if (!tokenInput.value) {
        tokenInput.value = getParameterByName('token');
      }

      function showLocalError(element, message, inputElement) {
        element.textContent = message;
        element.style.display = 'block';
        if (inputElement) {
          inputElement.classList.add('input-error');
        }
      }

      function hideLocalError(element, inputElement) {
        element.textContent = '';
        element.style.display = 'none';
        if (inputElement) {
          inputElement.classList.remove('input-error');
        }
      }

      function showGlobalMessage(element, message, color) {
        element.textContent = message;
        element.style.color = color;
        element.style.display = 'block';
      }

      function hideGlobalMessage(element) {
        element.textContent = '';
        element.style.display = 'none';
      }

      restablecerContrasenaForm.addEventListener('submit', async function(event) {
        event.preventDefault();

        hideLocalError(nuevaContrasenaError, nuevaContrasenaInput);
        hideLocalError(confirmarContrasenaError, confirmarContrasenaInput);
        hideGlobalMessage(mensajeElement);

        const nuevaContrasena = nuevaContrasenaInput.value;
        const confirmarContrasena = confirmarContrasenaInput.value; 
        const token = tokenInput.value;

        let valid = true;

        if (!nuevaContrasena) {
            showLocalError(nuevaContrasenaError, 'Por favor, ingresa tu nueva contraseña.', nuevaContrasenaInput);
            valid = false;
        }
        if (!confirmarContrasena) {
            showLocalError(confirmarContrasenaError, 'Por favor, confirma tu nueva contraseña.', confirmarContrasenaInput);
            valid = false;
        }

        if (valid) { 
            if (nuevaContrasena.length < 6) {
                showLocalError(nuevaContrasenaError, 'La contraseña debe tener al menos 6 caracteres.', nuevaContrasenaInput);
                valid = false;
            }
            if (nuevaContrasena !== confirmarContrasena) {
                showLocalError(confirmarContrasenaError, 'Las contraseñas no coinciden.', confirmarContrasenaInput);
                valid = false;
            }
        }

        if (!token) {
            showGlobalMessage(mensajeElement, 'Token de restablecimiento no encontrado. Por favor, vuelve a solicitar un enlace.', 'red');
            setTimeout(() => { hideGlobalMessage(mensajeElement); }, 3000);
            return;
        }

        if (!valid) {
          setTimeout(() => {
              hideLocalError(nuevaContrasenaError, nuevaContrasenaInput);
              hideLocalError(confirmarContrasenaError, confirmarContrasenaInput);
          }, 3000); 
          return;
        }
        
        try {
          const response = await fetch('/restablecer-contrasena', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ token, nuevaContrasena })
          });

          const data = await response.json();

          if (response.ok) {
            showGlobalMessage(mensajeElement, data.mensaje || 'Tu contraseña ha sido restablecida exitosamente. Redirigiendo al login...', 'green');

            setTimeout(() => {
              window.location.href = '/login';
            }, 3000); 

          } else {
            showGlobalMessage(mensajeElement, data.mensaje || 'Hubo un error al restablecer tu contraseña. El token podría ser inválido o haber expirado.', 'red');
            setTimeout(() => { hideGlobalMessage(mensajeElement); }, 3000);
          }

        } catch (error) {
          console.error('Error en la solicitud de restablecimiento:', error);
          showGlobalMessage(mensajeElement, 'Error de conexión. Inténtalo de nuevo más tarde.', 'red');
          setTimeout(() => { hideGlobalMessage(mensajeElement); }, 3000);
        }
      });
    