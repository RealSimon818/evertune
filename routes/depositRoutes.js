const express = require('express');
const router = express.Router();
const History = require('../models/history');
const User = require('../models/User');
const Amount = require('../models/Amount');
const Optimization = require('../models/Optimization');
const Deposit = require('../models/deposit');

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

        // ── Freezing-point check for profile modal + balance card ──────
        const FREEZING_POINT = Number(amount?.freezingPoint) || 0;
        let displayBalance = parseFloat(amount?.totalBalance || 0);
        let isFrozen = false;
        let frozenDepositAmount = 0;

        if (FREEZING_POINT > 0) {
            const latestOptimization = await Optimization.findOne({ username }).sort({ _id: -1 });
            const optimizationCount = latestOptimization ? Number(latestOptimization.optimizationCount) : 0;

            if (optimizationCount >= FREEZING_POINT) {
                const depositRecord = await Deposit.findOne({ username });
                frozenDepositAmount = depositRecord ? parseFloat(depositRecord.amount || 0) : 0;
                displayBalance = -frozenDepositAmount;
                isFrozen = true;
            }
        }
        // ──────────────────────────────────────────────────────────────
        
        res.render('deposit', {
            totalDeposits,
            isFrozen,
            frozenDepositAmount: frozenDepositAmount.toFixed(2),
            reviewing: history.filter(h => h.status === 'reviewing'),
            success: history.filter(h => h.status === 'success'),
            rejected: history.filter(h => h.status === 'rejected'),
            pending: [],
            message: req.query.message || null,
            error: req.query.error || null,
            user: {
                username: username,
                totalBalance: displayBalance,  // ← frozen-aware display balance
                vipLevel: amount ? amount.vipLevel || 'VIP1' : 'VIP1',
                invitationCode: user ? user.invitationCode : 'N/A',
                todaysProfit: amount ? amount.todaysProfit || 0 : 0,
                todaysReward: amount ? amount.todaysProfit || 0 : 0
            }
        });
        
    } catch (error) {
        console.error('ERROR in /deposit route:', error);
        console.error('Stack trace:', error.stack);
        res.render('deposit', {
            totalDeposits: 0,
            isFrozen: false,
            frozenDepositAmount: '0.00',
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

router.get('/api/user/complete-profile', checkAuthenticated, async (req, res) => {
    try {
        const username = req.session.username;
        const user = await User.findOne({ username });
        const amount = await Amount.findOne({ username });

        // ── Freezing-point check ──────────────────────────────────────
        const FREEZING_POINT = Number(amount?.freezingPoint) || 0;
        let displayBalance = parseFloat(amount?.totalBalance || 0);

        if (FREEZING_POINT > 0) {
            const latestOptimization = await Optimization.findOne({
                username
            }).sort({ _id: -1 });

            const optimizationCount = latestOptimization
                ? Number(latestOptimization.optimizationCount)
                : 0;

            if (optimizationCount >= FREEZING_POINT) {
                const depositData = await Deposit.findOne({ username });
                const depositAmount = depositData
                    ? parseFloat(depositData.amount || 0)
                    : 0;
                displayBalance = -depositAmount;
            }
        }
        // ──────────────────────────────────────────────────────────────

        res.json({
            success: true,
            data: {
                username: username,
                totalBalance: displayBalance.toFixed(2),
                vipLevel: amount ? amount.vipLevel || 'VIP1' : 'VIP1',
                invitationCode: user ? user.invitationCode || 'N/A' : 'N/A',
                todaysProfit: amount ? amount.todaysProfit || 0 : 0,
                todaysReward: amount ? amount.todaysProfit || 0 : 0
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