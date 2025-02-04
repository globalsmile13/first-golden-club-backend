// deleteInactiveAccounts.js
const path = require('path');
require('dotenv').config();

const mongoose = require('mongoose');

// Import your models – adjust paths as needed.
const User = require('./models/user');         // Users model
const Profile = require('./models/profile');     // Profiles model
const Transaction = require('./models/transactions'); // Transactions model
const Wallet = require('./models/wallet');       // Wallets model (optional)

// Replace with your actual MongoDB connection string.
const MONGO_URI = process.env.MONGODB || "mongodb://localhost:27017/yourdbname";

mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log("Connected to MongoDB");
    runScript();
  })
  .catch(err => {
    console.error("Error connecting to MongoDB:", err);
    process.exit(1);
  });

async function runScript() {
  try {
    // 1. Find inactive accounts.
    // Assume inactive accounts are those whose profile.deleted_at is not null.
    const inactiveProfiles = await Profile.find({ deleted_at: { $ne: null } });
    const inactiveUserIds = inactiveProfiles.map(profile => profile.user_id.toString());
    console.log("Inactive user IDs:", inactiveUserIds);

    // 2. Find accounts without payment details.
    // Get a distinct list of user IDs that have at least one transaction.
    const usersWithTransactions = await Transaction.distinct("user_id");
    // Convert them to strings for reliable comparison.
    const usersWithTransactionsIds = usersWithTransactions.map(id => id.toString());
    console.log("User IDs with transactions:", usersWithTransactionsIds);

    // Get all user IDs from the User collection.
    const allUsers = await User.find().select('_id');
    const allUserIds = allUsers.map(user => user._id.toString());

    // Filter to get those user IDs that do NOT have any transactions.
    const noTransactionUserIds = allUserIds.filter(id => !usersWithTransactionsIds.includes(id));
    console.log("User IDs without any transactions:", noTransactionUserIds);

    // 3. Combine the two sets of user IDs.
    const userIdsToDeleteSet = new Set([...inactiveUserIds, ...noTransactionUserIds]);
    const userIdsToDelete = Array.from(userIdsToDeleteSet);
    console.log("Combined user IDs to delete:", userIdsToDelete);

    if (userIdsToDelete.length === 0) {
      console.log("No accounts found for deletion.");
    } else {
      // 4. Delete the users from the User collection.
      const deleteUsersResult = await User.deleteMany({ _id: { $in: userIdsToDelete } });
      console.log(`Deleted ${deleteUsersResult.deletedCount} users from the Users collection.`);

      // 5. Optionally, delete corresponding profiles.
      const deleteProfilesResult = await Profile.deleteMany({ user_id: { $in: userIdsToDelete } });
      console.log(`Deleted ${deleteProfilesResult.deletedCount} profiles from the Profiles collection.`);

      // 6. Optionally, delete transactions for these users.
      const deleteTransactionsResult = await Transaction.deleteMany({ user_id: { $in: userIdsToDelete } });
      console.log(`Deleted ${deleteTransactionsResult.deletedCount} transactions from the Transactions collection.`);

      // 7. Optionally, delete wallet documents for these users.
      const deleteWalletsResult = await Wallet.deleteMany({ user_id: { $in: userIdsToDelete } });
      console.log(`Deleted ${deleteWalletsResult.deletedCount} wallets from the Wallets collection.`);
    }
    
    mongoose.connection.close();
    console.log("Script completed successfully.");
  } catch (error) {
    console.error("Error in script:", error);
    mongoose.connection.close();
    process.exit(1);
  }
}
