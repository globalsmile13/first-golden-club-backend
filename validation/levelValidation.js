const Joi = require("joi");


function validateCreateLevel(level) {
    const schema = Joi.object({
        level_name: Joi.string().label("level name").required(),
        level_number: Joi.number().label("level number").required(),
        members_number: Joi.number().label("members number").required(),
        priority: Joi.string().label("priority"),
        slug: Joi.string().label("slug"),
        upgrade_amount: Joi.number().label("upgrade amount").required(),
        member_amount: Joi.number().label("member amount").required(),
        nextlevel_upgrade: Joi.number().label("nextlevel upgrade").required(),
        admin_count: Joi.number().label("admin count").required(),
        levels_count: Joi.number().label("levels count").required(),
        username: Joi.string().label("Username").required()
    });

    return schema.validate(level)
}

function validateUpdateLevel(level) {
    const schema = Joi.object({
        level_name: Joi.string().label("level name").required(),
        level_number: Joi.number().label("level number").required(),
        members_number: Joi.number().label("members number").required(),
        priority: Joi.string().label("priority"),
        slug: Joi.string().label("slug"),
        upgrade_amount: Joi.number().label("upgrade amount").required(),
        member_amount: Joi.number().label("member amount").required(),
        nextlevel_upgrade: Joi.number().label("nextlevel upgrade").required(),
        admin_count: Joi.number().label("admin count").required(),
        levels_count: Joi.number().label("levels count").required(),
        username: Joi.string().label("Username").required(),
        level_id:Joi.string().label("level_id").required()
    });

    return schema.validate(level)
}

function validateDeleteLevel(level) {
    const schema = Joi.object({
        username: Joi.string().label("Username").max(100).required(),
        level_id:Joi.string().label("level_id").required()
    });

    return schema.validate(level)
}

module.exports = {
    validateCreateLevel,
    validateUpdateLevel,
    validateDeleteLevel
}