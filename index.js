// index.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const qs = require('qs');
const { v4: uuidv4 } = require('uuid');
const { isEmailDeliverable } = require('./src/utils/emailValidator');

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const API_KEY = process.env.API_KEY;
const SECRET_KEY = process.env.SECRET_KEY;
const FLOW_API = 'https://www.flow.cl/api';

// 🔐 Utilidad para calcular firma HMAC-SHA256
function generarFirma(params, secretKey) {
  const sortedKeys = Object.keys(params).sort();
  const concatenado = sortedKeys.map(key => `${key}=${params[key]}`).join('&');
  return crypto.createHmac('sha256', secretKey).update(concatenado).digest('hex');
}

// 🧪 DEBUG: Mostrar claves cargadas
app.get('/debug', (req, res) => {
  console.log('🔐 API_KEY:', API_KEY);
  console.log('🔐 SECRET_KEY:', SECRET_KEY);
  res.send('🔍 Claves cargadas correctamente. Revisa Railway Logs.');
});

// 🟢 Test backend activo
app.get('/', (req, res) => {
  res.send('✅ Backend Flow activo');
});

// 👤 Crear cliente en Flow
app.post('/crear-cliente', async (req, res) => {
  try {
    let { email, name, externalId, rut, country } = req.body;

    if (!email || !name) {
      return res.status(400).json({ error: 'Faltan parámetros obligatorios: email y name' });
    }

    // 🧹 Limpiar y validar el correo
    const cleanEmail = email.trim().toLowerCase();
    const emailValido = await isEmailDeliverable(cleanEmail);

    if (!emailValido) {
      return res.status(400).json({ error: 'Correo inválido o dominio sin MX' });
    }

    // 🔁 Generar externalId único si no se entrega
    if (!externalId) {
      externalId = `cli-${uuidv4()}`;
    }

    const params = {
      apiKey: API_KEY,
      email: cleanEmail,
      name,
      externalId,
      ...(rut && { rut }),
      ...(country && { country })
    };

    params.s = generarFirma(params, SECRET_KEY);

    console.log('📦 Enviando a Flow:', params);

    const response = await axios.post(`${FLOW_API}/customer/create`, qs.stringify(params), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    res.json(response.data);
  } catch (err) {
    console.error('❌ Error al crear cliente:', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// 🚀 Iniciar servidor en puerto Railway
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
