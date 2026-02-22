const express = require('express');
const router = express.Router();
const History = require('../models/history');
const User = require('../models/User');
const Amount = require('../models/Amount');

// Middleware to check if user is authenticated
function checkAuthenticated(req, res, next) {
    if (req.session.isAuthenticated) {
        return next();
    }
    console.log('Authentication failed - redirecting to login');
    res.redirect('/?auth=login');
}

// ==================== USER DEPOSIT HISTORY PAGE ====================
router.get('/deposit', checkAuthenticated, async (req, res) => {
    try {
        const username = req.session.username;
        
        // Fetch all data
        const history = await History.find({ username }).sort({ createdAt: -1 });
        const user = await User.findOne({ username });
        const amount = await Amount.findOne({ username });
        
        // Calculate today's commission
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        const todaysDeposits = await History.find({
            username,
            status: 'success',
            createdAt: { $gte: today, $lt: tomorrow }
        });
        
        const todaysCommission = todaysDeposits.reduce((sum, d) => sum + d.amount, 0);
        
        const totalDeposits = history
            .filter(h => h.status === 'success')
            .reduce((sum, h) => sum + h.amount, 0);
        
        res.render('deposit', {
            totalDeposits,
            reviewing: history.filter(h => h.status === 'reviewing'),
            success: history.filter(h => h.status === 'success'),
            rejected: history.filter(h => h.status === 'rejected'),
            pending: [],
            message: req.query.message || null,
            error: req.query.error || null,
            user: {
                username: username,
                // FIXED: Use totalBalance from Amount model (not balance)
                totalBalance: amount ? amount.totalBalance || 0 : 0,
                // FIXED: Get vipLevel from Amount model, not User model
                vipLevel: amount ? amount.vipLevel || 'VIP1' : 'VIP1',
                invitationCode: user ? user.invitationCode : 'N/A',
                // FIXED: Use todaysProfit from Amount model
                todaysProfit: amount ? amount.todaysProfit || 0 : 0,
                todaysReward:amount ? amount.todaysProfit || 0 : 0
            }
        });
        
    } catch (error) {
        console.error('ERROR in /deposit route:', error);
        console.error('Stack trace:', error.stack);
        res.render('deposit', {
            totalDeposits: 0,
            reviewing: [],
            success: [],
            rejected: [],
            pending: [],
            error: 'Failed to load deposit history',
            message: null,
            user: {
                username: req.session.username || 'User',
                totalBalance: 0,
                vipLevel: 'VIP1',
                invitationCode: req.session.invitationCode || 'N/A',
                todaysProfit: 0,
                todaysReward: 0
            }
        });
    }
});

// ==================== API ENDPOINT FOR PROFILE MODAL ====================
router.get('/api/user/complete-profile', checkAuthenticated, async (req, res) => {
    try {
        const username = req.session.username;
        
        // Fetch user data from multiple collections
        const user = await User.findOne({ username });
        const amount = await Amount.findOne({ username });
        
        // Calculate today's date range
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        // Fetch today's successful deposits
        const todaysDeposits = await History.find({
            username,
            status: 'success',
            createdAt: { $gte: today, $lt: tomorrow }
        });
        
        // Calculate today's commission
        const todaysCommission = todaysDeposits.reduce((sum, d) => sum + d.amount, 0);
        
        res.json({
            success: true,
            data: {
                username: username,
                // FIXED: Use totalBalance from Amount model
                totalBalance: amount ? amount.totalBalance || 0 : 0,
                // FIXED: Get vipLevel from Amount model
                vipLevel: amount ? amount.vipLevel || 'VIP1' : 'VIP1',
                invitationCode: user ? user.invitationCode || 'N/A' : 'N/A',
                // FIXED: Use todaysProfit from Amount model
                todaysProfit: amount ? amount.todaysProfit || 0 : 0,
                todaysReward:amount ? amount.todaysProfit || 0 : 0
            }
        });
        
    } catch (error) {
        console.error('Error in /api/user/complete-profile:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch user profile data'
        });
    }
});

module.exports = router;