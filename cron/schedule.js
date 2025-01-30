
const schedule = require('node-schedule');
const Profile = require('../models/profile');
const Transaction = require('../models/transactions');
const AssignedMembers = require('../models/assignedMembers');
const Subscription = require('../models/subscription');
const User = require('../models/user'); // Ensure User model is imported
const Level = require('../models/level'); // Ensure Level model is imported
const { ErrorResponse, SuccessResponse } = require('../lib/apiResponse');
const { createNotification } = require('../controllers/notification');

const upgrade_cron = async () => {
  try {

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000); 

    const defaultingAccounts = await AssignedMembers.find({
        upgrade_date: {
            $lte: oneHourAgo,
            $ne: null
        },
        deleted_at:{
            $eq: null 
        }
    });

    console.log(defaultingAccounts);

    let rootProfile;
    let rootUser;

    if(defaultingAccounts.length >0){
      rootProfile = await Profile.findOne({ isAdmin: true });
      rootUser = await User.findOne({ _id: rootProfile.user_id });
    }

    // Iterate over each account and update the corresponding user profile
    for (const account of defaultingAccounts) {
      // console.log("hey")
      const userProfile = await Profile.findOne({ user_id: account.user_id });

      console.log(userProfile)

      if( userProfile.isAdmin){
        return
      }
    
      if (userProfile) {
        const parentId = userProfile.parent_id || userProfile.parents[-1];

        if(parentId === null || parentId === undefined){
          const [
            loadedUser,
            userAssignedMembers,
          ] = await Promise.all([
            User.findOne({ _id: account.user_id }),
            AssignedMembers.findOne({ user_id: account.user_id })
          ]);
          userProfile.parents.push(rootUser._id);
          userProfile.parent_id = rootUser._id;
          userProfile.deleted_at = new Date();
          loadedUser.deleted_at = new Date();
          userAssignedMembers.deleted_at = new Date();

          return await Promise.all([userAssignedMembers.save(), userProfile.save(), loadedUser.save()]);

        }

        console.log(parentId)
        
        const [
          parentUser,
          parentProfile,
          loadedUser,
          userAssignedMembers,
          parentAssignedMembers,
          transactionUser,
          transactionParent
        ] = await Promise.all([
          User.findOne({ _id: parentId }),
          Profile.findOne({ user_id: parentId }),
          User.findOne({ _id: account.user_id }),
          AssignedMembers.findOne({ user_id: account.user_id }),
          AssignedMembers.findOne({ user_id: parentId }),
          Transaction.findOne({
            user_id: account.user_id,
            ref_id: parentId,
            transaction_type: "debit",
            transaction_status: "pending",
            transaction_reason: "allocated member payment"
          }),
          Transaction.findOne({
            user_id: parentId,
            ref_id: account.user_id,
            transaction_type: "credit",
            transaction_status: "pending",
            transaction_reason: "member payment"
          })
        ]);

        // let isLevelCount = false;
        const parentLevel = await Level.findOne({ _id: parentUser.level_id });
        const userLevel = await Level.findOne({ _id: loadedUser.level_id });
        const userNumber = userLevel?.level_number || 0;

        const diff_level = parentLevel?.level_number - userNumber;

        // if (parentProfile.isAdmin) {
        //   const diff = parentLevel.level_number - userNumber;
        //   if (diff !== 1) {
        //     parentLevel.level_count -= 1;
        //     await parentLevel.save();
        //     isLevelCount = true;
        //   }
        // }

        if (transactionParent) {
          transactionUser.transaction_status = "failure";
          transactionParent.transaction_status = "failure";
          await Promise.all([transactionUser.save(), transactionParent.save()]);
        }

        // if (parentAssignedMembers && !isLevelCount) {
        //   if(parentAssignedMembers.count >= 0 ){
        //     parentAssignedMembers.count -= 1;
        //   }
        //   await parentAssignedMembers.save();

        //   if (userNumber > 1) {
        //     const count = userLevel.members_number - userAssignedMembers.count;
        //     parentLevel.level_count -= count;
        //     await parentLevel.save();
        //   }
        // }

        if(parentAssignedMembers && diff_level <= 1 && parentAssignedMembers.count > 0){
          parentAssignedMembers.count -= 1;
          await parentAssignedMembers.save();
        }

        userProfile.parents = userProfile.parents.filter(item => item !== userProfile.parent_id) || [];
        userProfile.parents.push(rootUser._id);
        userProfile.parent_id = rootUser._id;
        userProfile.deleted_at = new Date();
        loadedUser.deleted_at = new Date();
        userAssignedMembers.deleted_at = new Date();

        await Promise.all([userAssignedMembers.save(), userProfile.save(), loadedUser.save()]);

        console.log(`Updated deleted_at for user profile with account_id: ${account.user_id}`);
        await createNotification(account.user_id, "Failed Upgrade: This account has been deactivated", "error", "upgrade");
      } else {
        console.log(`User profile not found or is admin for account_id: ${account.user_id}`);
      }
    }
  } catch (error) {
    console.error('Error occurred:', error);
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
            const adminProfile = await Profile.findOne({isAdmin: true});
        
            
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
upgrade_rule.minute = [0,1,2,3,4, 5,6,6,7,8,9, 10,11,12,13,14, 15,16,17,18,19, 20,21,22,23,24, 25,26, 30,31,32,33,34, 35, 40,41, 42,43,44, 45,46,47,48,49,50, 51,,52,53,54, 55,56,57,58,59];

let subscription_rule = new schedule.RecurrenceRule();
subscription_rule.minute = [0, 5, 10, 15, 20,25, 30, 35, 45, 50, 55];

let upgrade_account_rule = new schedule.RecurrenceRule();
upgrade_account_rule.minute = [0,1,2,3,4, 5,6,6,7,8,9, 10,11,12,13,14, 15,16,17,18,19, 20,21,22,23,24, 25,26, 30,31,32,33,34, 35, 40,41, 42,43,44, 45,46,47,48,49,50, 51,,52,53,54, 55,56,57,58,59];

// Define the cron job
schedule.scheduleJob(upgrade_rule, upgrade_cron);

schedule.scheduleJob(subscription_rule, subscription_cron);

schedule.scheduleJob(upgrade_account_rule, upgrade_account_cron);

console.log('Cron script started.');