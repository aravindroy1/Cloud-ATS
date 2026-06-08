const { SecretClient } = require('@azure/keyvault-secrets');
const { DefaultAzureCredential } = require('@azure/identity');
const dotenv = require('dotenv');

dotenv.config();

let secrets = {};

const loadSecrets = async () => {
  const keyVaultName = process.env.KEY_VAULT_NAME;
  if (!keyVaultName) {
    console.log('No KEY_VAULT_NAME provided, falling back to local .env variables.');
    secrets = {
      MONGO_URI: process.env.MONGO_URI,
      JWT_SECRET: process.env.JWT_SECRET,
      SMTP_USER: process.env.SMTP_USER,
      SMTP_PASS: process.env.SMTP_PASS,
      AZURE_CLIENT_ID: process.env.AZURE_CLIENT_ID,
      AZURE_CLIENT_SECRET: process.env.AZURE_CLIENT_SECRET,
      AZURE_TENANT_ID: process.env.AZURE_TENANT_ID
    };
    return secrets;
  }

  const KVUri = `https://${keyVaultName}.vault.azure.net`;
  try {
    console.log(`Connecting to Key Vault: ${KVUri}`);
    const credential = new DefaultAzureCredential();
    const client = new SecretClient(KVUri, credential);

    const getSecretOrEnv = async (secretName, envFallback) => {
      try {
        const secret = await client.getSecret(secretName);
        return secret.value;
      } catch (e) {
        console.warn(`Could not fetch secret ${secretName} from Key Vault, trying local .env...`);
        return envFallback;
      }
    };

    secrets.MONGO_URI = await getSecretOrEnv('MONGO-URI', process.env.MONGO_URI);
    secrets.JWT_SECRET = await getSecretOrEnv('JWT-SECRET', process.env.JWT_SECRET);
    secrets.SMTP_USER = await getSecretOrEnv('SMTP-USER', process.env.SMTP_USER);
    secrets.SMTP_PASS = await getSecretOrEnv('SMTP-PASS', process.env.SMTP_PASS);
    secrets.AZURE_CLIENT_ID = await getSecretOrEnv('AZURE-CLIENT-ID', process.env.AZURE_CLIENT_ID);
    secrets.AZURE_CLIENT_SECRET = await getSecretOrEnv('AZURE-CLIENT-SECRET', process.env.AZURE_CLIENT_SECRET);
    secrets.AZURE_TENANT_ID = await getSecretOrEnv('AZURE-TENANT-ID', process.env.AZURE_TENANT_ID);

    console.log('Secrets loaded successfully from Key Vault (with fallbacks if needed).');
  } catch (error) {
    console.error('Failed to load secrets from Key Vault:', error.message);
    console.log('Falling back to local .env variables fully.');
    secrets = { ...process.env };
  }

  return secrets;
};

const getSecret = (key) => secrets[key];

module.exports = {
  loadSecrets,
  getSecret
};
