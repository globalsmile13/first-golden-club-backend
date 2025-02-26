// schedule.js
const schedule = require('node-schedule');
require('dotenv').config();

// const mongoose = require('mongoose');
const Profile = require('../models/profile');
const Transaction = require('../models/transactions');
const AssignedMembers = require('../models/assignedMembers');
const Subscription = require('../models/subscription');
const User = require('../models/user');
const Level = require('../models/level');
const Wallet = require('../models/wallet');
const { ErrorResponse, SuccessResponse } = require('../lib/apiResponse');
const { createNotification } = require('../controllers/notification');

// --- upgrade_cron ---
// Processes accounts where an upgrade is due (upgrade_date older than one hour)
// and marks them as "achieved", then sends notifications.
// (Note: This code uses a "root" admin user as fallback when no parent is assigned.)
const upgrade_cron = async () => {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const defaultingAccounts = await AssignedMembers.find({
      upgrade_date: { $lte: oneHourAgo, $ne: null },
      deleted_at: null
    });

    console.log("upgrade_cron - defaultingAccounts:", defaultingAccounts);

    let rootProfile = null, rootUser = null;
    if (defaultingAccounts.length > 0) {
      rootProfile = await Profile.findOne({ isAdmin: true });
      if (rootProfile) {
        rootUser = await User.findById(rootProfile.user_id);
      }
    }

    // Process each defaulting account
    for (const account of defaultingAccounts) {
      const userProfile = await Profile.findOne({ user_id: account.user_id });
      if (!userProfile) {
        console.warn(`No profile found for account_id: ${account.user_id}. Skipping.`);
        continue;
      }
      console.log("upgrade_cron - processing userProfile:", userProfile);

      if (userProfile.isAdmin) continue; // Skip admin accounts

      // Determine current parent: use parent_id or, if missing, last element of parents array
      const parentId = userProfile.parent_id || 
                       (Array.isArray(userProfile.parents) && userProfile.parents.length > 0
                         ? userProfile.parents[userProfile.parents.length - 1]
                         : null);

      if (!parentId) {
        // If no parent is assigned, assign the rootUser (if available)
        if (rootUser) {
          const [loadedUser, userAssignedMembers] = await Promise.all([
            User.findById(account.user_id),
            AssignedMembers.findOne({ user_id: account.user_id })
          ]);
          if (!userProfile.parents) userProfile.parents = [];
          userProfile.parents.push(rootUser._id);
          userProfile.parent_id = rootUser._id;
          userProfile.deleted_at = new Date();
          loadedUser.deleted_at = new Date();
          userAssignedMembers.deleted_at = new Date();
          await Promise.all([userAssignedMembers.save(), userProfile.save(), loadedUser.save()]);
          continue;
        } else {
          console.warn(`No parent available for account_id: ${account.user_id}. Skipping.`);
          continue;
        }
      }

      console.log("upgrade_cron - current parentId:", parentId);

      // Retrieve relevant documents in parallel
      const [
        parentUser,
        parentProfile,
        loadedUser,
        userAssignedMembers,
        parentAssignedMembers,
        transactionUser,
        transactionParent
      ] = await Promise.all([
        User.findById(parentId),
        Profile.findOne({ user_id: parentId }),
        User.findById(account.user_id),
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

      if (!parentUser) {
        console.warn(`Parent User with ID ${parentId} not found. Skipping account ${account.user_id}.`);
        continue;
      }
      const parentLevel = await Level.findById(parentUser.level_id);
      const userLevel = await Level.findById(loadedUser.level_id);
      const userNumber = userLevel ? userLevel.level_number : 0;
      const diff_level = parentLevel ? parentLevel.level_number - userNumber : 0;

      if (transactionUser && transactionParent) {
        transactionUser.transaction_status = "failure";
        transactionParent.transaction_status = "failure";
        await Promise.all([transactionUser.save(), transactionParent.save()]);
      }

      if (parentAssignedMembers && diff_level <= 1 && parentAssignedMembers.count > 0) {
        parentAssignedMembers.count -= 1;
        await parentAssignedMembers.save();
      }

      // Remove current parentId from the parents array if present, then add the rootUser as the new parent.
      if (userProfile.parents && Array.isArray(userProfile.parents)) {
        userProfile.parents = userProfile.parents.filter(item => item.toString() !== parentId.toString());
      } else {
        userProfile.parents = [];
      }
      if (rootUser) {
        userProfile.parents.push(rootUser._id);
        userProfile.parent_id = rootUser._id;
      }
      userProfile.deleted_at = new Date();
      loadedUser.deleted_at = new Date();
      userAssignedMembers.deleted_at = new Date();

      await Promise.all([userAssignedMembers.save(), userProfile.save(), loadedUser.save()]);
      console.log(`upgrade_cron - Updated account_id: ${account.user_id}`);
      await createNotification(account.user_id, "Failed Upgrade: This account has been deactivated", "error", "upgrade");
    }
  } catch (error) {
    console.error('Error in upgrade_cron:', error);
  }
};

// --- subscription_cron ---
// Processes subscription failures and deactivates the account if necessary.
const subscription_cron = async () => {
  try {
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    oneMonthAgo.setDate(oneMonthAgo.getDate() + 1);
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    const defaultingAccounts = await Subscription.find({
      subscription_date: { $lt: new Date(), $ne: null }
    });

    if (defaultingAccounts) {
      console.log("subscription_cron - defaultingAccounts:", defaultingAccounts);
      for (const account of defaultingAccounts) {
        const userProfile = await Profile.findOne({ user_id: account.user_id });
        const adminProfile = await Profile.findOne({ isAdmin: true });
        if (userProfile && adminProfile) {
          const [subscriptionUser, transactionUser, transactionParent] = await Promise.all([
            Subscription.findOne({ user_id: account.user_id }),
            Transaction.findOne({
              user_id: account.user_id,
              ref_id: adminProfile.user_id,
              transaction_type: "debit",
              transaction_status: "pending",
              transaction_reason: "subscription"
            }),
            Transaction.findOne({
              user_id: adminProfile.user_id,
              ref_id: account.user_id,
              transaction_type: "credit",
              transaction_status: "pending",
              transaction_reason: "subscription"
            })
          ]);
    
          if (transactionUser && transactionParent) {
            transactionUser.transaction_status = "failure";
            transactionParent.transaction_status = "failure";
            await Promise.all([transactionUser.save(), transactionParent.save()]);
          }
    
          subscriptionUser.subscription_paid = false;
          userProfile.deleted_at = new Date();
          await userProfile.save();
          console.log(`subscription_cron - Updated account_id: ${account.user_id}`);
          await createNotification(account.user_id, "Failed subscription: Your account has become inactive", "pending", "subscription");
        } else {
          console.log(`subscription_cron - User profile not found for account_id: ${account.user_id}`);
        }
      }
    }
  } catch (error) {
    console.error('Error in subscription_cron:', error);
  }
};

// --- upgrade_account_cron ---
// Processes upgrades: marks account as ready for upgrade, resets paid_count, and sends notifications.
const upgrade_account_cron = async () => {
  try {
    const defaultingAccounts = await AssignedMembers.find({
      paid_count: 2,
      upline_paid: false,
      state: 'unachieved'
    });
    console.log("upgrade_account_cron - defaultingAccounts: ", defaultingAccounts);
    
    for (const account of defaultingAccounts) {
      const [userProfile, userLoaded, userAssignedMembers] = await Promise.all([
        Profile.findOne({ user_id: account.user_id }),
        User.findById(account.user_id),
        AssignedMembers.findOne({ user_id: account.user_id })
      ]);
      const userLevel = await Level.findById(userLoaded.level_id);
      if (userProfile && !userProfile.isAdmin) {
        if (userLevel.level_number > 1) {
          userAssignedMembers.upgrade_date = new Date();
          userAssignedMembers.state = "achieved";
          // Reset paid_count upon upgrade
          userAssignedMembers.paid_count = 0;
          await createNotification(account.user_id, "Upgrade: This account is ready for upgrade", "success", "upgrade");
        }
    
        await Promise.all([userAssignedMembers.save()]);
        console.log(`upgrade_account_cron - Updated upgrade info for account_id: ${account.user_id}`);
        await createNotification(account.user_id, "Failed Upgrade: This account has been deactivated", "error", "upgrade");
      } else {
        console.log(`upgrade_account_cron - User profile not found or is admin for account_id: ${account.user_id}`);
      }
    }
  } catch (error) {
    console.error('Error in upgrade_account_cron:', error);
  }
};

// --- deleteDeactivatedAccountsCron ---
// Deletes users, profiles, and wallets for accounts deactivated over one hour ago.
const deleteNoPaymentAccountsCron = async () => {
  try {
    // const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const fiveMinuteAgo = new Date(Date.now() - 60 * 5 * 1000);
    // Find non-admin users registered more than one hour ago
    const usersToCheck = await User.find({
      createdAt: { $lte: fiveMinuteAgo },
      isAdmin: { $ne: true }
    });

    console.log("deleteNoPaymentAccountsCron - Users registered >1hr ago:", usersToCheck.length);

    let userIdsToDelete = [];
    for (const user of usersToCheck) {
      const paymentExists = await Transaction.exists({
        user_id: user._id,
        transaction_status: "success"
      });
      if (!paymentExists) {
        userIdsToDelete.push(user._id);
      }
    }
    console.log("deleteNoPaymentAccountsCron - User IDs to delete:", userIdsToDelete);

    if (userIdsToDelete.length === 0) {
      console.log("deleteNoPaymentAccountsCron - No users found without a payment.");
      return;
    }

    await User.deleteMany({ _id: { $in: userIdsToDelete } });
    await Profile.deleteMany({ user_id: { $in: userIdsToDelete } });
    await Wallet.deleteMany({ user_id: { $in: userIdsToDelete } });
    console.log("deleteNoPaymentAccountsCron - Deletion complete.");
  } catch (error) {
    console.error("Error in deleteNoPaymentAccountsCron:", error);
  }
};

// --- clearUnapprovedPaymentsCron ---


// Finds pending credit transactions older than one hour, marks them as expired, and decrements the parent's assigned count.

const clearUnapprovedPaymentsCron = async () => {
  try {
    // const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const fiveMinuteAgo = new Date(Date.now() - 60 * 5 * 1000);
    const unapprovedTransactions = await Transaction.find({
      transaction_status: "pending",
      createdAt: { $lte: fiveMinuteAgo },
      $or: [
        { transaction_type: "debit", transaction_reason: "allocated member payment" },
        { transaction_type: "credit", transaction_reason: "member payment" }
      ]
    });
    
    console.log(`clearUnapprovedPaymentsCron - Found ${unapprovedTransactions.length} unapproved transactions older than one hour.`);
    
    for (const tx of unapprovedTransactions) {
      // Mark transaction as failure regardless of type.
      tx.transaction_status = "failure";
      await tx.save();
      
      // Process debit transactions: decrement parent's assigned count.
      if (tx.transaction_type && tx.transaction_type.toLowerCase() === "debit") {
        const parentAssigned = await AssignedMembers.findOne({ user_id: tx.ref_id });
        if (parentAssigned && parentAssigned.count > 0) {
          parentAssigned.count = Math.max(0, parentAssigned.count - 1);
          await parentAssigned.save();
          console.log(`clearUnapprovedPaymentsCron - Decremented assigned count for parent ${tx.ref_id}.`);
        } else {
          console.log(`clearUnapprovedPaymentsCron - No assigned count to decrement for parent ${tx.ref_id}.`);
        }
      } else if (tx.transaction_type && tx.transaction_type.toLowerCase() === "credit") {
        console.log(`clearUnapprovedPaymentsCron - Transaction is credit; no change to parent's count for parent ${tx.ref_id}.`);
      } else {
        console.log(`clearUnapprovedPaymentsCron - Unknown transaction type ${tx.transaction_type}.`);
      }
    }
  } catch (error) {
    console.error("Error in clearUnapprovedPaymentsCron:", error);
  }
};



// --- Scheduling Cron Jobs ---

let deleteAccountsRule = new schedule.RecurrenceRule();
deleteAccountsRule.minute = new schedule.Range(0, 59, 1);


let clearPaymentsRule = new schedule.RecurrenceRule();
clearPaymentsRule.minute = new schedule.Range(0, 59, 1);

let upgrade_rule = new schedule.RecurrenceRule();
upgrade_rule.minute = new schedule.Range(0, 59, 1); // simplified rule for demonstration

let subscription_rule = new schedule.RecurrenceRule();
subscription_rule.minute = [0, 5, 10, 15, 20, 25, 30, 35, 45, 50, 55];

let upgrade_account_rule = new schedule.RecurrenceRule();
upgrade_account_rule.minute = new schedule.Range(0, 59, 1); // simplified rule for demonstration

schedule.scheduleJob(upgrade_rule, upgrade_cron);
schedule.scheduleJob(subscription_rule, subscription_cron);
schedule.scheduleJob(upgrade_account_rule, upgrade_account_cron);
schedule.scheduleJob(deleteAccountsRule, deleteNoPaymentAccountsCron);
schedule.scheduleJob(clearPaymentsRule, clearUnapprovedPaymentsCron);

console.log('Cron script started.');
