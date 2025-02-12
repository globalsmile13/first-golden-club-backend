// resetAssignedCounters.js
const path = require('path');
require('dotenv').config();

const mongoose = require('mongoose');

// Import your AssignedMembers model – adjust the path as needed.
const AssignedMembers = require('./models/assignedMembers');

// Replace with your actual MongoDB connection string.
const MONGO_URI = process.env.MONGODB || "mongodb://localhost:27017/yourdbname";

mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log("Connected to MongoDB");
    return resetCounters();
  })
  .then(() => {
    console.log("Assigned members counters have been reset.");
    mongoose.connection.close();
  })
  .catch(err => {
    console.error("Error:", err);
    mongoose.connection.close();
  });

async function resetCounters() {
  try {
    // Set the count field to 0 for all documents in the AssignedMembers collection.
    const result = await AssignedMembers.updateMany({}, { $set: { count: 0 } });
    console.log(`Modified ${result.nModified} documents.`);
  } catch (error) {
    console.error("Error resetting counters:", error);
    throw error;
  }
}
