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

exports.activateAccount = async (req, res, next) => {
    try {
        const userId = req.userId;

        // Fetch current user details
        const currentUser = await User.findById(userId)
            .populate('profile')
            .populate('level_id')
            .populate('assigned_members')
            .lean();

        if (!currentUser) {
            return res.status(401).send(ErrorResponse(401, 'User not found', null, null));
        }

        // Check for invalid state or max level restrictions
        if (
            currentUser.assigned_members.state === 'unachieved' &&
            currentUser.assigned_members.upgrade_date === null
        ) {
            return res
                .status(401)
                .send(ErrorResponse(401, 'You have not reached required members', null, null));
        }

        if (
            currentUser.level_id &&
            currentUser.assigned_members.state === 'achieved' &&
            currentUser.level_id.level_number === 10
        ) {
            return res
                .status(401)
                .send(ErrorResponse(401, 'You have reached the maximum level', null, null));
        }

        // Check if user already has a parent
        const userProfile = await Profile.findOne({ user_id: userId }).lean();
        if (!userProfile) {
            return res.status(400).send(ErrorResponse(400, 'User profile not found', null, null));
        }

        if (userProfile.parent_id) {
            const [retrievedParentUser, populatedUser, parentWallet] = await Promise.all([
                User.findById(userProfile.parent_id)
                    .select('-password')
                    .populate('profile')
                    .populate('assigned_members')
                    .populate('level_id')
                    .lean(),
                User.findById(userId).select('-password').populate('profile').lean(),
                Wallet.findOne({ user_id: userProfile.parent_id }).lean(),
            ]);

            const loadedData = {
                ...populatedUser,
                parent: retrievedParentUser,
                parent_wallet: parentWallet,
            };

            return res.send(SuccessResponse(201, 'Parent User retrieved successfully', loadedData, null));
        }

        // Fetch all potential parents
        let users = await User.find({
            _id: { $ne: userId }, // Exclude current user
            'profile.deleted_at': null,
            $or: [
                { 'profile.isAdmin': false },
                {
                    'assigned_members.state': 'unachieved',
                    'assigned_members.upgrade_date': null,
                    'assigned_members.count': { $lt: 'level_id.members_number' },
                },
            ],
        })
            .populate('profile')
            .populate('level_id')
            .populate('assigned_members')
            .lean();

        // Filter for users with valid level_id
        users = users.filter(
            (user) =>
                user.level_id &&
                user.level_id.level_number !== null &&
                user.assigned_members &&
                user.assigned_members.state !== undefined
        );

        // If no valid users found, fallback to admins
        if (users.length === 0) {
            users = await User.find({
                _id: { $ne: userId },
                'profile.isAdmin': true,
                'profile.deleted_at': null,
            })
                .populate('profile')
                .populate('level_id')
                .populate('assigned_members')
                .lean();
        }

        // If still no users, return an error
        if (users.length === 0) {
            return res.status(400).send(ErrorResponse(400, 'No available parent user at the moment', null, null));
        }

        // Determine the target level
        let targetLevel = null;
        if (currentUser.level_id && currentUser.level_id.level_number) {
            targetLevel = currentUser.level_id.level_number + 1;
        }

        // Filter users to prioritize those matching the target level
        const parentsArray = targetLevel
            ? users.filter(
                  (user) =>
                      user.level_id.level_number === targetLevel &&
                      user.assigned_members.state === 'unachieved' &&
                      user.assigned_members.count < user.level_id.members_number
              )
            : [];

        // Select a parent, prioritize eligible ones; fallback to random if none match
        const parentUser =
            parentsArray.length > 0
                ? parentsArray[Math.floor(Math.random() * parentsArray.length)]
                : users[Math.floor(Math.random() * users.length)];

        if (!parentUser) {
            return res.status(400).send(ErrorResponse(400, 'No suitable parent user found', null, null));
        }

        // Update parent-child relationship
        const [parentAssignedMembers] = await Promise.all([
            AssignedMembers.findOne({ user_id: parentUser._id }),
        ]);

        userProfile.parent_id = parentUser._id;
        parentAssignedMembers.count += 1;

        await Promise.all([Profile.updateOne({ user_id: currentUser._id }, userProfile), parentAssignedMembers.save()]);

        const parentWallet = await Wallet.findOne({ user_id: parentUser._id }).lean();

        const [populatedParentUser, populatedUser] = await Promise.all([
            User.findById(parentUser._id)
                .select('-password')
                .populate('profile')
                .populate('assigned_members')
                .populate('level_id')
                .lean(),
            User.findById(userProfile.user_id).select('-password').populate('profile').lean(),
        ]);

        const loadedData = {
            ...populatedUser,
            parent: populatedParentUser,
            parent_wallet: parentWallet,
        };

        return res.send(SuccessResponse(201, 'Parent User assigned successfully', loadedData, null));
    } catch (error) {
        console.error('Error activating account:', error);
        return res.status(500).send(ErrorResponse(500, 'Internal server error', error, null));
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