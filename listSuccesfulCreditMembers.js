// listSuccessfulCreditMembersNoAgg.js
const mongoose = require('mongoose');
require('dotenv').config();

// Import your models – adjust paths as needed.
const Transaction = require('./models/transactions');  // Transactions model
const User = require('./models/user');                  // Users model
const AssignedMembers = require('./models/assignedMembers'); // AssignedMembers model

// Replace with your actual MongoDB connection string.
const MONGO_URI = process.env.MONGODB || "mongodb://localhost:27017/yourdbname";

mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(async () => {
    console.log("Connected to MongoDB");

    try {
      // Define the cutoff date: January 1, 2025.
      const cutoffDate = new Date("2025-01-01T00:00:00Z");

      // Find all transactions that meet the criteria:
      // - transaction_status: "success"
      // - transaction_type: "credit"
      // - updatedAt >= cutoffDate
      const transactions = await Transaction.find({
        transaction_status: "success",
        transaction_type: "credit",
        updatedAt: { $gte: cutoffDate }
      }).select("user_id").lean();

      // Build a set of distinct user IDs from the matching transactions.
      const userIdSet = new Set(transactions.map(tx => tx.user_id.toString()));
      const userIds = Array.from(userIdSet);
      console.log(`Found ${userIds.length} distinct user IDs with successful credit transactions (updatedAt >= Jan 1, 2025).`);

      if (userIds.length === 0) {
        console.log("No matching transactions found.");
      } else {
        // Retrieve user details.
        const users = await User.find({ _id: { $in: userIds } })
          .select("username createdAt")
          .lean();

        // Retrieve AssignedMembers info for these users.
        const assignedInfo = await AssignedMembers.find({ user_id: { $in: userIds } })
          .select("user_id count paid_count")
          .lean();

        // Build a map of AssignedMembers info keyed by user_id.
        const assignedMap = {};
        assignedInfo.forEach(info => {
          assignedMap[info.user_id.toString()] = info;
        });

        // Print out the results.
        console.log("\nMembers with successful credit transactions (updatedAt >= Jan 1, 2025):");
        users.forEach(user => {
          const info = assignedMap[user._id.toString()] || { count: "N/A", paid_count: "N/A" };
          console.log(`User: ${user.username}, Account Created: ${user.createdAt}, Assigned Count: ${info.count}, Paid Count: ${info.paid_count}`);
        });
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      mongoose.connection.close();
      console.log("Connection closed.");
    }
  })
  .catch(err => {
    console.error("Error connecting to MongoDB:", err);
  });
