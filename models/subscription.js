const { boolean } = require('joi');
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const subscriptionSchema = new Schema({
    user_id: {
        type: Schema.Types.ObjectId,
        ref: 'User',
    },
    level_id: {
        type: Schema.Types.ObjectId,
        ref: 'Level',
    },
    amount: {
        type: Number,
        default: 500
    },
    isActive: {
        type: Boolean,
        required: true
    },
    subscription_paid:{
        type: Boolean, 
        default: false 
    },
    subscription_date:{
        type: Date, 
        default: null 
    },
    deleted_at: {
        type: Date, 
        default: null 
    }
    },{timestamps:true});

module.exports = mongoose.model('Subscription', subscriptionSchema);
