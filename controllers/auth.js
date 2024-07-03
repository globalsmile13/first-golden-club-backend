// const { validationResult } = require('express-validator/check');

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const validate = require('../validation/authValidation')
const User = require('../models/user');
const Profile = require('../models/profile');
const Wallet = require('../models/wallet');
const AssignedMembers = require('../models/assignedMembers');
const Transaction = require('../models/transactions');
const Subscription = require('../models/subscription');
const {generateShortUUID} = require('../utils/signupUniqueCode');
const { ErrorResponse, SuccessResponse } = require('../lib/apiResponse');

exports.signup = async (req, res, next) => {
  
  const {error} = validate.validateSignUp(req.body);
  if(error){
    return res.status(422).send(ErrorResponse(422, error.details[0].message, null, null))
  }
  
  let [usernameExist, phoneExist] = await Promise.all([
    User.findOne({username:req.body.username.trim()}),
    Profile.findOne({phone_number:req.body.phone_number.trim()})
  ]);
  

  if(usernameExist){
    return res.status(401).send(ErrorResponse(401, `An account with this ${usernameExist ? "username" : "phone number"} already exists`, null, null));
  }

  if(req.body.password !== req.body.confirm_password){
    return res.status(422).send(ErrorResponse(422, `password not the same as confirm passsword `, null, null));
  }
 
  const username = req.body.username.trim();
  const firstName = req.body.first_name.trim();
  const lastName = req.body.last_name.trim();
  const password = await bcrypt.hash(req.body.password, 12)
  const phoneNumber = req.body.phone_number;
  const originalCode = generateShortUUID(7).toString()
  try {
    
    
    let code = await bcrypt.hash(originalCode,12)

    const user = new User({
      username: username,
      profile: null,
      level_id: null,
      assigned_members: null,
      password,
      subscription_paid:false,
      deleted_at:null
    });

    const newUser = await user.save();

    const usersCount = await User.countDocuments()

    const profile = new Profile({
      first_name: firstName,
      last_name: lastName,
      username: username,
      phone_number: phoneNumber,
      parent_id: null,
      user_id: newUser._id,
      recovery_code: code,
      isAdmin:false,
      deleted_at:null
    });

    
    if(usersCount === 1 ){
      profile.isAdmin = true
    }

    const newProfile = await profile.save();


    const wallet = new Wallet({
      user_id: newUser._id,
      balance: 0,
      account_name: "",
      bank_name: "",
      account_number:"0",
      deleted_at:null
    });
    
    const assignedMembers = new AssignedMembers({
      user_id: newUser._id,
      level: null,
      state: "achieved",
      count: 0,
      upline_paid: false,
      upgrade_date: new Date(),
      deleted_at:null
    });

    // const payment = new Payment({
    //   user_id: newUser._id,
    //   reference: "",
    //   payment_type:"",
    //   amount:0,
    //   status: "",
    //   deleted_at:null
    // });

    // const newPayment = await payment.save();

    const subscription = new Subscription({
      user_id: newUser._id,
      level: null,
      amount:500,
      isActive: false,
      subscription_date:null,
      deleted_at:null
    });

    newUser.profile = newProfile._id;
    newUser.assigned_members = assignedMembers._id
    
    Promise.all([
      await subscription.save(),
      await newUser.save(),
      await assignedMembers.save(),
      await wallet.save()
    ])
    

    const token = jwt.sign(
      {
        username: newUser.username,
        userId: newUser._id.toString()
      },
      `${process.env.JWT_TOKEN_KEY}`,
      { expiresIn: '6h' }
    );

    const populatedUser = await User.findById(newUser._id).select('-password').populate({
      path: 'profile',
      select: '-password -recovery_code' // Excluding password
    }).lean();

    // populatedUser.recovery_passcode = originalCode;
    loadedData = {
      ...populatedUser,
      originalCode,
      token
    }

    return res.send(SuccessResponse(201, "User registered successfully", loadedData, null))
  } catch(error){
    console.log(error)
    return res.status(500).send(ErrorResponse(500, "Internal server error", error, null))
  }

};


exports.login = async (req, res, next) => {

  const {error} = validate.validateLogin(req.body);
  if(error){
    return res.status(422).send(ErrorResponse(422, error.details[0].message, null, null))
  }

  const username = req.body.username.trim();
  const password = req.body.password;

  let loadedUser = await User.findOne({username:username})

  if(!loadedUser){
    return res.status(401).send(ErrorResponse(401, `An account with this username does not exist`, null, null));
  }

  const correctPassword = await bcrypt.compare(password, loadedUser.password)
  
  if(!correctPassword){
    return res.status(401).send(ErrorResponse(401, `Kindly check your login details`, null, null));
  }

  try{
    const token = jwt.sign(
      {
        username: loadedUser.username,
        userId: loadedUser._id.toString()
      },
      `${process.env.JWT_TOKEN_KEY}`,
      { expiresIn: '6h' }
    );


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
          transactions: transactions,
          all_members_count: countMembers });
    }

    populatedUser.token = token
    return res.send(SuccessResponse(201, "User logged in successfully", populatedUser, null))
  }
  catch(error){
    console.log(error)
    return res.status(500).send(ErrorResponse(500, "Internal server error", error, null)) 
  }
  
};


exports.forgotPassword = async (req, res, next) => {

  const {error} = validate.validateForgotPassword(req.body);
  if(error){
    return res.status(422).send(ErrorResponse(422, error.details[0].message, null, null))
  }

  const username = req.body.username.trim();
  const recovery_code = req.body.recovery_code;

  let loadedUser = await User.findOne({username:username})

  if(!loadedUser){
    return res.status(401).send(ErrorResponse(401, `An account with this username does not exist`, null, null));
  }

  const loadedProfile = await Profile.findOne({user_id:loadedUser._id})



  const correcPassword = await bcrypt.compare(recovery_code, loadedProfile.recovery_code)
  if(!correcPassword){
    return res.status(401).send(ErrorResponse(401, `Kindly check your login details`, null, null));
  }

  try{
    const token = await jwt.sign(
      {
        username: loadedUser.username,
        userId: loadedUser._id.toString()
      },
      `${process.env.JWT_TOKEN_KEY}`,
      { expiresIn: '12h' }
    );


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

    populatedUser.token = token
    return res.send(SuccessResponse(201, "User logged in successfully", populatedUser, null))
  }
  catch(error){
    console.log(error)
    return res.status(500).send(ErrorResponse(500, "Internal server error", error, null)) 
  }
  
};
