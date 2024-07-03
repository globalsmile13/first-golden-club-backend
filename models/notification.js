const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const notificationSchema = new Schema({
    user_id: {
        type: Schema.Types.ObjectId,
        ref: 'User',
    },
    message: {
        type: String,
        required: true
    },
    status: {
        type: String,
        required: true
    },
    read_status: {
        type: Boolean,
        default: false 
    },
    notification_type: {
        type: String,
        required: true
    },
    deleted_at: {
        type: Date, 
        default: null 
    }

},{timestamps:true});

module.exports = mongoose.model('Notification', notificationSchema);
