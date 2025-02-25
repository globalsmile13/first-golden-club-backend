const validate = require('../validation/paymentValidation')

const User = require('../models/user');
const Profile = require('../models/profile');
const Wallet = require('../models/wallet');
const Level = require('../models/level');
const Transaction = require('../models/transactions');
const AssignedMembers = require('../models/assignedMembers');
const Subscription = require('../models/subscription');
const { ErrorResponse, SuccessResponse } = require('../lib/apiResponse');
const { createNotification } = require('./notification');
//const Payment = require('../models/payment');

exports.reassignUser = async (req, res, next) => { 
  try {
    const userId = req.userId;

    const currentUser = await User.findById(userId)
      .populate('profile')
      .populate('level_id')
      .populate('assigned_members')
      .lean();

    if (!currentUser) {
      return res.status(401).send(ErrorResponse(401, "Unauthorized access", null, null));
    }

    if (!currentUser.assigned_members || currentUser.assigned_members.state !== "achieved") {
      return res.status(401).send(ErrorResponse(401, "You have not reached required members", null, null));
    }

    if (!currentUser.profile.isAdmin && currentUser.level_id?.level_number === 10) {
      return res.status(401).send(ErrorResponse(401, "You have reached the maximum level", null, null));
    }
    if (currentUser.profile.isAdmin && currentUser.level_id?.level_number === 11) {
      return res.status(401).send(ErrorResponse(401, "You have reached the maximum level", null, null));
    }

    const profileCheck = await Profile.findOne({ user_id: userId });
    if (!profileCheck) {
      return res.status(400).send(ErrorResponse(400, "User profile not found", null, null));
    }

    // Determine the currently assigned parent.
    let currentParentId = profileCheck.parent_id;
    if (!currentParentId && Array.isArray(profileCheck.parents) && profileCheck.parents.length > 0) {
      currentParentId = profileCheck.parents[profileCheck.parents.length - 1];
    }
    if (!currentParentId) {
      return res.status(400).send(ErrorResponse(400, "User does not have an existing parent", null, null));
    }

    // Retrieve the current parent's details.
    const currentParent = await User.findById(currentParentId)
      .populate('profile level_id assigned_members')
      .lean();
    if (!currentParent) {
      return res.status(400).send(ErrorResponse(400, "Current allocated parent not found", null, null));
    }

    // Decrement the assigned members count of the current parent by one.
    // await AssignedMembers.findOneAndUpdate({ user_id: currentParent._id }, { $inc: { count: -1 } });
    
    // Clear the current parent assignment.
    await Profile.findOneAndUpdate({ user_id: userId }, { parent_id: null });

    const currentUserLevelNumber = currentUser.level_id ? currentUser.level_id.level_number : 0;

    // Find eligible parent candidates from the next level (current level + 1), excluding the current parent's id.
    const users = await User.find({
      _id: { $ne: userId, $ne: currentParentId },
      'profile.deleted_at': null
    })
      .populate('profile')
      .populate('level_id')
      .populate('assigned_members')
      .lean();

    let eligibleCandidates = users.filter(candidate => {
      if (!candidate.assigned_members || !candidate.level_id) return false;
      const restriction = candidate.assigned_members.paid_count === 2 && candidate.assigned_members.upline_paid === false;
      return (
        !restriction &&
        candidate.assigned_members.upgrade_date === null &&
        candidate.level_id.level_number === (currentUserLevelNumber + 1) &&
        candidate.assigned_members.state === "unachieved" &&
        candidate.assigned_members.count < candidate.level_id.members_number &&
        candidate.profile.deleted_at === null
      );
    });

    // Sort eligible candidates FIFO: primary by assigned_members.count (lowest first), then by createdAt (oldest first).
    eligibleCandidates.sort((a, b) => {
      const countDiff = a.assigned_members.count - b.assigned_members.count;
      if (countDiff !== 0) return countDiff;
      return new Date(a.createdAt) - new Date(b.createdAt);
    });

    let parentUser = eligibleCandidates.length > 0 ? eligibleCandidates[0] : null;
    if (!parentUser) {
      return res.status(400).send(ErrorResponse(400, "No available parent user in level " + (currentUserLevelNumber + 1), null, null));
    }

    // Assign the new parent's ID.
    await Profile.findOneAndUpdate({ user_id: userId }, { parent_id: parentUser._id });

    // Increment the new parent's assigned members count.
    /*await AssignedMembers.findOneAndUpdate(
      { user_id: parentUser._id },
      { $inc: { count: 1 } }
    );*/

    // Retrieve the new parent's wallet details.
    let parentWallet = await Wallet.findOne({ user_id: parentUser._id }).lean();

    const [populatedParentUser, populatedUser] = await Promise.all([
      User.findById(parentUser._id)
        .select('-password')
        .populate('profile assigned_members level_id')
        .lean(),
      User.findById(userId)
        .select('-password')
        .populate('profile')
        .lean()
    ]);

    return res.send(SuccessResponse(201, "Parent User reassigned successfully", {
      newUser: populatedParentUser,
      parent_wallet: parentWallet,
      user: populatedUser
    }, null));

  } catch (error) {
    console.error("Error in reassignUser:", error);
    return res.status(500).send(ErrorResponse(500, "Internal server error", error, null));
  }
};



  exports.activateAccount = async (req, res, next) => { 
    try {
      const userId = req.userId;
  
      // Retrieve the current user with profile, level, and assigned_members
      const currentUser = await User.findById(userId)
        .populate('profile')
        .populate('level_id')
        .populate('assigned_members')
        .lean();
  
      if (!currentUser) {
        console.error('Error finding current user');
        return res.status(401).send(ErrorResponse(401, "Unauthorized access", null, null));
      }
  
      // Check if the user has reached required members for upgrade.
      if (currentUser.assigned_members.state === "unachieved" && currentUser.assigned_members.upgrade_date === null) {
        return res.status(401).send(ErrorResponse(401, "You have not reached required members", null, null));
      }
  
      // Prevent activation if the maximum level is reached.
      if (!currentUser.profile.isAdmin && currentUser.level_id?.level_number === 10) {
        return res.status(401).send(ErrorResponse(401, "You have reached the maximum level", null, null));
      }
      if (currentUser.profile.isAdmin && currentUser.level_id?.level_number === 11) {
        return res.status(401).send(ErrorResponse(401, "You have reached the maximum level", null, null));
      }
  
      // Retrieve the user's profile.
      const profileCheck = await Profile.findOne({ user_id: userId });
      if (!profileCheck) {
        return res.status(400).send(ErrorResponse(400, "User profile not found", null, null));
      }
  
      // If a parent is already assigned, check if its quota is not yet full.
      if (profileCheck.parent_id) {
        const currentParent = await User.findById(profileCheck.parent_id)
          .populate('profile')
          .populate('level_id')
          .populate('assigned_members')
          .lean();
        if (currentParent && currentParent.assigned_members.count < currentParent.level_id.members_number) {
          // Use the same parent if their quota isn't reached.
          const parentWallet = await Wallet.findOne({ user_id: currentParent._id }).lean();
          const populatedUser = await User.findById(userId)
            .select('-password')
            .populate('profile')
            .lean();
          return res.send(SuccessResponse(201, "Parent User retrieved successfully", {
            ...populatedUser,
            parent: currentParent,
            parent_wallet: parentWallet
          }, null));
        }
      }
  
      // No valid parent is currently assigned or quota is reached.
      // Determine the next level: current level + 1.
      const currentUserLevelNumber = currentUser.level_id ? currentUser.level_id.level_number : 0;
  
      // Retrieve all candidates from the next level.
      const candidates = await User.find({
        _id: { $ne: userId },
        'profile.deleted_at': null
        /*$or: [
          { 'profile.parents': { $nin: [userId] }, 'profile.deleted_at': null },
          //{ 'profile.isAdmin': true, 'profile.deleted_at': null }
        ]*/
      })
        .populate('profile')
        .populate('level_id')
        .populate('assigned_members')
        .lean();
  
      // Filter candidates: candidate's level must equal current level + 1,
      // and candidate's assigned count must be less than candidate.level.members_number.
      let eligibleCandidates = candidates.filter(candidate => {
        if (!candidate.assigned_members || !candidate.level_id) return false;
        // Additional restrictions if needed:
        const restriction = candidate.assigned_members.paid_count === 2 && candidate.assigned_members.upline_paid === false;
        return (
          !restriction &&
          candidate.level_id.level_number === (currentUserLevelNumber + 1) &&
          candidate.assigned_members.state === "unachieved" &&
          candidate.assigned_members.count < candidate.level_id.members_number &&
          candidate.assigned_members.upgrade_date == null &&
          candidate.profile.deleted_at === null
        );
      });
  
      // Create a snapshot: sort eligible candidates FIFO by createdAt (oldest first)
      eligibleCandidates.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  
      // The allocated parent should be the first candidate in this snapshot
      // whose assigned_members.count is still less than candidate.level.members_number.
      let parentUser = eligibleCandidates.length > 0 ? eligibleCandidates[0] : null;
      if (!parentUser) {
        return res.status(400).send(ErrorResponse(400, "No available parent user in level " + (currentUserLevelNumber + 1), null, null));
      }
  
      // Update the user's profile with the selected parent's ID.
      profileCheck.parent_id = parentUser._id;
      await profileCheck.save();
  
      // Increment the parent's assigned_members count.
      const parentAssignedMembers = await AssignedMembers.findOne({ user_id: parentUser._id });
      if (!parentUser.profile.isAdmin) {
        parentAssignedMembers.count += 1;
      }
      await parentAssignedMembers.save();
  
      // Retrieve parent's wallet details.
      let parentWallet = await Wallet.findOne({ user_id: parentUser._id }).lean();
  
      // Retrieve updated data.
      const [populatedParentUser, populatedUser] = await Promise.all([
        User.findById(parentUser._id)
          .select('-password')
          .populate('profile assigned_members level_id')
          .lean(),
        User.findById(userId)
          .select('-password')
          .populate('profile')
          .lean()
      ]);
  
      return res.send(SuccessResponse(201, "Parent User retrieved successfully", {
        ...populatedUser,
        parent: populatedParentUser,
        parent_wallet: parentWallet
      }, null));
      
    } catch (error) {
      console.error("Error in activateAccount:", error);
      return res.status(500).send(ErrorResponse(500, "Internal server error", error, null));
    }
  };
  
  
  

