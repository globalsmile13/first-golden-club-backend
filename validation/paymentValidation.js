const Joi = require("joi");



function validateApproveTransaction(transaction) {
    const schema = Joi.object({
        transaction_id: Joi.string().label("Transaction id").required()
    });

    return schema.validate(transaction)
}


function validateWallet(wallet) {
    const schema = Joi.object({
        bank_name: Joi.string().label("Bank Name").required(),
        account_number: Joi.string().label("Account Number").required(),
        account_name: Joi.string().label("Account Name").required()
    });

    return schema.validate(wallet)
}


module.exports = {
    validateApproveTransaction,
    validateWallet
}

