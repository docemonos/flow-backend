require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const qs = require('qs');
const { v4: uuidv4 } = require('uuid');
const { createClient } = require('@supabase/supabase-js');
const { isEmailDeliverable } = require('./src/utils/emailValidator');

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const API_KEY = process.env.API_KEY;
const SECRET_KEY = process.env.SECRET_KEY;
const FLOW_API = 'https://www.flow.cl/api';
const WORDPRESS_DOWNGRADE_URL = 'https://www.redjudicial.cl/wp-json/custom/v1/downgrade';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const PLANES_FLOW = {
  basico: process.env.PLAN_ID_BASICO,
  premium: process.env.PLAN_ID_PREMIUM,
  elite: process.env.PLAN_ID_ELITE
};

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function generarFirmaOrdenada(params, secretKey) {
  const sortedKeys = Object.keys(params).sort();
  const stringToSign = sortedKeys.map(k => `${k}${params[k]}`).join('');
  return crypto.createHmac('sha256', secretKey).update(stringToSign).digest('hex');
}

function generarFirmaParaFlow(params, secretKey) {
  const sortedKeys = Object.keys(params).sort();
  const concatenado = sortedKeys.map(key => `${key}=${params[key]}`).join('&');
  return crypto.createHmac('sha256', secretKey).update(concatenado).digest('hex');
}

// ✅ Verificación básica
app.get('/', (req, res) => {
  res.send('✅ Backend Flow activo');
});

// ✅ Test de claves
app.get('/debug', (req, res) => {
  res.send('🔍 Claves cargadas correctamente.');
});

// ✅ Crear cliente
app.post('/crear-cliente', async (req, res) => {
  try {
    let email, name, externalId, rut, country;

    if (req.body.billing) {
      const billing = req.body.billing;
      email = billing.email;
      name = `${billing.first_name || ''} ${billing.last_name || ''}`.trim();
    } else {
      ({ email, name, externalId, rut, country } = req.body);
    }

    if (!email || !name) return res.status(400).json({ error: 'Faltan email o nombre para crear cliente' });

    const cleanEmail = email.trim().toLowerCase();
    const emailValido = await isEmailDeliverable(cleanEmail);
    if (!emailValido) return res.status(400).json({ error: 'Correo inválido o dominio sin MX' });

    if (!externalId) externalId = `cli-${uuidv4()}`;

    const params = {
      apiKey: API_KEY,
      email: cleanEmail,
      name,
      externalId,
      ...(rut && { rut }),
      ...(country && { country })
    };

    params.s = generarFirmaParaFlow(params, SECRET_KEY);

    const response = await axios.post(`${FLOW_API}/customer/create`, qs.stringify(params), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    await supabase.from('clientes').insert({ email: cleanEmail, name, external_id: externalId });

    res.json({ status: 'Cliente creado en Flow y Supabase', flowResponse: response.data });
  } catch (err) {
    console.error('❌ Error al crear cliente:', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// ✅ Crear suscripción desde ID (ya lo tenías)
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

    params.s = generarFirmaParaFlow(params, SECRET_KEY);

    const response = await axios.post(`${FLOW_API}/subscription/create`, qs.stringify(params), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    res.json({ status: '✅ Suscripción creada correctamente', flowResponse: response.data });
  } catch (err) {
    console.error('❌ Error al crear suscripción:', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// ✅ Crear suscripción por EMAIL (nuevo endpoint)
app.post('/crear-suscripcion-email', async (req, res) => {
  try {
    const { email, plan_id } = req.body;
    if (!email || !plan_id) return res.status(400).json({ error: 'Faltan email o plan_id' });

    const cleanEmail = email.trim().toLowerCase();

    // Buscar cliente
    const buscarParams = { apiKey: API_KEY, email: cleanEmail };
    const buscarFirma = generarFirmaOrdenada(buscarParams, SECRET_KEY);
    const buscarRes = await axios.post(`${FLOW_API}/customer/getByEmail`, {
      ...buscarParams,
      s: buscarFirma
    });

    const customerId = buscarRes.data.customerId;
    const commerceOrder = `orden-${uuidv4()}`;
    const urlSuccess = 'https://www.redjudicial.cl/pago-exitoso';

    const suscripcionParams = {
      apiKey: API_KEY,
      customerId,
      planId: plan_id,
      commerceOrder,
      urlSuccess,
      urlFailure: urlSuccess
    };

    const firma = generarFirmaParaFlow(suscripcionParams, SECRET_KEY);
    suscripcionParams.s = firma;

    const response = await axios.post(`${FLOW_API}/subscription/create`, qs.stringify(suscripcionParams), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    res.json({ status: '✅ Suscripción creada por email', flowResponse: response.data });
  } catch (error) {
    console.error('❌ Error en /crear-suscripcion-email:', error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

// ✅ Verificación de suscripciones
app.get('/verificar-suscripciones', async (req, res) => {
  try {
    let totalRevisadas = 0;
    let totalDegradadas = 0;

    for (const [planNombre, planId] of Object.entries(PLANES_FLOW)) {
      if (!planId) continue;

      for (const estado of [1, 4]) {
        const params = {
          apiKey: API_KEY,
          planId,
          status: estado,
          start: 0,
          limit: 100
        };

        params.s = generarFirmaParaFlow(params, SECRET_KEY);
        const url = `${FLOW_API}/subscription/list?${new URLSearchParams(params).toString()}`;
        const response = await axios.get(url);
        const suscripciones = response.data.data;

        totalRevisadas += suscripciones.length;

        for (const sub of suscripciones) {
          const { status, morose, customerExternalId } = sub;

          const degradado = (status === 4 || morose === 1);

          const { data: cliente, error: errorCliente } = await supabase
            .from('clientes')
            .select('name, email')
            .eq('external_id', customerExternalId)
            .single();

          await supabase.from('verificaciones_suscripciones').insert({
            external_id: customerExternalId,
            plan: planNombre,
            status,
            morose,
            degradado,
            nombre: cliente?.name || 'NO ENCONTRADO',
            email: cliente?.email || 'desconocido@redjudicial.cl'
          });

          if (degradado && customerExternalId) {
            try {
              await axios.post(WORDPRESS_DOWNGRADE_URL, { externalId: customerExternalId });
              totalDegradadas++;
            } catch (err) {
              console.error(`❌ Error degradando ${customerExternalId}:`, err.message);
            }
          }
        }
      }
    }

    res.json({
      success: true,
      message: '✔️ Verificación finalizada',
      totalRevisadas,
      totalDegradadas
    });
  } catch (error) {
    console.error('❌ Error verificando suscripciones:', error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
