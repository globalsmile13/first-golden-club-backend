const express = require('express');
const { body } = require('express-validator/check');

const profileController = require('../controllers/profile');
const memberController = require('../controllers/member');
const notificationController = require('../controllers/notification');
const paymentController = require('../controllers/payment');
const isAuth = require('../middleware/is-auth');

const router = express.Router();

// GET /user/get-profile
router.get('/profile', isAuth, profileController.getProfile);

router.get('/get-user', isAuth, profileController.getUser);

router.get('/get-members', isAuth, memberController.getMembers);

router.post('/update-profile',isAuth, profileController.updateProfile);

router.post('/update-password',isAuth, profileController.updatePassword);

router.get('/notifications',isAuth, notificationController.getNotifications);

router.get('/read-notification',isAuth, notificationController.readNotification);

router.patch('/read-notifications',isAuth, notificationController.readAllNotifications);

router.delete('/delete-notification',isAuth, notificationController.deleteNotification);

router.get('/activate-account', isAuth, paymentController.activateAccount)


module.exports = router;
