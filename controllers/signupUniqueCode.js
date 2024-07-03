const crypto = require('crypto');
const User = require('../models/user');
const { v4: uuidv4 } = require('uuid');

async function generateUniqueCode() {
  // Generate a unique 7-digit code
  const code = generateRandomCode(7);

  // Check if the code is already in use
  const isCodeUnique = await isUniqueCode(code);

  // If the code is not unique, recursively generate a new one
  if (!isCodeUnique) {
    return generateUniqueCode();
  }

  return code;
}

function generateRandomCode(length) {
    const charset = '0123456789';
    let code = '';
  
    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * charset.length);
      code += charset[randomIndex];
    }
    
    return code;
  }
  
  async function isUniqueCode(code) {
  
      const existingUser = await User.findOne({ recoveryCode:code });

      return !existingUser; // Return true if code is unique, false otherwise
} 

// Function to generate a shortened UUIDv4-like identifier
function generateShortUUID(length) {
  const fullUUID = uuidv4(); // Generate the full UUIDv4
  // Remove non-numeric characters from the UUID
  const numericUUID = fullUUID.replace(/\D/g, ''); // \D matches any non-digit character
  // Take a substring of the numeric UUID to get the desired length
  const shortNumericUUID = numericUUID.substring(0, length);
  return shortNumericUUID;
}


module.exports = {
  generateUniqueCode,
  generateShortUUID

}