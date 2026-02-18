const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const cron = require('node-cron');
const MongoStore = require('connect-mongo');
const path = require('path');
require('dotenv').config();


const app = express();

// Models
const User = require('./models/User');
const ReferralCode = require('./models/ReferralCode');
const Amount = require('./models/Amount');
const Optimization = require('./models/Optimization');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('MongoDB Connected'))
.catch(err => console.error('MongoDB Connection Error:', err));

// Session Configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
    resave: false, // Changed from true to false - better practice
    saveUninitialized: false, // Changed from true to false - better practice
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
        touchAfter: 24 * 3600,
        ttl: 14 * 24 * 60 * 60
    }),
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 14,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
    }
}));


// Helper Functions
function generateInvitationCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 7; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Middleware to check if user is authenticated
function checkAuthenticated(req, res, next) {
    if (req.session.isAuthenticated) {
        return next();
    }
    res.redirect('/?auth=login');
}

// Middleware to check if user is not authenticated
function checkNotAuthenticated(req, res, next) {
    if (!req.session.isAuthenticated) {
        return next();
    }
    res.redirect('/home');
}

// Routes

// Index Page (Login/Register/Forgot Password)
app.get('/', checkNotAuthenticated, (req, res) => {
    const { auth = 'login' } = req.query;
    const validPages = ['login', 'register', 'forgot-password'];
    
    let page = validPages.includes(auth) ? auth : 'login';
    
    const data = {
        page: page,
        message: req.query.message || '',
        success: req.query.success || ''
    };
    
    res.render('index', data);
});

// Reset Password Page (Separate)
app.get('/reset-password', (req, res) => {
    console.log('GET /reset-password - Session check:', {
        sessionID: req.sessionID,
        resetVerified: req.session.resetVerified,
        resetUserId: req.session.resetUserId
    });
    
    // Check if user has verified their identity
    if (!req.session.resetVerified) {
        console.log('Reset not verified, redirecting to forgot-password');
        return res.redirect('/?auth=forgot-password&message=' + encodeURIComponent('Please verify your identity first.'));
    }
    
    res.render('reset-password', { 
        message: '',
        success: ''
    });
});

// Home Page (Protected)
app.get('/home', checkAuthenticated, (req, res) => {
    res.render('home', { username: req.session.username });
});

// Logout Route
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Logout error:', err);
        }
        res.redirect('/?auth=login&message=' + encodeURIComponent('Logged out successfully'));
    });
});

// API Routes for Authentication

// Verify Referral Code API
app.post('/api/verify-referral', async (req, res) => {
    const { code } = req.body;

    try {
        if (!code) {
            return res.json({ valid: false, message: 'Referral code is required.' });
        }

        // Check if it's the default code
        if (code === 'TYLX98M') {
            return res.json({ valid: true, message: 'Default referral code accepted.' });
        }

        // Check if code exists in ReferralCode collection and is not used
        const referralCode = await ReferralCode.findOne({ code, used: false });
        
        if (!referralCode) {
            // Also check if code belongs to an existing user (their invitation code)
            const userWithCode = await User.findOne({ invitationCode: code });
            if (userWithCode) {
                return res.json({ valid: true, message: 'Referral code verified.' });
            }
            return res.json({ valid: false, message: 'Invalid or already used referral code.' });
        }

        res.json({ valid: true, message: 'Referral code verified.' });

    } catch (err) {
        console.error('Verify referral error:', err);
        res.status(500).json({ valid: false, message: 'An error occurred. Please try again.' });
    }
});

