const crypto = require('crypto');
const axios = require('axios');
const qs = require('qs');

const API_KEY = '1F911879-EC42-4580-A126-394L8BC1CA62';
const SECRET_KEY = 'b9ade2cb744884f579c637ac47e7d4ba0bfc362e';

function generarFirma(params, secretKey) {
  const sortedKeys = Object.keys(params).sort();
  const concatenado = sortedKeys.map(key => `${key}=${params[key]}`).join('&');
  return crypto.createHmac('sha256', secretKey).update(concatenado).digest('hex');
}

(async () => {
  const params = {
    apiKey: API_KEY
  };
  params.s = generarFirma(params, SECRET_KEY);

  try {
    const response = await axios.post('https://www.flow.cl/api/plan/list', qs.stringify(params), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    console.log('✅ Respuesta:', response.data);
  } catch (err) {
    console.error('❌ Error:', err.response?.data || err.message);
  }
})();
