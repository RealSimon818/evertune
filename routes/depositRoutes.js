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

// Middleware to check if user is admin
function checkAdmin(req, res, next) {
    if (req.session.isAuthenticated && req.session.username === 'admin') {
        return next();
    }
    console.log(`Admin access denied for user: ${req.session.username || 'unknown'}`);
    res.status(403).send('Access denied. Admin only.');
}

// ==================== USER HISTORY PAGE ====================
router.get('/history', checkAuthenticated, async (req, res) => {
    try {
        const username = req.session.username;
        console.log(`Fetching history for user: ${username}`);
        
        // Fetch all history records for the logged-in user
        const history = await History.find({ username }).sort({ createdAt: -1 });
        console.log(`Found ${history.length} history records for ${username}`);
        
        // Calculate total successful deposits
        const totalDeposits = history
            .filter(h => h.status === 'success' && h.type === 'deposit')
            .reduce((sum, h) => sum + h.amount, 0);
        
        // Group history by status
        const reviewing = history.filter(h => h.status === 'reviewing');
        const success = history.filter(h => h.status === 'success');
        const rejected = history.filter(h => h.status === 'rejected');
        
        console.log(`History breakdown - Reviewing: ${reviewing.length}, Success: ${success.length}, Rejected: ${rejected.length}`);
        
        res.render('history', {
            totalDeposits,
            reviewing,
            success,
            rejected,
            message: req.query.message || null,
            error: req.query.error || null
        });
        
    } catch (error) {
        console.error('ERROR in /history route:', error);
        console.error('Stack trace:', error.stack);
        res.render('history', {
            totalDeposits: 0,
            reviewing: [],
            success: [],
            rejected: [],
            error: 'Failed to load history',
            message: null
        });
    }
});

// ==================== ADMIN ROUTES ====================

// Admin - Add history record page
router.get('/admin/add-history', checkAuthenticated, checkAdmin, async (req, res) => {
    try {
        console.log('Loading admin add-history page');
        res.render('admin-add-history', {
            message: req.session.message || null,
            error: req.session.error || null,
            formData: req.session.formData || null,
            searchedUsername: req.query.username || ''
        });
        
        // Clear session data after rendering
        req.session.message = null;
        req.session.error = null;
        req.session.formData = null;
        
    } catch (error) {
        console.error('ERROR loading admin add-history page:', error);
        console.error('Stack trace:', error.stack);
        res.render('admin-add-history', {
            message: null,
            error: 'Failed to load page',
            formData: null,
            searchedUsername: ''
        });
    }
});

// Admin - Search user API
router.get('/admin/search-user', checkAuthenticated, checkAdmin, async (req, res) => {
    try {
        const { username } = req.query;
        
        if (!username) {
            console.log('Search user API - No username provided');
            return res.json({ exists: false });
        }
        
        console.log(`Searching for user: ${username}`);
        const user = await User.findOne({ username });
        
        if (user) {
            console.log(`User found: ${username}`);
            return res.json({ exists: true, username: user.username });
        } else {
            console.log(`User not found: ${username}`);
            return res.json({ exists: false });
        }
        
    } catch (error) {
        console.error('ERROR in search-user API:', error);
        console.error('Stack trace:', error.stack);
        res.status(500).json({ exists: false, error: 'Server error' });
    }
});

