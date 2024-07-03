const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const paymentSchema = new Schema({
    user_id: {
        type: Schema.Types.ObjectId,
        ref: 'User',
    },
    reference: {
        type: String,
        required:true
    },
    amount: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        required: true
    }
    },{timestamps:true});

module.exports = mongoose.model('Payment', paymentSchema);
