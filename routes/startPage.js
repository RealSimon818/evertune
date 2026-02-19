const express = require('express');
const router = express.Router();
const Amount = require('../models/Amount');
const Optimization = require('../models/Optimization');
const User = require('../models/User');

// Middleware to check authentication
const checkAuthenticated = (req, res, next) => {
  if (req.session && req.session.userId) {
    return next();
  }
  res.redirect('/?auth=login&message=Please login to access this page');
};

// GET /start-page - Render the start page with user data
router.get('/start-page', checkAuthenticated, async (req, res) => {
  try {
    const username = req.session.username;

    // Fetch user data from Amount collection
    const amountData = await Amount.findOne({ username });
    
    // Fetch user status and invitation code from User collection
    const user = await User.findOne({ username });
    
    // Get invitation code from user data
    const invitationCode = user?.invitationCode || 'N/A';
    
    // Fetch completed optimizations to get count
    const completedOptimizations = await Optimization.find({ 
      username, 
      status: 'completed' 
    });
    
    const optimizationCount = completedOptimizations ? completedOptimizations.length : 0;
    
    // Get latest optimization for freezing point logic
    const latestOptimization = await Optimization.findOne({ username }).sort({ _id: -1 });
    const optimizationCout = latestOptimization ? Number(latestOptimization.optimizationCount) : 0;
    
    // Define optimization limits per VIP level
    const optimizationLimits = {
      VIP1: 40,
      VIP2: 45,
      VIP3: 50,
      VIP4: 55
    };
    
    const vipLevel = amountData?.vipLevel || user?.vipLevel || 'VIP1';
    const maxOptimizationCount = optimizationLimits[vipLevel] || 40;
    const freezingPoint = Number(amountData?.freezingPoint) || 103;
    
    // Get deposit amount if exists
    const Deposit = require('../models/deposit');
    const depositData = await Deposit.findOne({ username });
    const depositAmount = depositData ? parseFloat(depositData.amount).toFixed(2) : '0.00';
    
    // If user data doesn't exist, create default values
    if (!amountData) {
      return res.render('start-page', {
        username,
        totalBalance: '0.00',
        frozenAmount: '0.00',
        todaysProfit: '0.00',
        totalProfits: '0.00',
        vipLevel,
        optimizationCount,
        optimizationCout,
        maxOptimizationCount,
        depositAmount,
        freezingPoint,
        invitationCode, // Add invitation code
        message: 'Welcome to Start Page'
      });
    }

    // Render with actual data
    res.render('start-page', {
      username,
      totalBalance: parseFloat(amountData.totalBalance || 0).toFixed(2),
      frozenAmount: parseFloat(amountData.frozenAmount || 0).toFixed(2),
      todaysProfit: parseFloat(amountData.todaysProfit || 0).toFixed(2),
      totalProfits: parseFloat(amountData.totalProfits || 0).toFixed(2),
      vipLevel,
      optimizationCount,
      optimizationCout,
      maxOptimizationCount,
      depositAmount,
      freezingPoint,
      invitationCode, // Add invitation code
      message: 'Welcome back!'
    });
    
  } catch (error) {
    console.error('Error fetching start page data:', error);
    
    // Fallback: render with default values
    res.render('start-page', {
      username: req.session.username || 'User',
      totalBalance: '0.00',
      frozenAmount: '0.00',
      todaysProfit: '0.00',
      totalProfits: '0.00',
      vipLevel: 'VIP1',
      optimizationCount: 0,
      optimizationCout: 0,
      maxOptimizationCount: 40,
      depositAmount: '0.00',
      freezingPoint: 103,
      invitationCode: 'N/A', // Add invitation code
      message: 'Welcome back!'
    });
  }
});
    
