
      const solicitarRestablecimientoForm = document.getElementById('solicitarRestablecimientoForm');
      const emailInput = document.getElementById('email');
      const mensajeElement = document.getElementById('mensaje'); // Para mensajes del servidor
      const emailLocalError = document.getElementById('emailLocalError'); // ✨ NUEVO: Para mensajes de validación local

      // Expresión regular para validar formato de email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      solicitarRestablecimientoForm.addEventListener('submit', async function(event) {
        event.preventDefault();

        // Limpiar mensajes previos (tanto global como local)
        mensajeElement.style.display = 'none';
        mensajeElement.textContent = '';
        mensajeElement.style.color = 'black'; 
        emailLocalError.style.display = 'none'; // ✨ Limpiar error local
        emailLocalError.textContent = ''; // ✨ Limpiar error local
        emailInput.classList.remove('input-error'); // Quitar borde rojo si lo tenía

        const email = emailInput.value.trim();

        if (!email) {
          emailLocalError.textContent = 'Por favor, ingresa tu correo electrónico.';
          emailLocalError.style.display = 'block'; // Mostrar el error local
          emailInput.classList.add('input-error'); // Añadir borde rojo al input
          setTimeout(() => {
            emailLocalError.style.display = 'none';
            emailLocalError.textContent = '';
            emailInput.classList.remove('input-error'); // Quitar borde rojo
          }, 3000); 
          return; 
        }

        // Validación del formato del email con expresión regular
        if (!emailRegex.test(email)) {
          emailLocalError.textContent = 'Por favor, ingresa un formato de correo electrónico válido.';
          emailLocalError.style.display = 'block'; // Mostrar el error local
          emailInput.classList.add('input-error'); // Añadir borde rojo al input
          setTimeout(() => {
            emailLocalError.style.display = 'none';
            emailLocalError.textContent = '';
            emailInput.classList.remove('input-error'); // Quitar borde rojo
          }, 3000);
          return;
        }

        // Si las validaciones locales pasan, intentar enviar al servidor
        try {
          const response = await fetch('/solicitar-restablecimiento', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email: email })
          });

          const data = await response.json(); 

          if (response.ok) { 
            mensajeElement.textContent = data.mensaje || 'Solicitud procesada con éxito.';
            mensajeElement.style.color = 'green';
            
            if (data.redireccionar) {
              mensajeElement.style.display = 'block'; 
              setTimeout(() => {
                window.location.href = '/login'; 
              }, 5000); 
            } else {
              mensajeElement.style.display = 'block';
              setTimeout(() => {
                mensajeElement.style.display = 'none';
                mensajeElement.textContent = '';
              }, 5000);
            }
            
          } else { 
            mensajeElement.textContent = data.mensaje || 'Hubo un error al procesar tu solicitud.';
            mensajeElement.style.color = 'red';
            mensajeElement.style.display = 'block';
            setTimeout(() => {
                mensajeElement.style.display = 'none';
                mensajeElement.textContent = '';
            }, 3000);
          }

        } catch (error) {
          console.error('Error al enviar la solicitud de restablecimiento:', error);
          mensajeElement.textContent = 'Error de conexión. Inténtalo de nuevo más tarde.';
          mensajeElement.style.color = 'red';
          mensajeElement.style.display = 'block';
          setTimeout(() => {
              mensajeElement.style.display = 'none';
              mensajeElement.textContent = '';
          }, 3000);
        }
      });