exports.initiatePayment = async (req, res, next) => {
    const userId = req.userId;

    const [loadedUser, userProfile, loadedAssignedMembers] = await Promise.all([
        User.findOne({_id:userId}).lean(),
        Profile.findOne({user_id: userId}).lean(),
        AssignedMembers.findOne({user_id: userId})
        
    ])

    let userLevel = await Level.findOne({_id: loadedUser.level_id});
    let level_amount;
    if(!userLevel){
        level_amount = 1000;
    }
    else{
        level_amount = userLevel.nextlevel_upgrade;
    }

    if(!loadedUser){
        return res.status(400).send(ErrorResponse(401, `An account with this userId does not exist`, null, null));
    }

    if(loadedAssignedMembers.state === "unachieved"){
        return res.status(401).send(ErrorResponse(401, `You have not reached required members`, null, null));
    }


    try{
        
        if(userProfile.isAdmin){
            
            const userWallet = await Wallet.findOne({user_id: userId});
            await createNotification(userId, "Payment intiated ", "success", "allocated member admin payment");

            let level;
            if(loadedUser.level_id === null){
                level = await Level.findOne({level_number: 1});
                loadedUser.level_id = level._id;
                
            }
            else{
                userLevel = await Level.findOne({_id: loadedUser.level_id});
                level = await Level.findOne({level_number: userLevel.level_number + 1});
                loadedUser.level_id = level._id;
            }

            loadedAssignedMembers.upline_paid = true;
            loadedAssignedMembers.state = "unachieved";
            loadedAssignedMembers.count = 0;
            loadedAssignedMembers.upgrade_date = null;
            

            const transactionUser = await new Transaction({
                wallet_id: userWallet._id,
                user_id: userId,
                ref_id: null,
                transaction_type: "debit",
                transaction_status: "success",
                transaction_reason: "Root admin: Transaction approved successfully",
                amount: level.member_amount
            })


            await Promise.all([
                User.findByIdAndUpdate(userId, loadedUser),
                AssignedMembers.findByIdAndUpdate(loadedAssignedMembers._id, loadedAssignedMembers),
                transactionUser.save()
            ])

            const data = {
                ...loadedUser,
                profile: {...userProfile},
                transaction_id:  transactionUser._id
            }

            return res.send(SuccessResponse(201, "Root admin upgraded successfully", data, null));
        }
        
        const parentId = userProfile.parent_id
        if (!parentId) {
            return res.status(401).send(ErrorResponse(401, `parent is missing, please kindly activate the user`, null, null));
        }

        const parentLevel = await User.findById(parentId).populate('level_id');
        
        const [parentTransaction, parentWallet, parentProfile, userWallet] = await Promise.all([
            Transaction.findOne({
                user_id:parentId,
                ref_id: userId,
                transaction_type:"credit",
                transaction_status:"pending",
                transaction_reason:"member payment"}),
            Wallet.findOne({user_id: parentId}),
            Profile.findOne({user_id: parentId}),
            Wallet.findOne({user_id: userId})
        ]);
        
        let amount = 0;
        // if(parentLevel.level_id){
        //     // amount = parentLevel.level_id?.member_amount;
        //     amount = level_amount
        // }
        // else{
        //     amount = 1000
        // }
        amount = level_amount;
        
        //returns upline transaction details if it already exists
        if(parentTransaction){
            const data = {
                profile: {...userProfile},
                parent_wallet: parentWallet,
                parent_profile: parentProfile,
                transaction_id:  parentTransaction._id
            }
            return res.send(SuccessResponse(201, "Parent User details retrieved successfully", data, null));
        }

        const transactionParent = await new Transaction({
            wallet_id: parentWallet._id,
            user_id: parentId,
            ref_id: userId,
            transaction_type: "credit",
            transaction_status: "pending",
            transaction_reason: "member payment",
            amount: amount
        });

        const transactionUser = await new Transaction({
            wallet_id: userWallet._id,
            user_id: userId,
            ref_id: parentId,
            transaction_type: "debit",
            transaction_status: "pending",
            transaction_reason: "allocated member payment",
            amount: amount
        });

        await createNotification(userId, "Payment to allocated member initialized", "pending", "payment");
        await createNotification(parentId, "Pending payment approval from a member", "pending", "approval");

        await Promise.all([
            transactionParent.save(),
            transactionUser.save()
        ]);
        
        const data = {
            profile: {...userProfile},
            parent_wallet: parentWallet,
            parent_profile: parentProfile,
            transaction_id:  transactionParent._id
        };

        return res.send(SuccessResponse(201, "Parent User details retrieved successfully", data, null));
    }
    catch(error){
        console.log(error)
        return res.status(500).send(ErrorResponse(500, "Internal server error", error, null));
      }
}

