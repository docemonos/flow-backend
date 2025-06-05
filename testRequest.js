// testRequest.js
require('dotenv').config();
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const API_BASE_URL = 'http://localhost:3000'; // Cambia a tu dominio en Railway si está desplegado

(async () => {
  try {
    // 📧 Email único por prueba
    const timestamp = Date.now();
    const email = `cliente.${timestamp}@docemonos.cl`;

    // 🆔 External ID generado automáticamente (puedes omitir si tu backend ya lo genera)
    const externalId = `cli-${uuidv4()}`;

    // 🧪 Payload de prueba
    const payload = {
      name: 'Cliente de Prueba',
      email,
      externalId
      // Puedes agregar rut o country si quieres
    };

    console.log('🚀 Enviando datos:', payload);

    const { data } = await axios.post(`${API_BASE_URL}/crear-cliente`, payload);
    console.log('✅ Cliente creado con éxito:', data);
  } catch (error) {
    console.error('❌ Error en la prueba:', error.response?.data || error.message);
  }
})();
