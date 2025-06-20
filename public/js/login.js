
    
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

      const loginForm = document.getElementById('loginForm');
      const emailInput = document.getElementById('email');
      const contrasenaInput = document.getElementById('contrasena');
      const emailError = document.getElementById('emailError');
      const contrasenaError = document.getElementById('contrasenaError');
      const mensajeElement = document.getElementById('mensaje');

      function showError(element, message) {
        element.textContent = message;
        element.style.display = 'block';
        if (element.previousElementSibling) {
          element.previousElementSibling.classList.add('input-error');
        }
      }

      function hideError(element) {
        element.textContent = '';
        element.style.display = 'none';
        if (element.previousElementSibling) {
          element.previousElementSibling.classList.remove('input-error');
        }
      }

      if (loginForm) {
        loginForm.addEventListener('submit', async function(event) {
          event.preventDefault();

          hideError(emailError);
          hideError(contrasenaError);
          if (mensajeElement) {
            mensajeElement.style.display = 'none';
            mensajeElement.textContent = '';
          }

          let isValid = true;

          if (emailInput.value.trim() === '') {
            showError(emailError, 'El correo electrónico es obligatorio.');
            isValid = false;
          } else if (!emailRegex.test(emailInput.value.trim())) {
            showError(emailError, 'Por favor, introduce un correo electrónico válido.');
            isValid = false;
          }

          if (contrasenaInput.value.trim() === '') {
            showError(contrasenaError, 'La contraseña es obligatoria.');
            isValid = false;
          }

          if (!isValid) {
            return;
          }

          try {
            const response = await fetch('/login', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                email: emailInput.value.trim(),
                contrasena: contrasenaInput.value.trim()
              })
            });

            const data = await response.json();

            if (response.ok) {
              // ✨ CAMBIOS CLAVE AQUÍ: Guardar el token y usuario en localStorage
              if (data.token) {
                localStorage.setItem('authToken', data.token); // Guardar el token
                console.log('Token JWT guardado en localStorage.');
              } else {
                console.warn('Inicio de sesión exitoso pero no se recibió ningún token.');
              }
              if (data.usuario) {
                // Puedes guardar el objeto usuario o partes de él si es necesario
                localStorage.setItem('currentUser', JSON.stringify(data.usuario));
                console.log('Datos de usuario guardados en localStorage:', data.usuario);
              }

              window.location.href = '/dashboard'; // Redirigir al dashboard
            } else {
              showError(mensajeElement, data.mensaje || 'Error desconocido al iniciar sesión.');
              mensajeElement.style.color = 'red';
            }
          } catch (error) {
            console.error('Error al enviar la solicitud de login:', error);
            showError(mensajeElement, 'Hubo un problema de conexión. Inténtalo de nuevo.');
            mensajeElement.style.color = 'red';
          }
        });
      } else {
        console.error('Error: No se encontró el elemento con ID "loginForm". El script no se ejecutará.');
      }

      // La función logout en login.pug no es necesaria, normalmente va en dashboard.pug
      // Si esta función logout es solo para pruebas o ya la tenías, no debería ejecutarse aquí.
      // La mantengo sin cambios por si acaso, pero su lugar natural es en el dashboard.
      async function logout() {
        try {
          const response = await fetch('/logout', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            }
          });
          if (response.ok) {
            console.log('Sesión cerrada desde el servidor.');
            // Con localStorage, el cliente es responsable de borrar su token
            localStorage.removeItem('authToken');
            localStorage.removeItem('currentUser'); // Borrar también los datos del usuario si se guardaron
            window.location.href = '/login';
          } else {
            const errorData = await response.json();
            console.error('Error al cerrar sesión:', errorData.mensaje);
            alert('Hubo un problema al cerrar sesión.');
          }
        } catch (error) {
          console.error('Error de red al intentar cerrar sesión:', error);
          alert('Error de conexión al intentar cerrar sesión.');
        }
      }