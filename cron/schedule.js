
const schedule = require('node-schedule');
const Profile = require('../models/profile');
const Transaction = require('../models/transactions');
const AssignedMembers = require('../models/assignedMembers');
const Subscription = require('../models/subscription');
const User = require('../models/user'); // Ensure User model is imported
const Level = require('../models/level'); // Ensure Level model is imported
const { ErrorResponse, SuccessResponse } = require('../lib/apiResponse');
const { createNotification } = require('../controllers/notification');

// Helper function to shuffle an array
const shuffleArray = (array) => array.sort(() => Math.random() - 0.5);

// Stores recently assigned parents to avoid immediate reassignments
const recentlyAssignedParents = new Set();

const upgrade_cron = async () => {
  try {
    // Fetch all users needing an upgrade
    const defaultingAccounts = await AssignedMembers.find({
      upgrade_date: { $ne: null },
      deleted_at: { $eq: null },
    });

    console.log("Defaulting accounts fetched:", defaultingAccounts);

    if (!defaultingAccounts.length) return console.log("No accounts require upgrades.");

    // Fetch root profile once
    const rootProfile = await AssignedMembers.findOne({
      state: 'unachieved',  // Eligible parent must be in unachieved state
      upgrade_date: null,   // Should not be in upgrade process
      deleted_at: { $eq: null }, // Must be an active account
    })
      .sort({ createdAt: 1 })  // Prioritize the earliest created member
      .lean(); // Optimize query for performance
    
    if (!rootProfile) throw new Error("No eligible parent found in AssignedMembers.");
    
    const rootUser = await User.findOne({ _id: rootProfile.user_id });
    
    if (!rootUser) throw new Error("Root user not found.");    

    // Fetch a **larger** pool of potential parents from different levels
    let potentialParents = await User.find({
      "profile.deleted_at": null,
      "assigned_members.state": "unachieved",
      "assigned_members.upgrade_date": null,
    })
      .populate("profile")
      .populate("level_id")
      .populate("assigned_members")
      .lean();

    if (potentialParents.length < 5) {
      // If too few parents, include **users from the last level**
      const lastLevelUsers = await User.find({
        "profile.deleted_at": null,
        "assigned_members.state": "unachieved",
        "assigned_members.count": { $gte: 1 },
      })
        .populate("profile")
        .populate("level_id")
        .populate("assigned_members")
        .lean();
      
      potentialParents = [...potentialParents, ...lastLevelUsers];
    }

    const shuffledParents = shuffleArray(potentialParents); // Shuffle parents

    for (const account of defaultingAccounts) {
      try {
        const userProfile = await Profile.findOne({ user_id: account.user_id });
        if (!userProfile || userProfile.isAdmin) continue;

        let parentId = userProfile.parent_id || userProfile.parents?.slice(-1)[0];

        // **Avoid Assigning the Same Parent Every Time**
        if (!parentId || recentlyAssignedParents.has(parentId)) {
          const targetLevel =
            (await User.findOne({ _id: account.user_id }).populate("level_id"))
              .level_id?.level_number || 1;

          // Filter parents based on level
          let levelFilteredParents = shuffledParents.filter(
            (parent) =>
              parent.level_id &&
              parent.level_id.level_number === targetLevel &&
              !recentlyAssignedParents.has(parent._id) // Avoid repeated parents
          );

          if (levelFilteredParents.length > 0) {
            parentId = shuffleArray(levelFilteredParents)[0]._id;
          } else if (shuffledParents.length > 0) {
            parentId = shuffleArray(shuffledParents)[0]._id; // Fallback: Any available parent
          } else {
            console.log(`No available parents for user ${account.user_id}, reassigning to root.`);
            parentId = rootUser._id;
          }

          userProfile.parent_id = parentId;
          await userProfile.save();

          recentlyAssignedParents.add(parentId); // Track recent assignments
          setTimeout(() => recentlyAssignedParents.delete(parentId), 600000); // Remove after 10 mins
        }

        // Fetch parent and user data in one query
        const [parentUser, parentProfile, loadedUser, userAssignedMembers, parentAssignedMembers] = await Promise.all([
          User.findOne({ _id: parentId }),
          Profile.findOne({ user_id: parentId }),
          User.findOne({ _id: account.user_id }),
          AssignedMembers.findOne({ user_id: account.user_id }),
          AssignedMembers.findOne({ user_id: parentId }),
        ]);

        if (!parentUser || !parentProfile || !loadedUser || !userAssignedMembers || !parentAssignedMembers) {
          console.log(`Incomplete data for account_id: ${account.user_id}. Skipping.`);
          continue;
        }

        // Adjust parent level assignment logic
        const parentLevel = await Level.findOne({ _id: parentUser.level_id });
        const userLevel = await Level.findOne({ _id: loadedUser.level_id });
        const diff_level = (parentLevel?.level_number || 0) - (userLevel?.level_number || 0);

        if (parentAssignedMembers && diff_level <= 1 && parentAssignedMembers.count > 0) {
          parentAssignedMembers.count -= 1;
          await parentAssignedMembers.save();
        }

        console.log(`Successfully updated account_id: ${account.user_id}`);

      } catch (accountError) {
        console.error(`Error processing account_id: ${account.user_id}`, accountError);
      }
    }
  } catch (error) {
    console.error("Critical error in upgrade_cron:", error);
  }
};