// Admin - Add history record
router.post('/admin/add-history', checkAuthenticated, checkAdmin, async (req, res) => {
    try {
        const { username, amount, status, type } = req.body;
        console.log(`Adding history record - User: ${username}, Amount: ${amount}, Type: ${type}, Status: ${status}`);
        
        // Validate required fields
        if (!username || !amount || !type) {
            console.log('Validation failed: Missing required fields');
            req.session.error = 'Username, amount, and type are required';
            req.session.formData = req.body;
            return res.redirect('/admin/add-history');
        }
        
        // Validate amount
        const historyAmount = parseFloat(amount);
        if (isNaN(historyAmount) || historyAmount <= 0) {
            console.log(`Validation failed: Invalid amount - ${amount}`);
            req.session.error = 'Please enter a valid positive amount';
            req.session.formData = req.body;
            return res.redirect('/admin/add-history');
        }
        
        // Check if user exists
        console.log(`Checking if user exists: ${username}`);
        const user = await User.findOne({ username });
        if (!user) {
            console.log(`User not found: ${username}`);
            req.session.error = `User '${username}' not found in database`;
            req.session.formData = req.body;
            return res.redirect('/admin/add-history');
        }
        
        console.log(`User found: ${username}`);
        
        // Create history record
        const history = new History({
            username,
            amount: historyAmount,
            status: status || 'reviewing',
            type: type
        });
        
        await history.save();
        console.log(`History record saved with ID: ${history._id}`);
        
        // If status is 'success' and type is 'deposit', update user's balance
        if (status === 'success' && type === 'deposit') {
            console.log(`Processing successful deposit of ${historyAmount} for ${username}`);
            let amountRecord = await Amount.findOne({ username });
            
            if (amountRecord) {
                const oldBalance = amountRecord.totalBalance || 0;
                amountRecord.totalBalance = oldBalance + historyAmount;
                await amountRecord.save();
                console.log(`Updated balance for ${username}: ${oldBalance} -> ${amountRecord.totalBalance}`);
            } else {
                amountRecord = new Amount({
                    username,
                    totalBalance: historyAmount,
                    frozenAmount: 0,
                    freezingPoint: 0,
                    vipLevel: 'VIP1',
                    dailyLimit: 500,
                    todaysProfit: 0
                });
                await amountRecord.save();
                console.log(`Created new Amount record for ${username} with balance: ${historyAmount}`);
            }
        }
        
        // If status is 'success' and type is 'withdrawal', deduct from user's balance
        if (status === 'success' && type === 'withdrawal') {
            console.log(`Processing successful withdrawal of ${historyAmount} for ${username}`);
            const amountRecord = await Amount.findOne({ username });
            
            if (amountRecord) {
                const oldBalance = amountRecord.totalBalance || 0;
                amountRecord.totalBalance = Math.max(0, oldBalance - historyAmount);
                await amountRecord.save();
                console.log(`Updated balance for ${username}: ${oldBalance} -> ${amountRecord.totalBalance}`);
            } else {
                console.log(`Warning: No Amount record found for ${username} during withdrawal`);
            }
        }
        
        req.session.message = `${type.charAt(0).toUpperCase() + type.slice(1)} of $${historyAmount} added successfully for ${username}`;
        console.log(`History record added successfully: ${req.session.message}`);
        res.redirect('/admin/add-history');
        
    } catch (error) {
        console.error('ERROR in add-history POST route:', error);
        console.error('Stack trace:', error.stack);
        req.session.error = 'Failed to add history record';
        req.session.formData = req.body;
        res.redirect('/admin/add-history');
    }
});

// Admin - View all history records with pagination and filtering
router.get('/admin/history', checkAuthenticated, checkAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const skip = (page - 1) * limit;
        const status = req.query.status;
        const type = req.query.type;
        const search = req.query.search;
        
        console.log(`Loading admin history page - Page: ${page}, Status: ${status || 'all'}, Type: ${type || 'all'}, Search: ${search || 'none'}`);
        
        // Build query
        let query = {};
        if (status && ['reviewing', 'success', 'rejected'].includes(status)) {
            query.status = status;
        }
        if (type && ['deposit', 'withdrawal'].includes(type)) {
            query.type = type;
        }
        if (search) {
            query.$or = [
                { username: { $regex: search, $options: 'i' } },
                { transactionId: { $regex: search, $options: 'i' } }
            ];
        }
        
        // Get total count for pagination
        const total = await History.countDocuments(query);
        const totalPages = Math.ceil(total / limit);
        console.log(`Found ${total} records matching query`);
        
        // Get history records
        const history = await History.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);
        
        // Get stats
        const stats = {
            total: await History.countDocuments(),
            reviewing: await History.countDocuments({ status: 'reviewing' }),
            success: await History.countDocuments({ status: 'success' }),
            rejected: await History.countDocuments({ status: 'rejected' }),
            deposits: await History.countDocuments({ type: 'deposit' }),
            withdrawals: await History.countDocuments({ type: 'withdrawal' })
        };
        
        console.log('Stats:', stats);
        
        res.render('admin-history', {
            history,
            stats,
            page,
            totalPages,
            status: status || '',
            type: type || '',
            search: search || '',
            message: req.query.message || null,
            error: req.query.error || null
        });
        
    } catch (error) {
        console.error('ERROR in admin/history route:', error);
        console.error('Stack trace:', error.stack);
        res.status(500).render('admin-history', {
            history: [],
            stats: { total: 0, reviewing: 0, success: 0, rejected: 0, deposits: 0, withdrawals: 0 },
            page: 1,
            totalPages: 1,
            status: '',
            type: '',
            search: '',
            error: 'Failed to load history',
            message: null
        });
    }
});

