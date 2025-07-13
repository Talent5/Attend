// Data Migration Script
// Migrates data from 'test' database to 'attend-db' database

const mongoose = require('mongoose');
require('dotenv').config();

async function migrateData() {
  try {
    // Connect to the test database first
    console.log('Connecting to test database...');
    await mongoose.connect('mongodb://localhost:27017/test');
    
    // Get all collections from test database
    const testCollections = await mongoose.connection.db.listCollections().toArray();
    console.log('Collections in test database:', testCollections.map(c => c.name));
    
    const testData = {};
    
    // Get data from relevant collections
    const relevantCollections = ['employees', 'attendances', 'qrcodes', 'locations', 'fingerprints'];
    
    for (const collectionName of relevantCollections) {
      if (testCollections.some(c => c.name === collectionName)) {
        const collection = mongoose.connection.db.collection(collectionName);
        const data = await collection.find({}).toArray();
        testData[collectionName] = data;
        console.log(`Found ${data.length} documents in ${collectionName}`);
      }
    }
    
    // Disconnect from test database
    await mongoose.disconnect();
    
    // Connect to attend-db database
    console.log('Connecting to attend-db database...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/attend-db');
    
    // Migrate data to attend-db
    for (const [collectionName, data] of Object.entries(testData)) {
      if (data && data.length > 0) {
        const collection = mongoose.connection.db.collection(collectionName);
        
        // Clear existing data (if any)
        await collection.deleteMany({});
        
        // Insert migrated data
        await collection.insertMany(data);
        console.log(`✅ Migrated ${data.length} documents to ${collectionName}`);
      }
    }
    
    console.log('✅ Data migration completed successfully!');
    
    // Verify migration
    const attendCollections = await mongoose.connection.db.listCollections().toArray();
    console.log('Collections in attend-db:', attendCollections.map(c => c.name));
    
    for (const collectionName of relevantCollections) {
      if (attendCollections.some(c => c.name === collectionName)) {
        const collection = mongoose.connection.db.collection(collectionName);
        const count = await collection.countDocuments();
        console.log(`${collectionName}: ${count} documents`);
      }
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from database');
  }
}

// Run migration if this script is executed directly
if (require.main === module) {
  migrateData();
}

module.exports = migrateData;