//The user here is the upline approving the downline
exports.approvePayment = async (req, res, next) => {
    const {error} = validate.validateApproveTransaction(req.body);
    if(error){
        return res.send(ErrorResponse(422, error.details[0].message, null, null));
    }

    try{

    const userId = req.userId;
    const transaction_id = req.body.transaction_id;

    const [loadedUser, profile, transactionDetails] = await Promise.all([
        User.findOne({_id:userId}),
        Profile.findOne({user_id: userId}),
        Transaction.findOne({_id: transaction_id})
    ]);

    if(!loadedUser){
        return res.status(401).send(ErrorResponse(401, `An account with this userId does not exist`, null, null));
    }
    const downlineUserId = transactionDetails.ref_id;

    if(transactionDetails.transaction_status === "success"){
        return res.status(401).send(ErrorResponse(401, `This transaction has already been approved`, null, null));
    }

    
    const downlineTransactionsDetails = await Transaction.findOne({ref_id: userId, 
        user_id:downlineUserId, transaction_status:"pending", 
        transaction_reason:"allocated member payment", transaction_type:"debit"})

    if(!downlineTransactionsDetails){
            return res.status(401).send(ErrorResponse(401, `This member transaction not found`, null, null));
        }

        const [userAssignedMembers, userWallet, userLevel, userProfile,
            downlineUser, downlineProfile, downlineWallet, downlineAssignedMembers] = 
            await Promise.all([
            AssignedMembers.findOne({_id: loadedUser.assigned_members}),
            Wallet.findOne({user_id: userId}),
            Level.findOne({_id: loadedUser.level_id}),
            Profile.findOne({user_id: userId}),
            User.findOne({_id: downlineUserId}),
            Profile.findOne({user_id: downlineUserId}),
            Wallet.findOne({user_id: downlineUserId}),
            AssignedMembers.findOne({user_id: downlineUserId})
        ]);

        let downlineUserLevel = await Level.findOne({_id: downlineUser.level_id});

        // if(!downlineUser.level_id){
        //     downlineLevel = await Level.findOne({level_number: 1})
        //     downlineUser.level_id =  downlineLevel._id
        //     downlineAssignedMembers.level_id =  downlineLevel._id 
        // }
        // else{
        //     downlineLevel = await Level.findOne({level_number: userLevel.level_number})
        //     downlineUser.level_id =  downlineLevel._id
        //     downlineAssignedMembers.level_id =  downlineLevel._id
        // }
        

        //updating the downline level
        let downlineLevel;
        if(!downlineUser.level_id){
            downlineLevel = await Level.findOne({level_number: 1});
        }else{
            console.log("downlineUserLevel => ",downlineUserLevel)
            let level_number = downlineUserLevel?.level_number || 1;
            console.log("downlineUserLevel => ",level_number)
            if(level_number <= 1){
                downlineLevel = await Level.findOne({level_number: level_number+1});
            }
            else{
                downlineLevel = downlineUserLevel;
            }
        }
        
        downlineUser.level_id =  downlineLevel._id;
        downlineAssignedMembers.level_id = downlineLevel._id;
        if(!userProfile.isAdmin){
            downlineProfile.parent_id = null;
        }
        downlineProfile.deleted_at = null;
        downlineUser.deleted_at = null;
        downlineAssignedMembers.deleted_at = null;
        downlineProfile.parents.push(userId);

        console.log("downlineLevel => ",downlineLevel)

        if(downlineLevel.level_number === 5 && downlineProfile.isAdmin !== true){
            let downlineSubscription = await Subscription.findOne({user_id: downlineUser._id});
            if(downlineSubscription.isActive === false){
                downlineSubscription.isActive = true;
                downlineSubscription.subscription_paid = false;
                downlineSubscription.subscription_date = null;
                downlineSubscription.amount = 500;
                await createNotification(downlineUser._id, "Subscription: This account needs to subscribe", "success", "subscription");
            }
            await downlineSubscription.save()
        }


        // updating user assigned members
        if(downlineLevel.level_number <= 1){
            downlineAssignedMembers.upline_paid = false;
        }  
        else{
            downlineAssignedMembers.upline_paid = true;
        }
        

        downlineAssignedMembers.state = "unachieved";
        downlineAssignedMembers.upgrade_date = null;

        console.log("userLevel => ",userLevel)
        console.log("userAssignedMembers => ",userAssignedMembers)

        let downlineLevelNumber = downlineLevel?.level_number ?? 0;

        let parentLevelNumber = userLevel?.level_number ?? 0;

        let diffLevel = parentLevelNumber - downlineLevelNumber;

        let paidCount = 0;

        if(userProfile.isAdmin  && diffLevel >= 1){
            paidCount = userAssignedMembers.paid_count + 0;
            userAssignedMembers.paid_count += 0;
        }
        else{
            paidCount = userAssignedMembers.paid_count + 1;
            userAssignedMembers.paid_count += 1;
            // if(!userProfile.isAdmin && paidCount === 2){
            //     downlineAssignedMembers.upline_paid = false;
            // }
        }
        


        if(userLevel.members_number <= paidCount &&  !userProfile.isAdmin && userAssignedMembers.state === "unachieved"){
            if(userLevel.level_number === 1){
                console.log("new member")
                userAssignedMembers.upline_paid = false;
                userAssignedMembers.state = "achieved";
                userAssignedMembers.count = 0;
                userAssignedMembers.paid_count = 0;
                userAssignedMembers.upgrade_date = new Date();
                await createNotification(userId, "Upgrade: This account is ready for upgrade", "success", "upgrade");
            }
            else if(userLevel.level_number === 10){
                userAssignedMembers.upline_paid = false;
                userAssignedMembers.state = "achieved"; 
                userAssignedMembers.count = 0;
                userAssignedMembers.paid_count = 0;
                userAssignedMembers.deleted_at = new Date();
                userProfile.deleted_at = new Date();
                loadedUser.deleted_at = new Date();
            }
            else{
                console.log("old member: ", userLevel);
                nextLevel = await Level.findOne({level_number: userLevel.level_number + 1});
                loadedUser.level_id = nextLevel._id;
                userAssignedMembers.upline_paid = false;
                userAssignedMembers.state = "unachieved";
                userAssignedMembers.count = 0;
                userAssignedMembers.paid_count = 0;
                await createNotification(userId, "Upgrade: This account has been upgraded", "success", "upgrade");
        
            }
        }

        if(userLevel.admin_count <= paidCount &&  userProfile.isAdmin){
            userAssignedMembers.upline_paid = true;
            userAssignedMembers.upgrade_date = new Date();
            userAssignedMembers.state = "achieved";
            userAssignedMembers.count = 0;
            userAssignedMembers.paid_count = 0;
            await createNotification(userId, "Upgrade: This account is ready for upgrade", "success", "upgrade");
        }

        //updating wallet balance
        // downlineWallet.balance -= userLevel.member_amount;
        userWallet.balance += userLevel.member_amount;

        //updating transaction for the upline
        transactionDetails.transaction_status = "success";


        //updating the transaction for the downline
        // const transactionDownline = await new Transaction({
        //     wallet_id: downlineWallet._id,
        //     user_id: downlineUserId,
        //     ref_id: userId,
        //     transaction_type: "debit",
        //     transaction_status: "success",
        //     transaction_reason: "upline payment",
        //     amount: userLevel.member_amount
        // })


        //updating the transaction for the downline
        downlineTransactionsDetails.transaction_status = "success";

        await Promise.all([
            userAssignedMembers.save(), 
            userWallet.save(), 
            downlineUser.save(), 
            downlineProfile.save(),
            downlineWallet.save(), 
            downlineAssignedMembers.save(),
            transactionDetails.save(),
            downlineTransactionsDetails.save(),
            loadedUser.save(),
            // downlineSubscription.save()
        ]);

        await createNotification(downlineUserId, "Allocated member has approved payment", "success", "payment");
        await createNotification(userId, "Approved payment for a member", "success", "approve");

        const data = {
            profile,
            asssigned_members: userAssignedMembers,
            wallet: userWallet
        };
        
        return res.send(SuccessResponse(201, "Transaction approved successfully", data, null));

    }
    catch(error){
        console.log(error);
        return res.send(ErrorResponse(500, "Internal server error", error, null));
      }
      
}

