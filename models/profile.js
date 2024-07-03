const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const profileSchema = new Schema({
    first_name: {
        type: String,
        required: true
    },
    last_name: {
        type: String,
        required: true
    },
    username: {
        type: String,
        required: true
    },
    phone_number: {
        type: String,
        required: true
    },
    parent_id: {
        type: Schema.Types.ObjectId,
        ref: 'User',
    },
    parents: {
        type: [String],
        required: false
    },
    user_id: {
        type: Schema.Types.ObjectId,
        ref: 'User',
    },
    recovery_code: {
        type: String
    },
    isAdmin: {
        type: Boolean,
        default: false
    },
    isSecondary: {
        type: Boolean,
        default: false
    },
    deleted_at: {
        type: Date, 
        default: null 
    }

},{timestamps:true});

module.exports = mongoose.model('Profile', profileSchema);
