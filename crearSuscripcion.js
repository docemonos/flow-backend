// crearSuscripcion.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

const router = express.Router();

router.post('/crear-suscripcion', async (req, res) => {
  try {
    const { email, plan_id } = req.body;
    const apiKey = process.env.API_KEY;
    const secretKey = process.env.SECRET_KEY;
    const urlCallback = 'https://www.redjudicial.cl/webhook-flow';

    if (!email || !plan_id) {
      return res.status(400).json({ error: 'Faltan parámetros obligatorios' });
    }

    // Paso 1: Buscar o crear cliente
    const clienteId = await obtenerOCrearCliente(email, apiKey, secretKey);

    // Paso 2: Crear suscripción
    const params = {
      apiKey,
      customerId: clienteId,
      planId: plan_id,
      urlCallback,
    };

    const signature = firmarParametros(params, secretKey);
    const body = { ...params, s: signature };

    const { data } = await axios.post('https://www.flow.cl/api/subscription/create', body);

    console.log('✅ Suscripción creada correctamente:', data);
    res.status(200).json(data);

  } catch (error) {
    console.error('❌ Error al crear suscripción:', error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

async function obtenerOCrearCliente(email, apiKey, secretKey) {
  const buscarParams = { apiKey, email };
  const buscarFirma = firmarParametros(buscarParams, secretKey);
  const buscarRes = await axios.post('https://www.flow.cl/api/customer/getByEmail', {
    ...buscarParams,
    s: buscarFirma,
  });

  if (buscarRes.data && buscarRes.data.customerId) {
    console.log('📌 Cliente encontrado:', buscarRes.data.customerId);
    return buscarRes.data.customerId;
  }

  // Crear cliente si no existe
  const crearParams = { apiKey, email };
  const crearFirma = firmarParametros(crearParams, secretKey);
  const crearRes = await axios.post('https://www.flow.cl/api/customer/create', {
    ...crearParams,
    s: crearFirma,
  });

  console.log('🆕 Cliente creado:', crearRes.data.customerId);
  return crearRes.data.customerId;
}

function firmarParametros(params, secretKey) {
  const sortedKeys = Object.keys(params).sort();
  const stringToSign = sortedKeys.map((key) => `${key}${params[key]}`).join('');
  console.log('🔐 Firma base:', stringToSign);

  return crypto.createHmac('sha256', secretKey).update(stringToSign).digest('hex');
}

module.exports = router;
