document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('authToken');
    if (!token) {
        console.warn('⚠️ No hay token disponible');
        return;
    }

    try {
        const res = await fetch('/api/perfil-usuario', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!res.ok) {
            throw new Error('Error al obtener perfil');
        }

        const data = await res.json();

        // Actualizar avatar
        const avatarImg = document.getElementById('avatar');
        if (data.imagen_perfil) {
            avatarImg.src = `/uploads/${data.imagen_perfil}`;
        } else {
            avatarImg.src = '/uploads/default-avatar.png';
        }

        // Nombre completo
        const nombreCompleto = document.getElementById('nombreCompleto');
        nombreCompleto.textContent = `${data.nombre} ${data.apellido}`;

        // Email
        const email = document.getElementById('email');
        email.textContent = data.email || 'No disponible';

        // Intereses
        const intereses = document.getElementById('intereses');
        intereses.textContent = data.intereses || 'No especificado';

        // Antecedentes
        const antecedentes = document.getElementById('antecedentes');
        antecedentes.textContent = data.antecedentes || 'No especificado';

        // Estadísticas
        document.getElementById('total_imagenes').textContent = data.total_imagenes || 0;
        document.getElementById('total_comentarios').textContent = data.total_comentarios || 0;
        document.getElementById('total_seguidores').textContent = data.total_seguidores || 0;
        document.getElementById('total_seguidos').textContent = data.total_seguidos || 0;
        document.getElementById('total_albumes').textContent = data.total_albumes || 0;
        document.getElementById('total_publicaciones').textContent = data.total_publicaciones || 0;
        document.getElementById('comentarios_hechos').textContent = data.comentarios_hechos || 0;
        document.getElementById('tiempo_en_plataforma').textContent = data.tiempo_en_plataforma || '0 días';
        //   document.getElementById('ultima_conexion').textContent = data.ultima_conexion || 'No disponible';
        if (data.ultima_conexion) {
            const fecha = new Date(data.ultima_conexion);
            const formato = fecha.toLocaleString('es-AR', {
                dateStyle: 'medium',
                timeStyle: 'short'
            });
            document.getElementById('ultima_conexion').textContent = formato;
        } else {
            document.getElementById('ultima_conexion').textContent = 'No disponible';
        }


    } catch (error) {
        console.error('❌ Error al obtener el perfil:', error);
    }
});