exports.initiateSubscription = async (req, res, next) => {
    const userId = req.userId;

    const [loadedUser, userProfile, loadedSubscription, adminProfile] = await Promise.all([
        User.findOne({_id:userId}).lean(),
        Profile.findOne({user_id: userId}).lean(),
        Subscription.findOne({user_id: userId}),
        Profile.findOne({isAdmin: true})
    ])

    const parentId = adminProfile.user_id

    if(!loadedUser){
        return res.status(400).send(ErrorResponse(401, `An account with this userId does not exist`, null, null));
    }

    if(loadedSubscription.isActive === false){
        return res.status(400).send(ErrorResponse(401, `Subscription level has not been reached`, null, null));
    }


    try{
        
        if(userProfile.isAdmin === true){
            return res.status(400).send(ErrorResponse(401, `Admin, Subscription doesn't apply to admin`, null, null));
        }
        

        
        const [parentTransaction, parentWallet, userWallet] = await Promise.all([
            Transaction.findOne({
                user_id:adminProfile.user_id,
                ref_id: userId,
                transaction_type:"credit",
                transaction_status:"pending",
                transaction_reason:"subscription"
            }),
            Wallet.findOne({user_id: adminProfile.user_id}),
            Wallet.findOne({user_id: userId})
        ]);
        
        let amount = loadedSubscription.amount

        //returns upline transaction details if it already exists
        if(parentTransaction){
            const data = {
                profile: {...userProfile},
                parent_wallet: parentWallet,
                parent_profile: adminProfile,
                transaction_id:  parentTransaction._id
            }
            return res.send(SuccessResponse(201, "Admin details retrieved successfully", data, null))
        }

        const transactionParent = await new Transaction({
            wallet_id: parentWallet._id,
            user_id: parentId,
            ref_id: userId,
            transaction_type: "credit",
            transaction_status: "pending",
            transaction_reason: "subscription",
            amount: amount
        })

        const transactionUser = await new Transaction({
            wallet_id: userWallet._id,
            user_id: userId,
            ref_id: parentId,
            transaction_type: "debit",
            transaction_status: "pending",
            transaction_reason: "subscription",
            amount: amount
        })

        await createNotification(userId, "Subscription payment initialized", "pending", "subscription")
        await createNotification(parentId, "Pending subscription payment from user", "pending", "approve")

        await Promise.all([
            transactionParent.save(),
            transactionUser.save()
        ])
        
        const data = {
            profile: {...userProfile},
            parent_wallet: parentWallet,
            parent_profile: adminProfile,
            transaction_id:  transactionParent._id
        }

        return res.send(SuccessResponse(201, "Admin details retrieved successfully", data, null))
    }
    catch(error){
        console.log(error)
        return res.status(500).send(ErrorResponse(500, "Internal server error", error, null)) 
      }
}

