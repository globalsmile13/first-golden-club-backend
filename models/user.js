const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const userSchema = new Schema({
  username: {
    type: String,
    required: true
  },
  password: {
    type: String,
    required: true
  },
  profile: {
    type: Schema.Types.ObjectId,
    ref: 'Profile',
  },
  level_id: {
    type: Schema.Types.ObjectId,
    ref: 'Level',
  },
  // wallet_id: {
  //   type: Schema.Types.ObjectId,
  //   ref: 'Wallet',
  // },
  assigned_members: {
    type: Schema.Types.ObjectId,
    ref: 'AssignedMembers',
  },
  subscription_id:{
    type: Schema.Types.ObjectId,
    ref: 'Subscription',
  },
  deleted_at: {
    type: Date, 
    default: null 
  }
  },{timestamps:true});

module.exports = mongoose.model('User', userSchema);
