
const schedule = require('node-schedule');
const Profile = require('../models/profile');
const Transaction = require('../models/transactions');
const AssignedMembers = require('../models/assignedMembers');
const Subscription = require('../models/subscription');
const User = require('../models/user'); // Ensure User model is imported
const Level = require('../models/level'); // Ensure Level model is imported
const { ErrorResponse, SuccessResponse } = require('../lib/apiResponse');
const { createNotification } = require('../controllers/notification');

// Helper function to shuffle an array using Fisher-Yates algorithm
const shuffleArray = (array) => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};

// Stores recently assigned parents to avoid immediate reassignments
const recentlyAssignedParents = new Set();

const upgrade_cron = async () => {
  try {
    // Fetch all users needing an upgrade
    const defaultingAccounts = await AssignedMembers.find({
      upgrade_date: { $ne: null },
      deleted_at: { $eq: null },
    }).lean();

    console.log("Defaulting accounts fetched:", defaultingAccounts.length);

    if (!defaultingAccounts.length) return console.log("No accounts require upgrades.");

    // Fetch root profile dynamically
    const rootProfile = await AssignedMembers.findOne({
      state: 'unachieved',
      upgrade_date: null,
      deleted_at: { $eq: null },
    })
      .sort({ createdAt: 1 })
      .lean();

    if (!rootProfile) throw new Error("No eligible parent found in AssignedMembers.");

    const rootUser = await User.findOne({ _id: rootProfile.user_id }).lean();
    if (!rootUser) throw new Error("Root user not found.");

    // Fetch a larger pool of potential parents
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

    const shuffledParents = shuffleArray(potentialParents);

    for (const account of defaultingAccounts) {
      try {
        const userProfile = await Profile.findOne({ user_id: account.user_id }).lean();
        if (!userProfile || userProfile.isAdmin) continue;

        let parentId = userProfile.parent_id || userProfile.parents?.slice(-1)[0];

        if (!parentId || recentlyAssignedParents.has(parentId)) {
          const user = await User.findOne({ _id: account.user_id }).populate("level_id").lean();
          const targetLevel = user.level_id?.level_number || 1;

          let levelFilteredParents = shuffledParents.filter(
            (parent) =>
              parent.level_id &&
              parent.level_id.level_number === targetLevel &&
              !recentlyAssignedParents.has(parent._id)
          );

          if (levelFilteredParents.length > 0) {
            parentId = shuffleArray(levelFilteredParents)[0]._id;
          } else if (shuffledParents.length > 0) {
            parentId = shuffleArray(shuffledParents)[0]._id;
          } else {
            console.log(`No available parents for user ${account.user_id}, reassigning to root.`);
            parentId = rootUser._id;
          }

          await Profile.updateOne({ user_id: account.user_id }, { parent_id: parentId });
          recentlyAssignedParents.add(parentId);
          setTimeout(() => recentlyAssignedParents.delete(parentId), 600000); // Remove after 10 mins
        }

        // Fetch all required data in parallel
        const [parentUser, parentProfile, userAssignedMembers, parentAssignedMembers] = await Promise.all([
          User.findOne({ _id: parentId }).lean(),
          Profile.findOne({ user_id: parentId }).lean(),
          AssignedMembers.findOne({ user_id: account.user_id }).lean(),
          AssignedMembers.findOne({ user_id: parentId }).lean(),
        ]);

        if (!parentUser || !parentProfile || !userAssignedMembers || !parentAssignedMembers) {
          console.log(`Incomplete data for account_id: ${account.user_id}. Skipping.`);
          continue;
        }

        const parentLevel = await Level.findOne({ _id: parentUser.level_id }).lean();
        const userLevel = await Level.findOne({ _id: account.user_id }).lean();
        const diff_level = (parentLevel?.level_number || 0) - (userLevel?.level_number || 0);

        if (parentAssignedMembers && diff_level <= 1 && parentAssignedMembers.count > 0) {
          parentAssignedMembers.count -= 1;
          await AssignedMembers.updateOne({ user_id: parentId }, { count: parentAssignedMembers.count });
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