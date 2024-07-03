
const validate = require('../validation/profileValidation')
const User = require('../models/user');
const Profile = require('../models/profile');
const AssignedMembers = require('../models/assignedMembers');
const { ErrorResponse, SuccessResponse } = require('../lib/apiResponse');



exports.getMembers = async (req, res, next) =>{

    const userId = req.userId;

    let loadedUser = await User.findOne({_id:userId})

    if(!loadedUser){
        return res.send(ErrorResponse(401, `An account with this userId does not exist`, null, null));
    }

    try{

        const [assignMembersDetails, userMembers, userMembersCount] = await Promise.all([
            await AssignedMembers.findOne({user_id: userId}),
            await Profile.find({parents: userId}).select('-recovery_code'),
            await Profile.countDocuments({ parents: userId })
        ])

        const data = {
            members_details:assignMembersDetails,
            user_members: userMembers,
            members_count: userMembersCount
        }
        return res.send(SuccessResponse(200, "Members retrieved successfully", data, null))

    }
    catch(error){
        console.log(error)
        return res.send(ErrorResponse(500, "Internal server error", error, null))
    }

}

exports.upgradeMembers = async (req, res, next) =>{

    const userId = req.userId;

    let loadedUser = await User.findOne({_id:userId})

    if(!loadedUser){
        return res.send(ErrorResponse(401, `An account with this userId does not exist`, null, null));
    }

    try{

        let assignMembersDetails = await AssignedMembers.find({user_id: userId})

        let userMembers = await Profile.find({parent_id: userId}).select('-recovery_code')

        const data = {
            assignMembersDetails,
            userMembers
        }
        return res.send(SuccessResponse(200, "Members retrieved successfully", data, null))

    }
    catch(error){
        console.log(error)
        return res.send(ErrorResponse(500, "Internal server error", error, null))
    }

}