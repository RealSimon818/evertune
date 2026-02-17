const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const ReferralCode = require('../models/ReferralCode');



// Handle form submission to create a referral code
router.post('/create-referral-code', async (req, res) => {
  const { code, createdBy } = req.body;

  try {
    const newCode = new ReferralCode({ code, createdBy });
    await newCode.save();
    res.render('dashboard', { message: 'Referral code created successfully!' });
  } catch (error) {
    res.render('dashboard', { message: 'Error creating referral code. Try again.' });
  }
});

module.exports = router;
