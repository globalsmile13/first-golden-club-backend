
const validate = require('../validation/profileValidation')
const User = require('../models/user');
const Notification = require('../models/notification');
const { ErrorResponse, SuccessResponse } = require('../lib/apiResponse');


exports.createNotification = async (user_id, message, status, notification_type) => {
    if(!user_id || !message || !status || !notification_type){
        return res.send(ErrorResponse(500, `Missing notification value`, null, null));
    }

    const notification  = new Notification({
        user_id,
        message,
        status,
        notification_type
    })

    await notification.save()


}


exports.getNotifications = async (req, res, next) => {
    const userId = req.userId;

    let loadedUser = await User.findOne({_id:userId})

    if(!loadedUser){
        return res.send(ErrorResponse(401, `An account with this userId does not exist`, null, null));
    }
    
    try{
        const query = {user_id: userId }
        const notifications =  await Notification.find(query)  
        const notificationsCount =  await Notification.countDocuments(query)    

        const data = {
            notifications,
            notificationsCount
        }
        return res.send(SuccessResponse(201, "User notifications retrieved successfully", data, null))
    }
    catch(error){
        console.log(error)
        return res.send(ErrorResponse(500, "Internal server error", error, null)) 
    }
}


exports.deleteNotification = async(req, res, next) => {

    const {error} = validate.validateDeleteNotification(req.body);
    if(error){
        return res.send(ErrorResponse(422, error.details[0].message, null, null))
    }

    const userId = req.userId;
    const notification_id = req.body.notification_id

    let [userExist, notificationExist] = await Promise.all([
        User.findOne({_id:userId}),
        Notification.findOne({_id:notification_id})
    ]);


    if(!userExist || !notificationExist){
        return res.send(ErrorResponse(400, `${!userExist ? "User not found" : "notification id is not valid"}`, null, null));
    }


    try{
        
        const deletedRecord = await notificationExist.remove()

        if (deletedRecord) {
            
            return res.send(SuccessResponse(200, "Notification deleted successfully", deletedRecord, null)) // Return the deleted record if needed
        } else {
            console.log('Notification not found');
            return res.send(ErrorResponse(400, `The notification was not found`, null, null));; // Return null if the record was not found
        }
        
    }
    catch(error){
        console.log(error)
        return res.send(ErrorResponse(500, "Internal server error", error, null))
    }

    
}

exports.checkNotification = async (req, res, next) => {
    const notificationId = req.query.notification_id;
    const userId = req.userId;

    let loadedUser = await User.findOne({_id:userId})

    if(!loadedUser){
        return res.send(ErrorResponse(401, `You are not logged in`, null, null));
    }

    try{
        const query = {_id: notificationId }
        const notifications =  await Notification.findOne(query)   

        return res.send(SuccessResponse(201, "Notification check successfully", notifications, null))
    }
    catch(error){
        console.log(error)
        return res.send(ErrorResponse(500, "Internal server error", error, null)) 
    }

}


exports.readNotification = async (req, res, next) => {
    const notificationId = req.query.notification_id;
    const userId = req.userId;

    let loadedUser = await User.findOne({_id:userId})

    if(!loadedUser){
        return res.send(ErrorResponse(401, `You are not logged in`, null, null));
    }

    try{
        const query = {_id: notificationId }
        const notification =  await Notification.findOne(query)   

        notification.read_status = true

        await notification.save()

        return res.send(SuccessResponse(201, "Notification check successfully", notifications, null))
    }
    catch(error){
        console.log(error)
        return res.send(ErrorResponse(500, "Internal server error", error, null)) 
    }

}

exports.readAllNotifications = async (req, res, next) => {
    const userId = req.userId;

    let loadedUser = await User.findOne({_id:userId})

    if(!loadedUser){
        return res.send(ErrorResponse(401, `You are not logged in`, null, null));
    }

    try{
        const query = {user_id: userId }
        const notifications =  await Notification.find(query)   

        for (let notification of notifications) {
            notification.read_status = true;
            await notification.save();
        }

        return res.send(SuccessResponse(201, "Notification updated successfully", notifications, null))
    }
    catch(error){
        console.log(error)
        return res.send(ErrorResponse(500, "Internal server error", error, null)) 
    }

}