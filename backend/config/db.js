const mongoose = require('mongoose');

const connectDB = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/safecampus';
  
  try {
    // Attempt Mongoose connection with a 3-second timeout for quick fallback
    mongoose.set('strictQuery', false);
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 3000,
    });
    
    global.useLocalDB = false;
    console.log('====================================================');
    console.log('✅ SUCCESS: Connected to MongoDB Database Server');
    console.log(`📡 URI: ${uri}`);
    console.log('====================================================');
  } catch (err) {
    global.useLocalDB = true;
    console.log('====================================================');
    console.log('⚠️  WARNING: MongoDB connection failed / unavailable.');
    console.log(`❌ Error details: ${err.message}`);
    console.log('🔄 FALLBACK: Running SafeCampus in Local JSON DB Mode!');
    console.log('📦 Data will be persisted in backend/local_db.json');
    console.log('====================================================');
  }
};

module.exports = connectDB;