// Admin - Edit history page
router.get('/admin/edit-history/:id', checkAuthenticated, checkAdmin, async (req, res) => {
    try {
        const historyId = req.params.id;
        console.log(`Loading edit page for history record: ${historyId}`);
        
        const history = await History.findById(historyId);
        
        if (!history) {
            console.log(`History record not found: ${historyId}`);
            req.session.error = 'History record not found';
            return res.redirect('/admin/history');
        }
        
        console.log(`Loaded history record: ${history._id} for user ${history.username}`);
        
        res.render('admin-edit-history', {
            history,
            message: req.session.message || null,
            error: req.session.error || null
        });
        
        // Clear session messages
        req.session.message = null;
        req.session.error = null;
        
    } catch (error) {
        console.error(`ERROR loading edit history page for ID ${req.params.id}:`, error);
        console.error('Stack trace:', error.stack);
        req.session.error = 'Failed to load history record';
        res.redirect('/admin/history');
    }
});

// Admin - Update history record
router.post('/admin/edit-history/:id', checkAuthenticated, checkAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { amount, status, type } = req.body;
        
        console.log(`Updating history record ${id} - Amount: ${amount}, Type: ${type}, Status: ${status}`);
        
        // Validate amount
        const historyAmount = parseFloat(amount);
        if (isNaN(historyAmount) || historyAmount <= 0) {
            console.log(`Validation failed: Invalid amount - ${amount}`);
            req.session.error = 'Please enter a valid positive amount';
            return res.redirect(`/admin/edit-history/${id}`);
        }
        
        const history = await History.findById(id);
        
        if (!history) {
            console.log(`History record not found: ${id}`);
            req.session.error = 'History record not found';
            return res.redirect('/admin/history');
        }
        
        const oldStatus = history.status;
        const oldAmount = history.amount;
        const oldType = history.type;
        
        console.log(`Old values - Status: ${oldStatus}, Amount: ${oldAmount}, Type: ${oldType}`);
        
        // Handle balance updates based on changes
        const amountRecord = await Amount.findOne({ username: history.username });
        
        if (amountRecord) {
            console.log(`Found Amount record for ${history.username} with balance: ${amountRecord.totalBalance}`);
            
            // If type changed
            if (oldType !== type) {
                console.log('Type changed, updating balances accordingly');
                // Remove effect of old type
                if (oldStatus === 'success') {
                    if (oldType === 'deposit') {
                        amountRecord.totalBalance = Math.max(0, (amountRecord.totalBalance || 0) - oldAmount);
                        console.log(`Removed deposit: new balance ${amountRecord.totalBalance}`);
                    } else if (oldType === 'withdrawal') {
                        amountRecord.totalBalance = (amountRecord.totalBalance || 0) + oldAmount;
                        console.log(`Removed withdrawal: new balance ${amountRecord.totalBalance}`);
                    }
                }
                
                // Apply effect of new type
                if (status === 'success') {
                    if (type === 'deposit') {
                        amountRecord.totalBalance = (amountRecord.totalBalance || 0) + historyAmount;
                        console.log(`Applied new deposit: new balance ${amountRecord.totalBalance}`);
                    } else if (type === 'withdrawal') {
                        amountRecord.totalBalance = Math.max(0, (amountRecord.totalBalance || 0) - historyAmount);
                        console.log(`Applied new withdrawal: new balance ${amountRecord.totalBalance}`);
                    }
                }
            }
            // If type same but status changed
            else if (oldStatus !== status) {
                console.log('Status changed, updating balances accordingly');
                // If changing from success to something else
                if (oldStatus === 'success' && status !== 'success') {
                    if (type === 'deposit') {
                        amountRecord.totalBalance = Math.max(0, (amountRecord.totalBalance || 0) - oldAmount);
                        console.log(`Removed deposit (status changed): new balance ${amountRecord.totalBalance}`);
                    } else if (type === 'withdrawal') {
                        amountRecord.totalBalance = (amountRecord.totalBalance || 0) + oldAmount;
                        console.log(`Removed withdrawal (status changed): new balance ${amountRecord.totalBalance}`);
                    }
                }
                // If changing to success from something else
                else if (oldStatus !== 'success' && status === 'success') {
                    if (type === 'deposit') {
                        amountRecord.totalBalance = (amountRecord.totalBalance || 0) + historyAmount;
                        console.log(`Applied deposit (status changed to success): new balance ${amountRecord.totalBalance}`);
                    } else if (type === 'withdrawal') {
                        amountRecord.totalBalance = Math.max(0, (amountRecord.totalBalance || 0) - historyAmount);
                        console.log(`Applied withdrawal (status changed to success): new balance ${amountRecord.totalBalance}`);
                    }
                }
            }
            // If both are success and amount changed
            else if (oldStatus === 'success' && status === 'success' && oldAmount !== historyAmount) {
                console.log('Amount changed while status remains success, updating balance');
                if (type === 'deposit') {
                    amountRecord.totalBalance = (amountRecord.totalBalance || 0) - oldAmount + historyAmount;
                    console.log(`Adjusted deposit amount: new balance ${amountRecord.totalBalance}`);
                } else if (type === 'withdrawal') {
                    amountRecord.totalBalance = (amountRecord.totalBalance || 0) + oldAmount - historyAmount;
                    console.log(`Adjusted withdrawal amount: new balance ${amountRecord.totalBalance}`);
                }
            }
            
            await amountRecord.save();
            console.log(`Balance saved for ${history.username}: ${amountRecord.totalBalance}`);
        } else {
            console.log(`No Amount record found for ${history.username}`);
        }
        
        // Update history record
        history.amount = historyAmount;
        history.status = status;
        history.type = type;
        await history.save();
        console.log(`History record ${id} updated successfully`);
        
        req.session.message = 'History record updated successfully';
        res.redirect(`/admin/edit-history/${id}`);
        
    } catch (error) {
        console.error(`ERROR updating history record ${req.params.id}:`, error);
        console.error('Stack trace:', error.stack);
        req.session.error = 'Failed to update history record';
        res.redirect(`/admin/edit-history/${req.params.id}`);
    }
});