// GET /api/start-page/history - Fetch optimization history for the start page modal
router.get('/api/start-page/history', checkAuthenticated, async (req, res) => {
  try {
    const username = req.session.username;

    // Fetch all optimization records for the user, excluding those with optimizationCount = 0
    const optimizations = await Optimization.find({ 
      username, 
      optimizationCount: { $gt: 0 } // Filter out records with optimizationCount = 0
    }).sort({ submissionDate: -1 });

    // Fetch user balance data for VIP level and freezing point
    const amountData = await Amount.findOne({ username });
    const vipLevel = amountData ? amountData.vipLevel : 'VIP1';
    const freezingPoint = Number(amountData?.freezingPoint) || 103;

    // Define optimization count limits
    const optimizationLimits = {
      VIP1: 40,
      VIP2: 45,
      VIP3: 50,
      VIP4: 55,
    };
    const maxOptimizationCount = optimizationLimits[vipLevel] || 40;

    res.json({
      success: true,
      username,
      optimizations,
      maxOptimizationCount,
      message: optimizations.length ? 'History data retrieved successfully.' : 'No history data available for this user.'
    });
  } catch (error) {
    console.error('Error fetching history data:', error);
    res.status(500).json({ 
      success: false, 
      message: 'An error occurred while fetching history data.' 
    });
  }
});

// POST /api/start-page/submit-history-optimizations - Submit optimizations from history modal
router.post('/api/start-page/submit-history-optimizations', checkAuthenticated, async (req, res) => {
  try {
    const username = req.session.username;

    // Fetch pending and frozen optimizations
    const pendingOptimizations = await Optimization.find({ username, status: 'pending' }).sort({ createdAt: -1 });
    const frozenOptimizations = await Optimization.find({ username, status: 'frozen' }).sort({ createdAt: -1 });

    // If no optimizations exist, return an error
    if (pendingOptimizations.length === 0 && frozenOptimizations.length === 0) {
      return res.status(404).json({ success: false, message: 'No optimizations found for this user' });
    }

    // Retrieve the user's balance data
    const amountData = await Amount.findOne({ username });
    if (!amountData) {
      return res.status(404).json({ success: false, message: 'User balance data not found' });
    }

    // Get the most recent optimization count for freezing point check
    const latestOptimization = pendingOptimizations.length > 0 ? pendingOptimizations[0] : frozenOptimizations[0];
    const optimizationCount = latestOptimization ? latestOptimization.optimizationCount || 0 : 0;

    // Log optimization count and freezing point for debugging
    const freezingPoint = Number(amountData?.freezingPoint) || 103;

    // Check if the latest optimization count exceeds the freezing point
    if (optimizationCount >= freezingPoint) {
      console.log(`History Submit - Redirecting to /deposit: Optimization Count (${optimizationCount}) >= Freezing Point (${freezingPoint})`);
      return res.json({ 
        success: false, 
        redirect: '/deposit',
        message: 'Optimization limit reached. Please make a deposit to continue.'
      });
    }

    // Process optimizations - just add profits
    let totalProfit = 0;

    // Complete pending optimizations
    for (const optimization of pendingOptimizations) {
      totalProfit += optimization.profitAmount;
      optimization.status = 'completed';
      await optimization.save();
    }

    // Complete frozen optimizations
    for (const optimization of frozenOptimizations) {
      totalProfit += optimization.profitAmount;
      optimization.status = 'completed';
      await optimization.save();
    }

    // Update user's balance - ADD profits to all three fields
    amountData.totalBalance = (parseFloat(amountData.totalBalance) + parseFloat(totalProfit)).toFixed(2);
    amountData.todaysProfit = (parseFloat(amountData.todaysProfit) + parseFloat(totalProfit)).toFixed(2);
    amountData.totalProfits = (parseFloat(amountData.totalProfits) + parseFloat(totalProfit)).toFixed(2); // Add to lifetime profits
    
    await amountData.save();

    console.log(`History Submit - Optimizations for user ${username} completed. Total profit: ${totalProfit}`);
    res.json({
      success: true,
      message: 'All optimizations completed successfully.',
      updatedTodaysProfit: amountData.todaysProfit,
      updatedTotalBalance: amountData.totalBalance,
      updatedTotalProfits: amountData.totalProfits,
    });

  } catch (error) {
    console.error('Error in submitHistoryOptimizations:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;