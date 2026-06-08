const { SecretClient } = require('@azure/keyvault-secrets');
const { DefaultAzureCredential } = require('@azure/identity');
const dotenv = require('dotenv');

dotenv.config();

let secrets = {};
let isLoaded = false;

const loadSecrets = async (context) => {
  if (isLoaded) return secrets;

  const keyVaultName = process.env.KEY_VAULT_NAME;
  if (!keyVaultName) {
    if (context) context.log('No KEY_VAULT_NAME provided, falling back to local .env variables.');
    secrets = {
      MONGO_URI: process.env.MONGO_URI,
      SMTP_USER: process.env.SMTP_USER,
      SMTP_PASS: process.env.SMTP_PASS,
      SMTP_HOST: process.env.SMTP_HOST || 'smtp.gmail.com',
      SMTP_PORT: process.env.SMTP_PORT || '587'
    };
    isLoaded = true;
    return secrets;
  }

  const KVUri = `https://${keyVaultName}.vault.azure.net`;
  try {
    if (context) context.log(`Connecting to Key Vault: ${KVUri}`);
    const credential = new DefaultAzureCredential();
    const client = new SecretClient(KVUri, credential);

    const getSecretOrEnv = async (secretName, envFallback) => {
      try {
        const secret = await client.getSecret(secretName);
        return secret.value;
      } catch (e) {
        if (context) context.log(`Could not fetch secret ${secretName} from Key Vault, trying local .env...`);
        return envFallback;
      }
    };

    secrets.MONGO_URI = await getSecretOrEnv('MONGO-URI', process.env.MONGO_URI);
    secrets.SMTP_USER = await getSecretOrEnv('SMTP-USER', process.env.SMTP_USER);
    secrets.SMTP_PASS = await getSecretOrEnv('SMTP-PASS', process.env.SMTP_PASS);
    secrets.SMTP_HOST = await getSecretOrEnv('SMTP-HOST', process.env.SMTP_HOST || 'smtp.gmail.com');
    secrets.SMTP_PORT = await getSecretOrEnv('SMTP-PORT', process.env.SMTP_PORT || '587');

    if (context) context.log('Secrets loaded successfully from Key Vault (with fallbacks if needed).');
    isLoaded = true;
  } catch (error) {
    if (context) context.log(`Failed to load secrets from Key Vault: ${error.message}`);
    secrets = { ...process.env };
    isLoaded = true;
  }

  return secrets;
};

const getSecret = (key) => secrets[key];

module.exports = {
  loadSecrets,
  getSecret
};
