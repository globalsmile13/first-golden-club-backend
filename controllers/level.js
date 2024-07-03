const fs = require('fs');
const Level = require('../models/level')
const User = require('../models/user');
const validate = require('../validation/levelValidation')
const { ErrorResponse, SuccessResponse } = require('../lib/apiResponse');


exports.getLevels = async(req, res, next) =>{
    try{
        let levels = await Level.find({}).sort("level_number")
        
        return res.send(SuccessResponse(200, "levels generated successfully", levels, null))
    }
    catch(error){
        console.log(error)
        return res.send(ErrorResponse(500, "Internal server error", error, null))
    }
}

exports.getSingleLevel = async(req, res, next) =>{
    console.log(req.query.level_id)
    if(!req.query.level_id){
        return res.send(ErrorResponse(422, "Level_id is missing", null, null))
    }

    let levelId= req.query.level_id

    try{
        let levelDetails = await Level.findById(levelId)

        if(!levelDetails){
            return res.send(ErrorResponse(401, "No data for level id", null, null))
        }
        
        return res.send(SuccessResponse(200, "level details generated successfully", levelDetails, null))
    }
    catch(error){
        console.log(error)
        return res.send(ErrorResponse(500, "Internal server error", error, null))
    }
}

exports.createLevel = async (req, res, next)  => {
    const {error} = validate.validateCreateLevel(req.body);
    if(error){
        return res.send(ErrorResponse(422, error.details[0].message, null, null))
    }

    let level = await Level.findOne( {'level_number': req.body.level_number});

    if(level){
        return res.send(ErrorResponse(400, `This level already exists`, null, null));
    }

    if(req.body.username.trim() !== "godchi"){
        return res.send(ErrorResponse(400, `This account is not the root user`, null, null));
    }

    

    level_name = req.body.level_name
    level_number = req.body.level_number
    members_number = req.body.members_number
    priority = req.body.priority
    slug = req.body.slug
    upgrade_amount = req.body.upgrade_amount
    member_amount = req.body.member_amount
    nextlevel_upgrade = req.body.nextlevel_upgrade
    admin_count = req.body.admin_count
    levels_count = req.body.levels_count
    username = req.body.username.trim()

    try{

        const level = new Level({
            level_name,
            level_number,
            members_number,
            priority,
            slug,
            upgrade_amount,
            member_amount,
            nextlevel_upgrade,
            admin_count,
            levels_count
          });
      
        const newLevel = await level.save();

        return res.send(SuccessResponse(200, "Level created successfully", newLevel, null))

    }
    catch(error){
        console.log(error)
        return res.send(ErrorResponse(500, "Internal server error", error, null))
    }

}


exports.updateLevel = async (req, res, next)  => {
    const {error} = validate.validateUpdateLevel(req.body);
    if(error){
        return res.send(ErrorResponse(422, error.details[0].message, null, null))
    }

    if(req.body.username !== "godchi"){
        return res.send(ErrorResponse(400, `This account is not the root user`, null, null));
    }

    let [usernameExist, level] = await Promise.all([
        User.findOne({username:req.body.username}),
        Level.findOne({_id:req.body.level_id})
    ]);

    if(!usernameExist || !level){
        return res.send(ErrorResponse(400, `${!usernameExist ? "User not found" : "level id is not valid"}`, null, null));
    }


    level_name = req.body.level_name
    level_number = req.body.level_number
    members_number = req.body.members_number
    priority = req.body.priority
    slug = req.body.slug
    upgrade_amount = req.body.upgrade_amount
    member_amount = req.body.member_amount
    nextlevel_upgrade = req.body.nextlevel_upgrade
    admin_count = req.body.admin_count
    levels_count = req.body.levels_count
    username = req.body.username
    level_id = req.body.level_id

    try{
        
        newValues = {
            level_name,
            level_number,
            members_number,
            priority,
            slug,
            upgrade_amount,
            member_amount
        }
        const updatedLevel = await Level.findOneAndUpdate(
            { _id: level_id }, // Filter: Find the user by ID
            { $set: newValues }, // Update: Set the new values
            { new: true } // Options: Return the updated record
        );
        
        
        return res.send(SuccessResponse(200, "Level created successfully", updatedLevel, null))

    }
    catch(error){
        console.log(error)
        return res.send(ErrorResponse(500, "Internal server error", error, null))
    }

}

exports.deleteLevel = async (req, res, next)  => {
    const {error} = validate.validateDeleteLevel(req.body);
    if(error){
        return res.send(ErrorResponse(422, error.details[0].message, null, null))
    }

    if(req.body.username !== "godchi"){
        return res.send(ErrorResponse(400, `This account is not the root user`, null, null));
    }

    let [usernameExist, level] = await Promise.all([
        User.findOne({username:req.body.username}),
        Level.findOne({_id:req.body.level_id})
    ]);

    if(!usernameExist || !level){
        return res.send(ErrorResponse(400, `${!usernameExist ? "User not found" : "level id is not valid"}`, null, null));
    }


    try{
        
        const deletedRecord = await Level.findOneAndDelete({ _id: req.body.level_id });

        if (deletedRecord) {

            return res.send(SuccessResponse(200, "Level deleted successfully", deletedRecord, null)) // Return the deleted record if needed
        } else {
            console.log('Record not found');
            return res.send(ErrorResponse(400, `The record was not found`, null, null));; // Return null if the record was not found
        }
        

    }
    catch(error){
        console.log(error)
        return res.send(ErrorResponse(500, "Internal server error", error, null))
    }

}