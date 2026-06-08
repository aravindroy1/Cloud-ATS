const mongoose = require('mongoose');
const { getSecret } = require('./keyvault');

let isDbConnected = false;

const connectDB = async () => {
  try {
    const connStr = getSecret('MONGO_URI') || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/resume-analyzer';
    console.log(`Connecting to MongoDB at: ${connStr.replace(/:[^@/]+@/, ':****@')}`); // hide credentials if present
    
    const conn = await mongoose.connect(connStr, {
      serverSelectionTimeoutMS: 15000, // give Cosmos DB enough time to handshake
      tlsAllowInvalidCertificates: true, // bypass local CA certificate trust issues
      directConnection: true // bypass replica-set host discovery resolution failures
    });
    
    isDbConnected = true;
    console.log(`MongoDB Connected successfully: ${conn.connection.host}`);
  } catch (error) {
    isDbConnected = false;
    console.error(`MongoDB Connection Error: ${error.message}`);
    console.log('\n================================================================');
    console.log(' ⚠️ WARNING: MongoDB is not running.');
    console.log(' The server will automatically use IN-MEMORY database fallback.');
    console.log(' Data will not be persisted across server restarts.');
    console.log('================================================================\n');
  }
};

module.exports = {
  connectDB,
  isConnected: () => isDbConnected
};

