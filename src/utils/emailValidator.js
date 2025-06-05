const { isEmail } = require('validator');
const dns = require('dns').promises;

async function isEmailDeliverable(email) {
  if (!isEmail(email)) return false;

  const domain = email.split('@')[1];
  try {
    const mx = await dns.resolveMx(domain);
    return mx && mx.length > 0;
  } catch (error) {
    return false;
  }
}

module.exports = { isEmailDeliverable };
