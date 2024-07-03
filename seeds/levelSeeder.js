// seeder.js
const mongoose = require('mongoose');
const Level = require('../models/level');
require('dotenv').config()

// Connect to MongoDB
mongoose
  .connect(
    process.env.MONGODB,{
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }
  )
// Define initial data
const levels = [
    
  { level_name: 'lv1', level_number: 1, members_number: 2, priority:'high', slug:'/lv1', upgrade_amount:1000, member_amount:1000, nextlevel_upgrade:2000, admin_count:2, levels_count:0},
  { level_name: 'lv2', level_number: 2, members_number: 4, priority:'high', slug:'/lv2', upgrade_amount:2000, member_amount:2000, nextlevel_upgrade:4000, admin_count:6, levels_count:0 },
  { level_name: 'lv3', level_number: 3, members_number: 8, priority:'high', slug:'/lv3', upgrade_amount:4000, member_amount:4000, nextlevel_upgrade:8000, admin_count:14, levels_count:0},
  { level_name: 'lv4', level_number: 4, members_number: 16, priority:'high', slug:'/lv4', upgrade_amount:8000, member_amount:8000, nextlevel_upgrade:16000, admin_count:30, levels_count:0 },
  { level_name: 'lv5', level_number: 5, members_number: 32, priority:'high', slug:'/lv5', upgrade_amount:16000, member_amount:16000, nextlevel_upgrade:32000, admin_count:62, levels_count:0 },
  { level_name: 'lv6', level_number: 6, members_number: 64, priority:'high', slug:'/lv6', upgrade_amount:32000, member_amount:32000, nextlevel_upgrade:64000, admin_count:126, levels_count:0 },
  { level_name: 'lv7', level_number: 7, members_number: 128, priority:'high', slug:'/lv7', upgrade_amount:64000, member_amount:64000, nextlevel_upgrade:128000, admin_count:254, levels_count:0 },
  { level_name: 'lv8', level_number: 8, members_number: 256, priority:'high', slug:'/lv8', upgrade_amount:128000, member_amount:128000, nextlevel_upgrade:256000, admin_count:510, levels_count:0 },
  { level_name: 'lv9', level_number: 9, members_number: 512, priority:'high', slug:'/lv9', upgrade_amount:256000, member_amount:256000, nextlevel_upgrade:512000, admin_count:1022, levels_count:0 },
  { level_name: 'lv10', level_number: 10, members_number: 1024, priority:'high', slug:'/lv10', upgrade_amount:512000, member_amount:512000, nextlevel_upgrade:512000, admin_count:2046, levels_count:0 },
   
];



// Seed the database
async function seedDatabase() {
    try {
        // Clear existing data
        await Level.deleteMany();

        // Insert new data
        await Level.insertMany(levels);

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
