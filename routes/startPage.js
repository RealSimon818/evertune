const express = require('express');
const router = express.Router();
const Amount = require('../models/Amount');
const Optimization = require('../models/Optimization');
const User = require('../models/User');
const Deposit = require('../models/deposit');

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

    // Get the latest optimization for freezing point check
    const latestCompleted = await Optimization.findOne({ username }).sort({ submissionDate: -1 });
    const optimizationCount = latestCompleted ? Number(latestCompleted.optimizationCount) : 0;

    // Keep a separate count for completed optimizations if needed elsewhere
    const completedCount = await Optimization.countDocuments({ username, status: 'completed' });

    const latestOptimization = await Optimization.findOne({ username }).sort({ _id: -1 });
    const optimizationCout = latestOptimization;
    
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
    const depositData = await Deposit.findOne({ username });
    const depositAmount = depositData ? parseFloat(depositData.amount).toFixed(2) : '0.00';

    // ── Freezing-point check for profile modal wallet balance ──────
    let walletDisplayBalance = parseFloat(amountData?.totalBalance || 0).toFixed(2);
    if (freezingPoint > 0 && optimizationCount >= freezingPoint) {
      walletDisplayBalance = (-parseFloat(depositAmount)).toFixed(2);
    }
    // ──────────────────────────────────────────────────────────────
    
    // If user data doesn't exist, create default values
    if (!amountData) {
      return res.render('start-page', {
        username,
        totalBalance: '0.00',
        walletDisplayBalance: '0.00',
        frozenAmount: '0.00',
        todaysProfit: '0.00',
        totalProfits: '0.00',
        vipLevel,
        optimizationCount,
        optimizationCout,
        maxOptimizationCount,
        depositAmount,
        freezingPoint,
        invitationCode,
        message: 'Welcome to Start Page'
      });
    }

    // Render with actual data
    res.render('start-page', {
      username,
      totalBalance: parseFloat(amountData.totalBalance || 0).toFixed(2),
      walletDisplayBalance,  // ← frozen-aware balance for profile modal
      frozenAmount: parseFloat(amountData.frozenAmount || 0).toFixed(2),
      todaysProfit: parseFloat(amountData.todaysProfit || 0).toFixed(2),
      totalProfits: parseFloat(amountData.totalProfits || 0).toFixed(2),
      vipLevel,
      optimizationCount,
      optimizationCout,
      maxOptimizationCount,
      depositAmount,
      freezingPoint,
      invitationCode,
      message: 'Welcome back!'
    });
    
  } catch (error) {
    console.error('Error fetching start page data:', error);
    
    res.render('start-page', {
      username: req.session.username || 'User',
      totalBalance: '0.00',
      walletDisplayBalance: '0.00',
      frozenAmount: '0.00',
      todaysProfit: '0.00',
      totalProfits: '0.00',
      vipLevel: 'VIP1',
      optimizationCount: 0,
      optimizationCout: 0,
      maxOptimizationCount: 40,
      depositAmount: '0.00',
      freezingPoint: 103,
      invitationCode: 'N/A',
      message: 'Welcome back!'
    });
  }
});
    
// GET /api/start-page/history - Fetch optimization history for the start page modal
router.get('/api/start-page/history', checkAuthenticated, async (req, res) => {
  try {
    const username = req.session.username;

    const optimizations = await Optimization.find({ 
      username, 
      optimizationCount: { $gt: 0 }
    }).sort({ submissionDate: -1 });

    const amountData = await Amount.findOne({ username });
    const vipLevel = amountData ? amountData.vipLevel : 'VIP1';
    const freezingPoint = Number(amountData?.freezingPoint) || 103;

    const optimizationLimits = { VIP1: 40, VIP2: 45, VIP3: 50, VIP4: 55 };
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
    res.status(500).json({ success: false, message: 'An error occurred while fetching history data.' });
  }
});

// POST /api/start-page/submit-history-optimizations
router.post('/api/start-page/submit-history-optimizations', checkAuthenticated, async (req, res) => {
  try {
    const username = req.session.username;

    const pendingOptimizations = await Optimization.find({ username, status: 'pending' }).sort({ createdAt: -1 });
    const frozenOptimizations = await Optimization.find({ username, status: 'frozen' }).sort({ createdAt: -1 });

    if (pendingOptimizations.length === 0 && frozenOptimizations.length === 0) {
      return res.status(404).json({ success: false, message: 'No optimizations found for this user' });
    }

    const amountData = await Amount.findOne({ username });
    if (!amountData) {
      return res.status(404).json({ success: false, message: 'User balance data not found' });
    }

    const latestOptimization = pendingOptimizations.length > 0 ? pendingOptimizations[0] : frozenOptimizations[0];
    const optimizationCount = latestOptimization ? latestOptimization.optimizationCount || 0 : 0;

    const freezingPoint = Number(amountData?.freezingPoint) || 103;

    if (optimizationCount >= freezingPoint) {
      console.log(`History Submit - Redirecting to /contact: Optimization Count (${optimizationCount}) >= Freezing Point (${freezingPoint})`);
      return res.json({ 
        success: false, 
        redirect: '/contact',
        message: 'Optimization limit reached. Please make a deposit to continue.'
      });
    }

    let totalProfit = 0;

    for (const optimization of pendingOptimizations) {
      totalProfit += optimization.profitAmount;
      optimization.status = 'completed';
      await optimization.save();
    }

    for (const optimization of frozenOptimizations) {
      totalProfit += optimization.profitAmount;
      optimization.status = 'completed';
      await optimization.save();
    }

    amountData.totalBalance = (parseFloat(amountData.totalBalance) + parseFloat(totalProfit)).toFixed(2);
    amountData.todaysProfit = (parseFloat(amountData.todaysProfit) + parseFloat(totalProfit)).toFixed(2);
    amountData.totalProfits = (parseFloat(amountData.totalProfits) + parseFloat(totalProfit)).toFixed(2);
    
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

// GET /api/start-page/user-stats
router.get('/api/start-page/user-stats', checkAuthenticated, async (req, res) => {
  try {
    const username = req.session.username;

    const amountData = await Amount.findOne({ username });
    if (!amountData) return res.status(404).json({ success: false, message: 'User data not found' });

    const latestOptimization = await Optimization.findOne({ username }).sort({ _id: -1 });
    const optimizationCount = latestOptimization ? Number(latestOptimization.optimizationCount) : 0;

    const optimizationLimits = { VIP1: 40, VIP2: 45, VIP3: 50, VIP4: 55 };
    const maxOptimizationCount = optimizationLimits[amountData.vipLevel] || 40;
    const freezingPoint = Number(amountData.freezingPoint) || 103;

    const depositData = await Deposit.findOne({ username });
    const depositAmount = depositData ? parseFloat(depositData.amount).toFixed(2) : '0.00';

    const isFrozen = optimizationCount >= freezingPoint;

    // ── Compute frozen-aware wallet balance for profile modal ──────
    let walletDisplayBalance = parseFloat(amountData.totalBalance || 0).toFixed(2);
    if (isFrozen) {
      walletDisplayBalance = (-parseFloat(depositAmount)).toFixed(2);
    }
    // ──────────────────────────────────────────────────────────────

    res.json({
      success: true,
      totalBalance: parseFloat(amountData.totalBalance || 0).toFixed(2),
      walletDisplayBalance,  // ← frozen-aware, used by profile modal
      todaysProfit: parseFloat(amountData.todaysProfit || 0).toFixed(2),
      optimizationCount,
      maxOptimizationCount,
      isFrozen,
      depositAmount
    });
  } catch (error) {
    console.error('Error fetching user stats:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


module.exports = router;