// Register API
app.post('/api/register', async (req, res) => {
    const { 
        username, 
        email, 
        phoneNumber, 
        password, 
        confirmPassword, 
        withdrawalPassword, 
        invitationCode, 
        gender,
        agreedToTerms 
    } = req.body;

    try {
        // Validate inputs
        if (!username || !email || !phoneNumber || !password || !confirmPassword || !withdrawalPassword || !invitationCode || !gender) {
            return res.status(400).json({ success: false, message: 'All fields are required.' });
        }

        if (!agreedToTerms) {
            return res.status(400).json({ success: false, message: 'You must agree to the terms and conditions.' });
        }

        // Validate passwords
        if (password !== confirmPassword) {
            return res.status(400).json({ success: false, message: 'Passwords do not match.' });
        }

        // Verify referral code
        let referralValid = false;
        if (invitationCode === 'TYLX98M') {
            referralValid = true;
        } else {
            const referralCode = await ReferralCode.findOne({ code: invitationCode, used: false });
            const userWithCode = await User.findOne({ invitationCode: invitationCode });
            
            if (referralCode || userWithCode) {
                referralValid = true;
            }
        }

        if (!referralValid) {
            return res.status(400).json({ success: false, message: 'Invalid or already used referral code.' });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ 
            $or: [
                { username }, 
                { email }, 
                { phoneNumber }
            ] 
        });
        
        if (existingUser) {
            if (existingUser.username === username) {
                return res.status(400).json({ success: false, message: 'Username already exists.' });
            }
            if (existingUser.email === email) {
                return res.status(400).json({ success: false, message: 'Email already exists.' });
            }
            if (existingUser.phoneNumber === phoneNumber) {
                return res.status(400).json({ success: false, message: 'Phone number already exists.' });
            }
        }

        // Hash passwords
        const hashedLoginPassword = await bcrypt.hash(password, 10);
        const hashedWithdrawalPassword = await bcrypt.hash(withdrawalPassword, 10);

        // Generate a unique invitation code for this user
        let newInvitationCode;
        let codeExists;
        do {
            newInvitationCode = generateInvitationCode();
            codeExists = await User.findOne({ invitationCode: newInvitationCode });
        } while (codeExists);

        // Create new user
        const newUser = new User({
            username,
            email,
            phoneNumber,
            loginPassword: hashedLoginPassword,
            withdrawalPassword: hashedWithdrawalPassword,
            gender,
            invitationCode: newInvitationCode,
            referredBy: invitationCode,
            agreedToTerms: true,
            status: 'pending'
        });

        await newUser.save();

        // Mark referral code as used if it was from ReferralCode collection
        if (invitationCode !== 'TYLX98M') {
            await ReferralCode.findOneAndUpdate(
                { code: invitationCode },
                { used: true },
                { new: true }
            );
        }

         // Create corresponding amount record
        const newAmount = new Amount({
            username: username,
            frozenAmount: 0,
            totalBalance: 0,
            freezingPoint: 0,
            vipLevel: 'VIP1',
            dailyLimit: 500,
            todaysProfit: 0
        });

        await newAmount.save();

        // Auto-authenticate the user
        req.session.isAuthenticated = true;
        req.session.username = username;
        req.session.userId = newUser._id;

        res.json({ 
            success: true, 
            message: 'Registration successful!',
            redirect: '/home'
        });

    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ success: false, message: 'An error occurred. Please try again.' });
    }
});

// Login API
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Username and password are required.' });
        }

        // Find user by username or email
        const user = await User.findOne({
            $or: [
                { username: username },
                { email: username }
            ]
        });

        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid credentials.' });
        }

        // Check if user is active
        if (user.status !== 'active') {
            return res.status(401).json({ success: false, message: 'Your account is not active. Please contact support.' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.loginPassword);

        if (!isPasswordValid) {
            return res.status(401).json({ success: false, message: 'Invalid credentials.' });
        }

        // Set session
        req.session.isAuthenticated = true;
        req.session.username = user.username;
        req.session.userId = user._id;

        res.json({ 
            success: true, 
            message: 'Login successful!',
            redirect: '/home'
        });

    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ success: false, message: 'An error occurred. Please try again.' });
    }
});

// Forgot Password API - Step 1: Verify user and initiate reset
app.post('/api/forgot-password', async (req, res) => {
    const { username, phoneNumber } = req.body;

    try {
        if (!username || !phoneNumber) {
            return res.status(400).json({ success: false, message: 'Username and phone number are required.' });
        }

        const user = await User.findOne({ 
            $or: [
                { username: username },
                { email: username }
            ],
            phoneNumber: phoneNumber 
        });

        if (!user) {
            // Don't reveal if user exists for security
            return res.json({ 
                success: false,
                message: 'No account found with the provided details.' 
            });
        }

        // Set session for password reset
        req.session.resetVerified = true;
        req.session.resetUserId = user._id.toString(); // Convert to string
        req.session.resetUsername = user.username;

        console.log('Setting reset session:', {
            sessionID: req.sessionID,
            resetVerified: req.session.resetVerified,
            resetUserId: req.session.resetUserId,
            resetUsername: req.session.resetUsername
        });

        // Explicitly save session before responding
        req.session.save((err) => {
            if (err) {
                console.error('Session save error:', err);
                return res.status(500).json({ success: false, message: 'Session error. Please try again.' });
            }
            
            console.log('Session saved successfully');
            res.json({ 
                success: true, 
                message: 'Identity verified! Redirecting to password reset...',
                redirect: '/reset-password'
            });
        });

    } catch (err) {
        console.error('Forgot password error:', err);
        res.status(500).json({ success: false, message: 'An error occurred. Please try again.' });
    }
});

