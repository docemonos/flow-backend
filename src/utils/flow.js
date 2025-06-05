import { isEmail } from "validator";
import dns from "dns/promises";

// Revisa que el email esté bien escrito y que el dominio exista
export async function isEmailDeliverable(email) {
  if (!isEmail(email)) return false;

  const domain = email.split("@")[1].toLowerCase();

  try {
    // Revisa que el dominio tenga registro de correo (MX)
    const mxRecords = await dns.resolveMx(domain);
    return mxRecords && mxRecords.length > 0;
  } catch (err) {
    return false;
  }
}
