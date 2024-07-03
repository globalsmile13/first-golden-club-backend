const jwt = require('jsonwebtoken');
const User = require('../models/user');

module.exports = async (req, res, next) => {
    const userId = req.userId;

    let loadedUser = await User.findOne({_id:userId})
  
    if(!loadedUser){
      return res.send(ErrorResponse(401, `An account with this userId does not exist`, null, null));
    }

    next();
};
