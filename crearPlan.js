const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

const SECRET_KEY = process.env.SECRET_KEY;
const API_KEY = process.env.API_KEY;
const CALLBACK_URL = 'https://www.redjudicial.cl/webhook-flow';

const planes = [
  {
    planId: 'membresia_basica',
    name: 'Membresía Básica',
    description: 'Acceso básico a Red Judicial',
    amount: 9990
  },
  {
    planId: 'membresia_premium',
    name: 'Membresía Premium',
    description: 'Acceso premium a Red Judicial',
    amount: 19990
  },
  {
    planId: 'membresia_elite',
    name: 'Membresía Elite',
    description: 'Acceso elite a Red Judicial',
    amount: 29990
  }
];

function generarFirmaHMAC(params, secretKey) {
  const sortedKeys = Object.keys(params).sort();
  const baseString = sortedKeys.map(key => `${key}${params[key]}`).join('');
  console.log(`🔐 Base para firma: ${baseString}`);
  const hmac = crypto.createHmac('sha256', secretKey);
  hmac.update(baseString);
  return hmac.digest('hex');
}

async function crearPlan(plan) {
  const params = {
    apiKey: API_KEY,
    planId: plan.planId,
    name: plan.name,
    amount: plan.amount,
    currency: 'CLP',
    description: plan.description,
    interval: 3, // mensual
    interval_count: 1,
    urlCallback: CALLBACK_URL
  };

  const signature = generarFirmaHMAC(params, SECRET_KEY);
  params.s = signature;

  try {
    const response = await axios.post('https://www.flow.cl/api/plans/create', new URLSearchParams(params).toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    console.log(`✅ Plan ${plan.planId} creado correctamente:`, response.data);
  } catch (error) {
    console.error(`❌ Error al crear plan ${plan.planId}:`, error.response?.data || error.message);
  }
}

(async () => {
  for (const plan of planes) {
    console.log(`\n🚀 Creando plan ${plan.planId}...`);
    await crearPlan(plan);
  }
})();
