const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const assignedMembersSchema = new Schema({
    state: {
        type: String,
        default:"achieved"
    },
    count: {
        type: Number,
        default:0
    },
    paid_count: {
        type: Number,
        default:0
    },
    user_id: {
        type: Schema.Types.ObjectId,
        ref: 'User',
    },
    level_id: {
        type: Schema.Types.ObjectId,
        ref: 'Level',
    },
    upline_paid: {
        type: Boolean,
        required: false
    },
    upgrade_date: {
        type: Date, 
        default: null 
    },
    deleted_at: {
        type: Date, 
        default: null 
    }

},{timestamps:true});

module.exports = mongoose.model('AssignedMembers', assignedMembersSchema);