exports.approveSubscription = async (req, res, next) => {
    const {error} = validate.validateApproveTransaction(req.body);
    if(error){

        return res.send(ErrorResponse(422, error.details[0].message, null, null))
    }

    try{

    const userId = req.userId;
    const transaction_id = req.body.transaction_id;

    const [loadedUser, profile, transactionDetails] = await Promise.all([
        User.findOne({_id:userId}),
        Profile.findOne({user_id: userId}),
        Transaction.findOne({_id: transaction_id})
    ])

    if(!loadedUser){
        return res.send(ErrorResponse(401, `An account with this userId does not exist`, null, null));
    }

    if(transactionDetails.transaction_status === "success"){
        return res.send(ErrorResponse(401, `This transaction has already been approved`, null, null));
    }

    const subscriptionUserId = transactionDetails.ref_id;

    const subscriptionTransactionsDetails = await Transaction.findOne({
        ref_id: userId,
        user_id: subscriptionUserId,
        transaction_status: "pending",
        transaction_reason: "subscription",
        transaction_type: "debit"
    });

    console.log("subscriptionTransactionsDetails => ", subscriptionTransactionsDetails)
    console.log("transaction_id = ", transaction_id)
        const [subscriptionDetails, userWallet, subscriptionWallet] = 
            await Promise.all([
            Subscription.findOne({user_id: subscriptionUserId}),
            Wallet.findOne({user_id: userId}),
            Wallet.findOne({user_id: subscriptionUserId})
        ]);
        
        //updating the subscribed user details
        subscriptionDetails.subscription_paid = true;
        if (!subscriptionDetails.subscription_date) {
            subscriptionDetails.subscription_date = new Date();
        } else {
            const currentSubscriptionDate = new Date();
            currentSubscriptionDate.setMonth(currentSubscriptionDate.getMonth() + 1);
            subscriptionDetails.subscription_date = currentSubscriptionDate;
        }
        

        //updating wallet balance
        // subscriptionWallet.balance -= subscriptionDetails.amount;
        userWallet.balance += subscriptionDetails.amount;

        //updating transaction for the upline
        transactionDetails.transaction_status = "success";

        //updating the transaction for the downline
        subscriptionTransactionsDetails.transaction_status = "success"

        await Promise.all([
            subscriptionDetails.save(), 
            userWallet.save(), 
            subscriptionWallet.save(), 
            transactionDetails.save(),
            subscriptionTransactionsDetails.save()
        ])

        await createNotification(subscriptionUserId, "Admin has approved payment for subscription", "success", "subscription")
        await createNotification(userId, "Approved payment for a member subscription", "success", "approve")

        const data = {
            transaction:transactionDetails,
            wallet: userWallet
        }
        
        return res.status(201).send(SuccessResponse(201, "Transaction approved successfully", data, null));
    } catch (error) {
        console.error(error);
        return res.status(500).send(ErrorResponse(500, "Internal server error", error, null));
    }
      
}