// Reset Password API
app.post('/api/reset-password', async (req, res) => {
    const { password, confirmPassword } = req.body;
    
    console.log('Reset password request received:', {
        sessionID: req.sessionID,
        resetVerified: req.session.resetVerified,
        resetUserId: req.session.resetUserId,
        bodyReceived: !!password && !!confirmPassword
    });

    try {
        // Check if user is verified for password reset
        if (!req.session.resetVerified || !req.session.resetUserId) {
            console.log('Session verification failed:', {
                resetVerified: req.session.resetVerified,
                resetUserId: req.session.resetUserId
            });
            return res.status(400).json({ 
                success: false, 
                message: 'Password reset session expired or invalid. Please start the process again.' 
            });
        }

        if (!password || !confirmPassword) {
            return res.status(400).json({ success: false, message: 'All fields are required.' });
        }

        if (password !== confirmPassword) {
            return res.status(400).json({ success: false, message: 'Passwords do not match.' });
        }

       

        // Find user
        const user = await User.findById(req.session.resetUserId);
        console.log('Found user:', user ? user.username : 'Not found');

        if (!user) {
            // Clear invalid session
            req.session.resetVerified = false;
            req.session.resetUserId = null;
            return res.status(400).json({ success: false, message: 'User not found. Please start the process again.' });
        }

        // Check if new password is same as old password
        const isSamePassword = await bcrypt.compare(password, user.loginPassword);
        if (isSamePassword) {
            return res.status(400).json({ success: false, message: 'New password cannot be the same as old password.' });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(password, 10);
        user.loginPassword = hashedPassword;
        await user.save();

        console.log('Password updated successfully for user:', user.username);

        // Clear reset session
        req.session.resetVerified = false;
        req.session.resetUserId = null;
        req.session.resetUsername = null;

        // Save session changes
        req.session.save((err) => {
            if (err) {
                console.error('Session save error:', err);
            }
            
            res.json({ 
                success: true, 
                message: 'Password has been reset successfully! You can now login with your new password.',
                redirect: '/?auth=login&success=' + encodeURIComponent('Password reset successfully!')
            });
        });

    } catch (err) {
        console.error('Reset password error:', err);
        res.status(500).json({ success: false, message: 'An error occurred. Please try again.' });
    }
});

// Check Authentication Status
app.get('/api/auth/status', (req, res) => {
    res.json({
        isAuthenticated: !!req.session.isAuthenticated,
        username: req.session.username,
        resetVerified: !!req.session.resetVerified
    });
});


// Get user amount data
app.get('/api/user/amount', checkAuthenticated, async (req, res) => {
    try {
        let amountData = await Amount.findOne({ username: req.session.username });
        if (!amountData) {
            // Create default amount record if not exists
            amountData = new Amount({
                username: req.session.username,
                totalBalance: 0,
                vipLevel: 'VIP1',
                todaysProfit: 0,
                frozenAmount: 0,
                freezingPoint: 0,
                dailyLimit: 500
            });
            await amountData.save();
        }
        res.json(amountData);
    } catch (error) {
        console.error('Error fetching amount data:', error);
        res.status(500).json({ error: 'Failed to fetch amount data' });
    }
});

// Get user profile data
app.get('/api/user/profile', checkAuthenticated, async (req, res) => {
    try {
        const user = await User.findOne({ username: req.session.username });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({
            username: user.username,
            invitationCode: user.invitationCode
        });
    } catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).json({ error: 'Failed to fetch user profile' });
    }
});
// Get complete user data for profile dropdown
app.get('/api/user/complete-profile', checkAuthenticated, async (req, res) => {
    try {
        // Fetch user data
        const user = await User.findOne({ username: req.session.username });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Fetch amount data
        let amountData = await Amount.findOne({ username: req.session.username });
        
        // Create default amount record if not exists
        if (!amountData) {
            amountData = new Amount({
                username: req.session.username,
                totalBalance: 0,
                vipLevel: 'VIP1',
                todaysProfit: 0,
                totalProfits: 0, // Add totalProfits
                frozenAmount: 0,
                freezingPoint: 0,
                dailyLimit: 500
            });
            await amountData.save();
        }

        // Return combined data
        res.json({
            success: true,
            data: {
                username: user.username,
                invitationCode: user.invitationCode,
                totalBalance: amountData.totalBalance || 0,
                vipLevel: amountData.vipLevel || 'VIP1',
                todaysProfit: amountData.todaysProfit || 0,
                totalProfits: amountData.totalProfits || 0, // Add totalProfits
                frozenAmount: amountData.frozenAmount || 0,
                freezingPoint: amountData.freezingPoint || 0
            }
        });
    } catch (error) {
        console.error('Error fetching complete profile:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch profile data' 
        });
    }
});


