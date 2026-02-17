// Import necessary modules
const express = require('express');
const router = express.Router();
const User = require('../models/User'); // Adjust the path to the User model
const Amount = require('../models/Amount'); // Adjust the path to the Amount model

// Display the adminamount form
router.get('/adminamount', (req, res) => {
  res.render('adminamount', { message: null, error: null });
});

// Handle form submission to update user balance and VIP level
router.post('/adminamount', async (req, res) => {
    try {
      const { username, frozenAmount, totalBalance, vipLevel } = req.body;
  
      // Check if the user exists in the `users` collection
      const user = await User.findOne({ username });
      if (!user) {
        return res.render('adminamount', { error: 'User not found', message: null });
      }
  
      // Check if an entry already exists in the `amounts` collection for this user
      const existingAmount = await Amount.findOne({ username });
  
      if (existingAmount) {
        // Update existing document
        existingAmount.frozenAmount = frozenAmount;
        existingAmount.totalBalance = totalBalance;
        existingAmount.vipLevel = vipLevel;
        await existingAmount.save();
      } else {
        // Create a new document if no entry exists
        const amountData = new Amount({
          username,
          frozenAmount,
          totalBalance,
          vipLevel,
        });
        await amountData.save();
      }
  
      res.render('adminamount', { message: 'User balance and VIP level updated successfully', error: null });
    } catch (error) {
      console.error('Error details:', error);
      res.render('adminamount', { error: 'Error updating user data', message: null });
    }
  });
  
  

module.exports = router;