exports.checkPayment = async (req, res, next) => {
    if(!req.query.transaction_id){
        return res.send(ErrorResponse(422, "transaction_id is missing", null, null))
    }

    const userId = req.userId;
    const transaction_id = req.query.transaction_id;

    let loadedUser = await User.findOne({_id:userId})

    if(!loadedUser){
        return res.send(ErrorResponse(401, `An account with this userId does not exist`, null, null));
    }


    try{
        const transactionDetails = await Transaction.findById(transaction_id)

        return res.send(SuccessResponse(201, "transaction details retrieved successfully", transactionDetails, null))

    } 


    catch(error){
        console.log(error)
        return res.send(ErrorResponse(500, "Internal server error", error, null)) 
      }
}

exports.getTransactions = async (req, res, next) => {
    

    const userId = req.userId;

    let loadedUser = await User.findOne({_id:userId})

    if(!loadedUser){
        return res.send(ErrorResponse(401, `An account with this userId does not exist`, null, null));
    }


    try{
        // const transactionDetails = await Transaction.find({
        //     $or: [
        //     { user_id: userId },
        //     { ref_id: userId }
        //   ]
        // })

        const transactionDetails = await Transaction.find({user_id:userId}).populate({
            path: 'ref_id',
            populate: { path: 'profile' }
          });

        return res.send(SuccessResponse(201, "transactions retrieved successfully", transactionDetails, null))

    } 


    catch(error){
        console.log(error)
        return res.send(ErrorResponse(500, "Internal server error", error, null)) 
      }
}

