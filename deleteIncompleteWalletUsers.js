// deleteIncompleteWalletUsers.js
const path = require('path');
require('dotenv').config();

const mongoose = require('mongoose');

// Import your models – adjust paths as needed.
const User = require('./models/user');         // Users model
const Profile = require('./models/profile');     // Profiles model
const Wallet = require('./models/wallet');       // Wallets model

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
    // 1. Find wallets that do not have complete account details.
    // We assume that a wallet is "incomplete" if any of these fields is missing or is an empty string.
    const incompleteWallets = await Wallet.find({
      $or: [
        { account_name: { $exists: false } },
        { account_name: { $eq: "" } },
        { account_number: { $exists: false } },
        { account_number: { $eq: "" } },
        { bank_name: { $exists: false } },
        { bank_name: { $eq: "" } }
      ]
    });
    
    const incompleteUserIds = incompleteWallets.map(wallet => wallet.user_id.toString());
    console.log("User IDs with incomplete wallet details:", incompleteUserIds);

    if (incompleteUserIds.length === 0) {
      console.log("No users found with incomplete wallet details.");
      mongoose.connection.close();
      process.exit(0);
    }

    // 2. Delete these users from the Users collection.
    const deleteUsersResult = await User.deleteMany({ _id: { $in: incompleteUserIds } });
    console.log(`Deleted ${deleteUsersResult.deletedCount} users from the Users collection.`);

    // 3. Optionally, delete the corresponding profiles.
    const deleteProfilesResult = await Profile.deleteMany({ user_id: { $in: incompleteUserIds } });
    console.log(`Deleted ${deleteProfilesResult.deletedCount} profiles from the Profiles collection.`);

    // 4. Optionally, delete the wallet documents.
    const deleteWalletsResult = await Wallet.deleteMany({ user_id: { $in: incompleteUserIds } });
    console.log(`Deleted ${deleteWalletsResult.deletedCount} wallets from the Wallets collection.`);

    mongoose.connection.close();
    console.log("Script completed successfully.");
  } catch (error) {
    console.error("Error in script:", error);
    mongoose.connection.close();
    process.exit(1);
  }
}
