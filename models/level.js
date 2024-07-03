const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const levelSchema = new Schema({
    level_name: {
        type: String,
        required: true
    },
    level_number: {
        type: Number,
        required: true
    },
    members_number: {
        type: Number,
        required: true
    },
    priority: {
        type: String,
        required: true
    },
    slug: {
        type: String,
        required: true
    },
    upgrade_amount: {
        type: Number,
        required: true
    },
    member_amount: {
        type: Number,
        required: true
    },
    admin_count: {
        type: Number,
        required: true
    },
    level_count: {
        type: Number,
        default: 0
    },
    parents: {
        type: [String],
        required: false
    },
    nextlevel_upgrade:{
        type: Number,
        required: true
    },
    deleted_at: {
        type: Date, 
        default: null 
    }

},{timestamps:true});

module.exports = mongoose.model('Level', levelSchema);