exports.getWallet = async (req, res, next) => {
    

    const userId = req.userId;

    let loadedUser = await User.findOne({_id:userId})

    if(!loadedUser){
        return res.send(ErrorResponse(401, `An account with this userId does not exist`, null, null));
    }


    try{
        const walletDetails = await Wallet.findOne({user_id:userId})

        return res.send(SuccessResponse(201, "wallet retrieved successfully", walletDetails, null))

    } 


    catch(error){
        console.log(error)
        return res.send(ErrorResponse(500, "Internal server error", error, null)) 
      }
}

exports.postWallet = async (req, res, next) => {
    
    const {error} = validate.validateWallet(req.body);
    if(error){
        return res.send(ErrorResponse(422, error.details[0].message, null, null))
    }

    const userId = req.userId;

    let loadedUser = await User.findOne({_id:userId})

    if(!loadedUser){
        return res.send(ErrorResponse(401, `An account with this userId does not exist`, null, null));
    }

    const account_name = req.body.account_name
    const bank_name = req.body.bank_name
    const account_number = req.body.account_number

    try{
        const walletDetails = await Wallet.findOne({user_id:userId})

        walletDetails.bank_name = bank_name
        walletDetails.account_number = account_number
        walletDetails.account_name = account_name

        await walletDetails.save()

        return res.send(SuccessResponse(201, "wallet retrieved successfully", walletDetails, null))

    } 


    catch(error){
        console.log(error)
        return res.send(ErrorResponse(500, "Internal server error", error, null)) 
      }
}
