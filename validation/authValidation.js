const Joi = require("joi");
// const passwordComplexity = require("joi-password-complexity");
// const complexityOptions = {
//     min: 5,
//     max: 20,
//     lowerCase:1,
//     upperCase:1,
//     numeric:1,
//     symbol:0,
//     requirementCount:1,
// };


function validateSignUp(user) {
    const schema = Joi.object({
        first_name: Joi.string().label("First Name").max(100).required(),
        last_name: Joi.string().label("Last Name").max(100).required(),
        username: Joi.string().label("Username").max(100).required(),
        phone_number: Joi.string().label("Phone Number").max(20).required(),
        password: Joi.string().label("Password").required(),
        confirm_password: Joi.string().label("Confirm Password").required()
    });

    return schema.validate(user)
}


function validateLogin(user) {
    const schema = Joi.object({
        username: Joi.string().label("Username").max(100).required(),
        password: Joi.string().label("Password").required()
    });

    return schema.validate(user)
}

function validateForgotPassword(user) {
    const schema = Joi.object({
        username: Joi.string().label("Username").max(100).required(),
        recovery_code: Joi.string().label("Recovery code").required()
    });

    return schema.validate(user)
}




module.exports = {
    validateSignUp,
    validateLogin,
    validateForgotPassword
}

