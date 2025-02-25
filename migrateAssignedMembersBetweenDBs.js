// migrateAssignedMembersBetweenDBs.js
const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

// Retrieve the connection URIs for the source (Database A) and destination (Database B)
const dbA_URI = process.env.DB_A_URI || "mongodb://localhost:27017/dbA";
const dbB_URI = process.env.DB_B_URI || "mongodb://localhost:27017/dbB";

// Create two separate connections.
const connA = mongoose.createConnection(dbA_URI, { useNewUrlParser: true, useUnifiedTopology: true });
const connB = mongoose.createConnection(dbB_URI, { useNewUrlParser: true, useUnifiedTopology: true });

// Import your existing AssignedMembers model.
const AssignedMembersModel = require('./models/assignedMembers'); // Adjust the path as needed
// Get its schema.
const assignedMembersSchema = AssignedMembersModel.schema;

// Create model instances for each connection.
const AssignedMembersA = connA.model('AssignedMembers', assignedMembersSchema);
const AssignedMembersB = connB.model('AssignedMembers', assignedMembersSchema);

async function migrateAssignedMembersData() {
  try {
    // Retrieve all documents from Database A's AssignedMembers collection.
    const docsA = await AssignedMembersA.find({});
    console.log(`Found ${docsA.length} documents in Database A.`);

    // For each document in DB A, update the corresponding document in DB B.
    const updatePromises = docsA.map(async (docA) => {
      // Match by user_id.
      return AssignedMembersB.updateOne(
        { user_id: docA.user_id },
        { $set: { count: docA.count, paid_count: docA.paid_count } }
      );
    });

    const updateResults = await Promise.all(updatePromises);
    const totalUpdated = updateResults.reduce((sum, res) => sum + (res.modifiedCount || 0), 0);
    console.log(`Updated ${totalUpdated} documents in Database B.`);
  } catch (error) {
    console.error("Error during migration:", error);
  } finally {
    connA.close();
    connB.close();
    console.log("Connections closed.");
    process.exit(0);
  }
}

// Wait for both connections to be open before running the migration.
connA.once('open', () => {
  console.log("Connected to Database A (source)");
  connB.once('open', () => {
    console.log("Connected to Database B (destination)");
    migrateAssignedMembersData();
  });
});