app.post('/updateProgress', checkAuthenticated, async (req, res) => {
  try {
    const { todaysProfit, totalBalance } = req.body;
    const username = req.session.username;

    // Find the user's balance data
    const amountData = await Amount.findOne({ username });
    if (!amountData) {
      console.log('User data not found for username:', username);
      return res.status(404).json({ success: false, message: 'User data not found' });
    }

    // Get freezingPoint and ensure it's a number
    const freezingPoint = Number(amountData?.freezingPoint) || 103;
    const optimizationData = await Optimization.findOne({ username }).sort({ _id: -1 });
    const optimizationCount = optimizationData ? Number(optimizationData.optimizationCount) : 0;

    // Check if the freezing point has been reached
    if (optimizationCount >= freezingPoint) {
      console.log('Update blocked: Optimization count is greater than or equal to freezing point.');
      return res.status(400).json({
        success: false,
        message: 'Optimization limit reached. Unable to update progress.',
      });
    }

    // ADD to existing values
    amountData.todaysProfit = (parseFloat(amountData.todaysProfit) + parseFloat(todaysProfit)).toFixed(2);
    amountData.totalBalance = (parseFloat(amountData.totalBalance) + parseFloat(totalBalance)).toFixed(2);
    amountData.totalProfits = (parseFloat(amountData.totalProfits) + parseFloat(todaysProfit)).toFixed(2); // Add to lifetime profits
    
    await amountData.save();

    // Mark the latest optimization as "completed"
    await Optimization.findOneAndUpdate(
      { username, status: 'pending' },
      { $set: { status: 'completed' } },
      { sort: { _id: -1 } }
    );

    res.json({
      success: true,
      updatedTodaysProfit: amountData.todaysProfit,
      updatedTotalBalance: amountData.totalBalance,
      updatedTotalProfits: amountData.totalProfits,
      optimizationCount,
    });
  } catch (error) {
    console.error('Error updating progress:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


// Schedule job to reset 'todaysProfit' at midnight every day
cron.schedule('0 0 * * *', async () => {
  try {
    const result = await Amount.updateMany({}, { $set: { todaysProfit: 0 } });
    console.log(`${result.modifiedCount} user profits reset to zero at midnight.`);
  } catch (error) {
    console.error('Error resetting daily profits:', error);
  }
});


// Route to display T&C page
app.get('/terms', async (req, res) => {
  try {
    res.render('t&c');
  } catch (error) {
    console.error(error);
    res.status(500).send('Server error');
  }
});

// Route to display FAQS page
app.get('/faq', checkAuthenticated, async (req, res) => {
  try {
    res.render('faq');
  } catch (error) {
    console.error(error);
    res.status(500).send('Server error');
  }
});

// Route to display T&C page
app.get('/about', checkAuthenticated, async (req, res) => {
  try {
    res.render('about');
  } catch (error) {
    console.error(error);
    res.status(500).send('Server error');
  }
});



const startPageRoutes = require('./routes/startPage');
app.use(startPageRoutes);

app.use('/',require('./routes/optimizationRoutes'));
app.use('/',require('./routes/regislo'));
app.use('/',require('./routes/admin'));
app.use('/',require('./routes/balance'));

// Logout API
app.post('/api/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Logout failed' });
        }
        res.json({ success: true, message: 'Logged out successfully' });
    });
});

// Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});