const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const transactionSchema = new Schema({
    wallet_id: {
        type: Schema.Types.ObjectId,
        ref: 'Wallet',
    },
    user_id: {
        type: Schema.Types.ObjectId,
        ref: 'User',
    },
    ref_id: {
        type: Schema.Types.ObjectId,
        ref: 'User',
    },
    transaction_type: {
        type: String, //credit, debit
        required: true
    },
    transaction_status: {
        type: String, //failed, pending, success
        required: true
    },
    transaction_reason: {
        type: String,
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    deleted_at: {
        type: Date, 
        default: null 
    }

},{timestamps:true});

module.exports = mongoose.model('Transaction', transactionSchema);
