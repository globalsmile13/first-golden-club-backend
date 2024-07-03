const Joi = require("joi");


function validateUpdateProfile(user) {
    const schema = Joi.object({
        first_name: Joi.string().label("First Name").max(100).required(),
        last_name: Joi.string().label("Last Name").max(100).required(),
        username: Joi.string().label("Username").max(100).required(),
        phone_number: Joi.string().label("Phone Number").max(20).required()
    });

    return schema.validate(user)
}


function validateUpdatePassword(user) {
    const schema = Joi.object({
        password: Joi.string().label("Password").required(),
        confirm_password: Joi.string().label("Confirm Password").required()
    });

    return schema.validate(user)
}

function validateDeleteNotification(user) {
    const schema = Joi.object({
        notification_id: Joi.string().label("Notification Id").required()
    });

    return schema.validate(user)
}


module.exports = {
    validateUpdateProfile,
    validateUpdatePassword,
    validateDeleteNotification
}

