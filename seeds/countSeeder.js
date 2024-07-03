// seeder.js
const mongoose = require('mongoose');
const AssignedMembers = require('../models/assignedMembers');
const Level = require('../models/level');
const Users = require('../models/user');  // Assuming the Users model is in the same folder
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Seed the database
async function seedDatabase() {
  try {
    // Get all users
    const users = await Users.find({});

    for (const user of users) {
      // Find the user's level
      const userLevel = await Level.findById(user.level_id);

      if (userLevel && userLevel.level_number > 1) {
        // Get the assigned members for the user
        const assignedMembers = await AssignedMembers.find({
          _id: { $in: user.assigned_members }
        });

        for (const member of assignedMembers) {
          // Update upline_paid based on paid_count
          await AssignedMembers.updateOne(
            { _id: member._id },
            {
              $set: {
                upline_paid: member.paid_count >= 2,
              },
            }
          );
        }
      }
    }

    console.log('Database seeded successfully');
  } catch (error) {
    console.error('Error seeding database:', error);
  } finally {
    // Close the database connection
    mongoose.disconnect();
  }
}

// Run the seeder
seedDatabase();
