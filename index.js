// index.js
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

const API_KEY = process.env.API_KEY;
const COMMERCE_ID = process.env.COMMERCE_ID;
const FLOW_API = 'https://www.flow.cl/api';

// Crear Cliente
app.post('/crear-cliente', async (req, res) => {
  try {
    const { email, name, externalId } = req.body;
    const response = await axios.post(`${FLOW_API}/customer/create`, {
      apiKey: API_KEY,
      commerceId: COMMERCE_ID,
      email,
      name,
      externalId
    });
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// Webhook Flow
app.post('/webhook-flow', (req, res) => {
  console.log('Webhook recibido:', req.body);
  res.status(200).send('OK');
});

// Inicio
app.listen(process.env.PORT || 3000, () => {
  console.log('Servidor corriendo en puerto 3000');
});
