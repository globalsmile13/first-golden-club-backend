const express = require('express');

const paymentController = require('../controllers/payment');
const isAuth = require('../middleware/is-auth');
// const isUser = require('../middleware/is-user');

const router = express.Router();


router.get('/activate-account', isAuth, paymentController.activateAccount)

router.post('/reassign-user', isAuth, paymentController.reassignUser)

router.get('/initiate-payment', isAuth, paymentController.initiatePayment)

router.post('/approve-payment', isAuth, paymentController.approvePayment)

router.get('/initiate-subscription', isAuth, paymentController.initiateSubscription)

router.post('/approve-subscription', isAuth, paymentController.approveSubscription)

router.get('/check-payment', isAuth, paymentController.checkPayment)

router.get('/transactions', isAuth, paymentController.getTransactions)

router.get('/get-wallet', isAuth, paymentController.getWallet)

router.post('/update-wallet', isAuth, paymentController.postWallet)

module.exports = router;
