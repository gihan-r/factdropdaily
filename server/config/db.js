const mongoose = require('mongoose');

let isConnected = false;

async function connectDB() {
  if (isConnected) return mongoose.connection;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set in environment variables');
  }

  mongoose.set('strictQuery', true);

  await mongoose.connect(uri, {
    // Modern mongoose (8.x) no longer needs useNewUrlParser/useUnifiedTopology
    serverSelectionTimeoutMS: 10000,
  });

  isConnected = true;
  console.log('[DB] MongoDB connected');

  mongoose.connection.on('error', (err) => {
    console.error('[DB] MongoDB connection error:', err.message);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('[DB] MongoDB disconnected');
    isConnected = false;
  });

  return mongoose.connection;
}

module.exports = connectDB;
