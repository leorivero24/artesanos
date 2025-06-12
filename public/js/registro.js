
      // Expresión regular para una validación de email más robusta
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/; 

      const registroForm = document.getElementById('registroForm');
      const nombreInput = document.getElementById('nombre');
      const apellidoInput = document.getElementById('apellido'); 
      const emailInput = document.getElementById('email');
      const contrasenaInput = document.getElementById('contrasena');

      const nombreError = document.getElementById('nombreError');
      const apellidoError = document.getElementById('apellidoError'); 
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

      registroForm.addEventListener('submit', function(event) {
        // Ocultar todos los mensajes de error JS y el mensaje del servidor antes de revalidar
        hideError(nombreError);
        hideError(apellidoError); 
        hideError(emailError);
        hideError(contrasenaError);
        if (mensajeElement) { 
          mensajeElement.style.display = 'none'; 
        }

        let isValid = true;

        // Validar Nombre
        if (nombreInput.value.trim() === '') {
          showError(nombreError, 'El nombre es obligatorio.');
          isValid = false;
        } else if (nombreInput.value.trim().length < 3) {
          showError(nombreError, 'El nombre debe tener al menos 3 caracteres.');
          isValid = false;
        } else if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑ]+$/.test(nombreInput.value.trim())) { // ✨ CAMBIO AQUÍ: Eliminado '\s'
          showError(nombreError, 'El nombre solo puede contener letras y sin espacios.'); // ✨ Mensaje actualizado
          isValid = false;
        }

        // Validar Apellido
        if (apellidoInput.value.trim() === '') {
          showError(apellidoError, 'El apellido es obligatorio.');
          isValid = false;
        } else if (apellidoInput.value.trim().length < 3) {
          showError(apellidoError, 'El apellido debe tener al menos 3 caracteres.');
          isValid = false;
        } else if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑ]+$/.test(apellidoInput.value.trim())) { // ✨ CAMBIO AQUÍ: Eliminado '\s'
          showError(apellidoError, 'El apellido solo puede contener letras y sin espacios.'); // ✨ Mensaje actualizado
          isValid = false;
        }

        // Validar Correo Electrónico
        if (emailInput.value.trim() === '') {
          showError(emailError, 'El correo electrónico es obligatorio.');
          isValid = false;
        } else if (!emailRegex.test(emailInput.value.trim())) { 
          showError(emailError, 'Por favor, introduce un correo electrónico válido.');
          isValid = false;
        }

        // Validar Contraseña
        if (contrasenaInput.value.trim() === '') {
          showError(contrasenaError, 'La contraseña es obligatoria.');
          isValid = false;
        } else if (contrasenaInput.value.trim().length < 6) {
          showError(contrasenaError, 'La contraseña debe tener al menos 6 caracteres.');
          isValid = false;
        }

        if (!isValid) {
          event.preventDefault(); 
        }
      });

      // Lógica para ocultar el mensaje del servidor después de un tiempo
      // (Esto solo aplica si el servidor responde con res.render y no con res.send HTML directo)
      const mensaje = "#{mensaje}"; 
      const tipo = "#{tipo}";       
      
      if (mensaje && mensajeElement) { 
        if (tipo === "error") { 
          setTimeout(() => {
            mensajeElement.style.display = "none";
          }, 5000); 
        }
      }