const subscription_cron = async() =>{
    try{
         // Calculate the date one month ago
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        oneMonthAgo.setDate(oneMonthAgo.getDate() + 1);

        const oneDayAgo = new Date();
        oneDayAgo.setDate(oneDayAgo.getDate() - 1);


        // Find accounts where subscription_date is yesterday
        const defaultingAccounts = await Subscription.find({
            subscription_date: {$lt: new Date()},
            subscription_date: { $ne: null }

        });
        
        
        if(defaultingAccounts){
            console.log(defaultingAccounts)
        // Iterate over each account and update the corresponding user profile
        for (const account of defaultingAccounts) {
            const userProfile = await Profile.findOne({ user_id: account.user_id });
            const adminProfile = await Profile.findOne({isAdmin: false});
        
            
            if (userProfile && adminProfile) {
            
            const [subscriptionUser, transactionUser, transactionParent] = await Promise.all([
                Subscription.findOne({user_id: account.user_id}),
                Transaction.findOne({user_id: account.user_id, ref_id:adminProfile.user_id, 
                    transaction_type:"debit",transaction_status:"pending", 
                    transaction_reason:"subscription" }),
                Transaction.findOne({user_id: adminProfile.user_id, ref_id:account.user_id, 
                    transaction_type:"credit",transaction_status:"pending", 
                    transaction_reason:"subscription" }),
            ])

            if(transactionParent){
                transactionUser.transaction_status = "failure"
                transactionParent.transaction_status = "failure"
                await Promise.all([
                    transactionUser.save(),
                    transactionParent.save()
                ])
            }
            
            subscriptionUser.subscription_paid = false
            
            

            // Assign a new date to deleted_at
            userProfile.deleted_at = new Date();
            await Promise.all([
                userProfile.save()
            ])
            console.log(`Updated deleted_at for user profile with account_id: ${account.user_id}`);
            await createNotification(account.user_id, "Failed subscription: Your account has become inactive", "pending", "subscription")
            } else {
            console.log(`User profile not found for account_id: ${account.user_id}`);
            }
        }
    }
    }
    catch (error) {
        console.error('Error occurred:', error);
      }
}


const upgrade_account_cron = async () => {
  try {

    const defaultingAccounts = await AssignedMembers.find({
      paid_count: 2,
      upline_paid: false,
      state: 'unachieved'
    });

    console.log("upgrade account level 2: ", defaultingAccounts);

    // Iterate over each account and update the corresponding user profile
    for (const account of defaultingAccounts) {

      const [userProfile, userLoaded, userAssignedMembers] = 
        await Promise.all([
          Profile.findOne({ user_id: account.user_id }),
          User.findOne({_id: account.user_id}),
          AssignedMembers.findOne({ user_id: account.user_id })
      ]);

      const userLevel = await Level.findOne({_id: userLoaded.level_id})

      if( userProfile.isAdmin){
        return
      }
    
      if (userProfile) {
        
        if(userLevel.level_number > 1){
          userAssignedMembers.upgrade_date = new Date()
          userAssignedMembers.state = "achieved";
          await createNotification(account.user_id, "Upgrade: This account is ready for upgrade", "success", "upgrade")
        }

        await Promise.all([userAssignedMembers.save()]);


        console.log(`Updated deleted_at for user profile with account_id: ${account.user_id}`);
        await createNotification(account.user_id, "Failed Upgrade: This account has been deactivated", "error", "upgrade");
      } else {
        console.log(`User profile not found or is admin for account_id: ${account.user_id}`);
      }
    }
  } catch (error) {
    console.error('Error occurred:', error);
  }
}

let upgrade_rule = new schedule.RecurrenceRule();
upgrade_rule.minute = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

let subscription_rule = new schedule.RecurrenceRule();
subscription_rule.minute = [0, 5, 10, 15, 20, 25, 30, 35, 45, 50, 55];

let upgrade_account_rule = new schedule.RecurrenceRule();
upgrade_account_rule.minute = [0, 10, 20, 30, 40, 50];

schedule.scheduleJob(upgrade_rule, upgrade_cron);
schedule.scheduleJob(subscription_rule, subscription_cron);
schedule.scheduleJob(upgrade_account_rule, upgrade_account_cron);

console.log("Cron script started.");