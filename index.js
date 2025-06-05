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
const WORDPRESS_DOWNGRADE_URL = 'https://www.redjudicial.cl/wp-json/custom/v1/downgrade';

// 🔐 Firma HMAC-SHA256
function generarFirma(params, secretKey) {
  const sortedKeys = Object.keys(params).sort();
  const concatenado = sortedKeys.map(key => `${key}=${params[key]}`).join('&');
  return crypto.createHmac('sha256', secretKey).update(concatenado).digest('hex');
}

// 🔍 Confirmar carga de claves
app.get('/debug', (req, res) => {
  res.send('🔍 Claves cargadas correctamente.');
});

// 🟢 Confirmación de vida
app.get('/', (req, res) => {
  res.send('✅ Backend Flow activo');
});

// 👤 Crear cliente
app.post('/crear-cliente', async (req, res) => {
  try {
    if (req.body.webhook_id) {
      console.log('🔄 Ping recibido desde WooCommerce:', req.body);
      return res.status(200).json({ status: 'Ping OK desde WooCommerce' });
    }

    let email, name, externalId, rut, country;

    if (req.body.billing) {
      const billing = req.body.billing;
      email = billing.email;
      name = `${billing.first_name || ''} ${billing.last_name || ''}`.trim();
    } else {
      ({ email, name, externalId, rut, country } = req.body);
    }

    if (!email || !name) {
      return res.status(400).json({ error: 'Faltan email o nombre para crear cliente' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const emailValido = await isEmailDeliverable(cleanEmail);
    if (!emailValido) {
      return res.status(400).json({ error: 'Correo inválido o dominio sin MX' });
    }

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

    const response = await axios.post(`${FLOW_API}/customer/create`, qs.stringify(params), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    res.json({ status: 'Cliente creado en Flow', flowResponse: response.data });
  } catch (err) {
    console.error('❌ Error al crear cliente:', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// 🔁 Crear suscripción
app.post('/crear-suscripcion', async (req, res) => {
  try {
    const { customerId, planId, commerceOrder, urlSuccess, urlFailure } = req.body;

    if (!customerId || !planId || !commerceOrder || !urlSuccess) {
      return res.status(400).json({ error: 'Faltan parámetros obligatorios' });
    }

    const params = {
      apiKey: API_KEY,
      customerId,
      planId,
      commerceOrder,
      urlSuccess,
      urlFailure: urlFailure || urlSuccess
    };

    params.s = generarFirma(params, SECRET_KEY);

    const response = await axios.post(`${FLOW_API}/subscription/create`, qs.stringify(params), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    res.json({ status: '✅ Suscripción creada correctamente', flowResponse: response.data });
  } catch (err) {
    console.error('❌ Error al crear suscripción:', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// ⚠️ Webhook Flow: impago o cancelación
app.post('/webhook-flow', async (req, res) => {
  try {
    const { event, data } = req.body;

    console.log(`📩 Webhook recibido de Flow: ${event}`, data);

    if (event === 'subscription.failed' || event === 'subscription.canceled') {
      const externalId = data.externalId || data.customerExternalId;

      if (externalId) {
        await axios.post(WORDPRESS_DOWNGRADE_URL, { externalId });
        console.log(`⬇️ Degradado en WordPress: ${externalId}`);
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('❌ Error procesando webhook Flow:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 🔍 Verificar suscripciones (para cron job)
app.get('/verificar-suscripciones', async (req, res) => {
  try {
    const params = {
      apiKey: API_KEY
    };
    params.s = generarFirma(params, SECRET_KEY);

    const response = await axios.post(`${FLOW_API}/subscription/list`, qs.stringify(params), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const suscripciones = response.data;

    for (const sub of suscripciones) {
      if (sub.status === 'canceled' || sub.status === 'failed') {
        const externalId = sub.custom || sub.customerExternalId;

        if (externalId) {
          try {
            await axios.post(WORDPRESS_DOWNGRADE_URL, { externalId });
            console.log(`⬇️ Usuario degradado automáticamente: ${externalId}`);
          } catch (err) {
            console.error(`❌ Error degradando ${externalId}:`, err.message);
          }
        }
      }
    }

    res.json({ success: true, message: '✔️ Verificación finalizada' });
  } catch (error) {
    console.error('❌ Error en verificación de suscripciones:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// 🚀 Iniciar servidor
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
