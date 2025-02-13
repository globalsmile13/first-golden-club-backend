// deleteIncompleteWalletUsers.js
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const mongoose = require('mongoose');

// Import models – adjust paths as needed.
const User = require('./models/user');         // Users model
const Profile = require('./models/profile');   // Profiles model
const Wallet = require('./models/wallet');     // Wallets model

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
    // 1. Find wallets with incomplete details.
    const incompleteWallets = await Wallet.find({
      $or: [
        { account_name: { $exists: false } },
        { account_name: { $eq: "" } },
        { account_number: { $exists: false } },
        { account_number: { $eq: "" } },
        { bank_name: { $exists: false } },
        { bank_name: { $eq: "" } }
      ]
    }).lean();
    
    const incompleteUserIds = incompleteWallets.map(wallet => wallet.user_id.toString());

    if (incompleteUserIds.length === 0) {
      console.log("No users found with incomplete wallet details.");
      mongoose.connection.close();
      process.exit(0);
    }

    console.log("User IDs with incomplete wallet details:", incompleteUserIds);

    // 2. Find corresponding users and profiles.
    const incompleteUsers = await User.find({ _id: { $in: incompleteUserIds } }).lean();
    const incompleteProfiles = await Profile.find({ user_id: { $in: incompleteUserIds } }).lean();

    // 3. Write the details to separate text files.
    const walletsFile = path.join(__dirname, 'incompleteWallets.txt');
    const usersFile = path.join(__dirname, 'incompleteUsers.txt');
    const profilesFile = path.join(__dirname, 'incompleteProfiles.txt');

    fs.writeFileSync(walletsFile, JSON.stringify(incompleteWallets, null, 2));
    fs.writeFileSync(usersFile, JSON.stringify(incompleteUsers, null, 2));
    fs.writeFileSync(profilesFile, JSON.stringify(incompleteProfiles, null, 2));

    console.log(`Incomplete wallet details saved to ${walletsFile}`);
    console.log(`Incomplete users saved to ${usersFile}`);
    console.log(`Incomplete profiles saved to ${profilesFile}`);

    mongoose.connection.close();
    console.log("Script completed successfully.");
  } catch (error) {
    console.error("Error in script:", error);
    mongoose.connection.close();
    process.exit(1);
  }
}
