const express = require('express');
const { body } = require('express-validator/check');

const levelController = require('../controllers/level');
const isAuth = require('../middleware/is-auth');

const router = express.Router();

// GET /feed/levels
router.get('/get-levels', levelController.getLevels);

router.get('/get-single-level', levelController.getSingleLevel);

router.get('/create-level', levelController.createLevel);

router.post('/update-level', isAuth, levelController.updateLevel);

router.delete('/delete-level', isAuth, levelController.deleteLevel);

module.exports = router;