// Admin - Delete history record
router.post('/admin/delete-history/:id', checkAuthenticated, checkAdmin, async (req, res) => {
    try {
        const historyId = req.params.id;
        console.log(`Deleting history record: ${historyId}`);
        
        const history = await History.findById(historyId);
        
        if (!history) {
            console.log(`History record not found for deletion: ${historyId}`);
            req.session.error = 'History record not found';
            return res.redirect('/admin/history');
        }
        
        console.log(`Found history record: User ${history.username}, Amount ${history.amount}, Status ${history.status}, Type ${history.type}`);
        
        // If record was successful, reverse the balance effect
        if (history.status === 'success') {
            console.log(`Reversing balance effect for ${history.username}`);
            const amountRecord = await Amount.findOne({ username: history.username });
            if (amountRecord) {
                const oldBalance = amountRecord.totalBalance || 0;
                if (history.type === 'deposit') {
                    amountRecord.totalBalance = Math.max(0, oldBalance - history.amount);
                    console.log(`Reversed deposit: ${oldBalance} -> ${amountRecord.totalBalance}`);
                } else if (history.type === 'withdrawal') {
                    amountRecord.totalBalance = oldBalance + history.amount;
                    console.log(`Reversed withdrawal: ${oldBalance} -> ${amountRecord.totalBalance}`);
                }
                await amountRecord.save();
                console.log(`Balance saved for ${history.username}: ${amountRecord.totalBalance}`);
            } else {
                console.log(`No Amount record found for ${history.username} to reverse balance`);
            }
        }
        
        await History.findByIdAndDelete(historyId);
        console.log(`History record ${historyId} deleted successfully`);
        
        req.session.message = 'History record deleted successfully';
        res.redirect('/admin/history');
        
    } catch (error) {
        console.error(`ERROR deleting history record ${req.params.id}:`, error);
        console.error('Stack trace:', error.stack);
        req.session.error = 'Failed to delete history record';
        res.redirect('/admin/history');
    }
});

module.exports = router;