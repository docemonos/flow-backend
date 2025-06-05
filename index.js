// index.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

const API_KEY = process.env.API_KEY;
const FLOW_API = 'https://www.flow.cl/api';

// Test endpoint
app.get('/', (req, res) => {
  res.send('✅ Backend Flow activo');
});

// ✅ DEBUG: Verificar si API_KEY se carga desde Railway
app.get('/debug', (req, res) => {
  console.log('🔐 API_KEY cargada desde Railway:', API_KEY);
  res.send('🔍 Revisa los logs de Railway para ver si API_KEY se imprimió correctamente.');
});

// Crear cliente
app.post('/crear-cliente', async (req, res) => {
  try {
    const { email, name, externalId } = req.body;
    if (!email || !name || !externalId) {
      return res.status(400).json({ error: 'Faltan datos obligatorios del cliente' });
    }

    const response = await axios.post(`${FLOW_API}/customer/create`, {
      apiKey: API_KEY,
      email,
      name,
      externalId
    });

    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// Crear plan de suscripción
app.post('/crear-plan', async (req, res) => {
  try {
    const { planId, name, amount, interval } = req.body;
    if (!planId || !name || !amount || !interval) {
      return res.status(400).json({ error: 'Faltan datos para crear el plan' });
    }

    const response = await axios.post(`${FLOW_API}/plan/create`, {
      apiKey: API_KEY,
      planId,
      name,
      amount,
      interval, // 1=día, 2=semana, 3=mes, 4=año
      currency: 'CLP',
      description: `Plan ${name}`
    });

    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// Crear suscripción
app.post('/crear-suscripcion', async (req, res) => {
  try {
    const { customerId, planId } = req.body;
    if (!customerId || !planId) {
      return res.status(400).json({ error: 'Faltan datos de cliente o plan' });
    }

    const response = await axios.post(`${FLOW_API}/subscription/create`, {
      apiKey: API_KEY,
      customerId,
      planId,
      urlCallback: 'https://api-flow.up.railway.app/webhook-flow',
      urlReturn: 'https://tusitio.cl/suscripcion-exitosa',
      urlCancel: 'https://tusitio.cl/suscripcion-cancelada'
    });

    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// Webhook para pagos de Flow
app.post('/webhook-flow', async (req, res) => {
  console.log('💰 Webhook recibido de Flow:', req.body);
  const { status, customerEmail } = req.body;

  try {
    if (status === 'paid') {
      await axios.post('https://tusitio.cl/wp-json/flow/membership-activate', {
        email: customerEmail,
        plan: 'premium'
      });
    } else if (status === 'failed') {
      await axios.post('https://tusitio.cl/wp-json/flow/membership-downgrade', {
        email: customerEmail
      });
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error('❌ Error al contactar WordPress:', err.message);
    res.status(500).send('ERROR');
  }
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
