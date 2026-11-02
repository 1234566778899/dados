/** URL publica. En Vercel sale del dominio de produccion del proyecto. */
const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;

export const SITE_URL = productionHost ? `https://${productionHost}` : "http://localhost:3000";
