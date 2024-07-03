

const bcrypt = require('bcryptjs');
const validate = require('../validation/profileValidation')
const User = require('../models/user');
const Profile = require('../models/profile');
const Wallet = require('../models/wallet');
const { ErrorResponse, SuccessResponse } = require('../lib/apiResponse');
// const level = require('../models/level');
const Transaction = require('../models/transactions');



exports.getProfile = async (req, res, next) => {

  const userId = req.userId;

  let loadedUser = await User.findOne({_id:userId})

  if(!loadedUser){
    return res.send(ErrorResponse(401, `An account with this userId does not exist`, null, null));
  }

  try{

    let populatedUser = await User.findById(loadedUser._id).select('-password').populate({
      path: 'profile',
      select: '-password -recovery_code' // Excluding password and recovery_code
    }).populate('assigned_members').populate('level_id');

    // Find wallet data where user ID matches

    const [walletData,transactions,countMembers ] = await Promise.all([
        await Wallet.findOne({ user_id: loadedUser._id }),
        await Transaction.findOne({user_id: loadedUser._id }),
        await User.countDocuments(),
    ])
     
    // If wallet data is found, populate populatedUser with walletData
    if (walletData) {
        populatedUser = Object.assign(populatedUser.toObject(), { 
            wallet:walletData, 
            transactions,
            all_members_count: countMembers });
    }

    return res.send(SuccessResponse(201, "User details retrieved successfully", populatedUser, null))
  }
  catch(error){
    console.log(error)
    return res.send(ErrorResponse(500, "Internal server error", error, null)) 
  }
  
};

exports.updateProfile = async (req, res, next) => {
    const {error} = validate.validateUpdateProfile(req.body);
    if(error){
        return res.send(ErrorResponse(422, error.details[0].message, null, null))
    }

    const userId = req.userId;
  
    // let [loadedUser, usernameExist] = await Promise.all([
    //     User.findOne({_id:userId}),
    //     User.findOne({username:req.body.username})
    //   ]);
    let [loadedUser, loadedProfile] = await Promise.all([
        User.findOne({_id:userId}),
        Profile.findOne({user_id:userId})
      ]);
    
    // if(usernameExist){
    //     return res.send(ErrorResponse(401, `An account with this username already exists`, null, null));
    //   }
    if(!loadedUser || !loadedProfile){
      return res.send(ErrorResponse(401, `An account with this userId does not exist`, null, null));
    }

    // const username = req.body.username;
    const firstName = req.body.first_name;
    const lastName = req.body.last_name;
    const phoneNumber = req.body.phone_number;
  
    try{
        
        // loadedUser.username = username;
        loadedProfile.first_name = firstName;
        loadedProfile.last_name = lastName;
        loadedProfile.phone_number = phoneNumber;

        await loadedProfile.save()

      let populatedUser = await User.findById(loadedUser._id).select('-password').populate({
        path: 'profile',
        select: '-password -recovery_code' // Excluding password and recovery_code
      }).populate('assigned_members').populate('level_id');
  
      // Find wallet data where user ID matches
      const walletData = await Wallet.findOne({ user_id: loadedUser._id });
  
      // If wallet data is found, populate populatedUser with walletData
      if (walletData) {
          populatedUser = Object.assign(populatedUser.toObject(), { walletData });
      }
  
      return res.send(SuccessResponse(201, "User details retrieved successfully", populatedUser, null))
    }
    catch(error){
      console.log(error)
      return res.send(ErrorResponse(500, "Internal server error", error, null)) 
    }
    
  };
  

exports.updatePassword = async (req, res, next) => {
    const {error} = validate.validateUpdatePassword(req.body);
    if(error){
        return res.send(ErrorResponse(422, error.details[0].message, null, null))
    }

    const userId = req.userId;
  
    let loadedUser = await User.findOne({_id:userId})
  
    if(!loadedUser){
      return res.send(ErrorResponse(401, `An account with this userId does not exist`, null, null));
    }

    if(req.body.password !== req.body.confirm_password){
        return res.send(ErrorResponse(401, `This password doesn't match the confirmed password`, null, null));
    }

    const password = await bcrypt.hash(req.body.password, 12);
    const confirm_password = req.body.confirm_password;
    
    

    try{
        
        
        loadedUser.password = password
        loadedUser.save()

      let populatedUser = await User.findById(loadedUser._id).select('-password').populate({
        path: 'profile',
        select: '-password -recovery_code' // Excluding password and recovery_code
      });
  
      // Find wallet data where user ID matches
      const walletData = await Wallet.findOne({ user_id: loadedUser._id });
  
      // If wallet data is found, populate populatedUser with walletData
      if (walletData) {
          populatedUser = Object.assign(populatedUser.toObject(), { walletData });
      }
  
      return res.send(SuccessResponse(201, "User password updated successfully", populatedUser, null))
    }
    catch(error){
      console.log(error)
      return res.send(ErrorResponse(500, "Internal server error", error, null)) 
    }
    
  };

exports.getUser = async (req, res, next) => {

    const userId = req.query.user_id;
  
    let loadedUser = await User.findOne({_id:userId})
  
    if(!loadedUser){
      return res.send(ErrorResponse(401, `An account with this user id does not exist`, null, null));
    }
  
    try{
  
      let populatedUser = await User.findById(loadedUser._id).select('-password').populate({
        path: 'profile',
        select: '-password -recovery_code' // Excluding password and recovery_code
      }).populate('assigned_members').populate('level_id');
  
      // Find wallet data where user ID matches
  
      const [walletData,transactions, countMembers ] = await Promise.all([
          await Wallet.findOne({ user_id: loadedUser._id }),
          await Transaction.findOne({user_id: loadedUser._id }),
          await User.countDocuments(),
      ])
       
      // If wallet data is found, populate populatedUser with walletData
      if (walletData) {
          populatedUser = Object.assign(populatedUser.toObject(), { 
              wallet:walletData, 
              transactions,
              all_members_count: countMembers });
      }
  
      return res.send(SuccessResponse(201, "User details retrieved successfully", populatedUser, null))
    }
    catch(error){
      console.log(error)
      return res.send(ErrorResponse(500, "Internal server error", error, null)) 
    }
    
  };