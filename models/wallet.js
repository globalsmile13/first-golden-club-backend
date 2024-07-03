const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const walletSchema = new Schema({
    user_id: {
        type: Schema.Types.ObjectId,
        ref: 'User',
    },
    balance: {
        type: Number,
        default:0
    },
    account_name: {
        type: String,
        required: false
    },
    bank_name: {
        type: String,
        required: false
    },
    account_number: {
        type: String,
        required: false
    },
    deleted_at: {
        type: Date, 
        default: null 
    }
    },{timestamps:true});

module.exports = mongoose.model('Wallet', walletSchema);
