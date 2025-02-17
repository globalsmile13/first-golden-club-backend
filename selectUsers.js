// selectLevelOneUsers_fifo.js
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const mongoose = require('mongoose');

// Import your models – adjust paths as needed.
const User = require('./models/user');         // Users model
const Level = require('./models/level');        // Levels model

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
    // Use an aggregation pipeline:
    // 1. Look up the corresponding level data.
    // 2. Unwind the levelData array.
    // 3. Match only those users whose level_number is 1.
    // 4. Sort by the 'createdAt' field in ascending order (oldest to newest).
    const results = await User.aggregate([
      {
        $lookup: {
          from: "levels",           // the levels collection (ensure this matches your collection name)
          localField: "level_id",   // the field in the users collection that references the level
          foreignField: "_id",      // the field in the levels collection
          as: "levelData"           // alias for the joined data
        }
      },
      { 
        $unwind: "$levelData"       // flatten the levelData array
      },
      { 
        $match: { "levelData.level_number": 2 }  // select only users in level 1
      },
      { 
        $sort: { createdAt: 1 }     // FIFO: sort by createdAt in ascending order (oldest first)
      }
    ]);

    console.log(`Found ${results.length} users in Level 1 (sorted FIFO by createdAt).`);

    // Prepare the output file.
    const outputFile = path.join(__dirname, 'level1_users_fifo.txt_2');
    const fileContent = results.map(user => JSON.stringify(user, null, 2)).join('\n\n');

    fs.writeFileSync(outputFile, fileContent);
    console.log(`Results saved to ${outputFile}`);

    mongoose.connection.close();
    console.log("Script completed successfully.");
  } catch (error) {
    console.error("Error in script:", error);
    mongoose.connection.close();
    process.exit(1);
  }
}
