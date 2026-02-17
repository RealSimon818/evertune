// routes/admin.js
require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const session = require('express-session');
const Amount = require('../models/Amount');
const Optimization = require('../models/Optimization');
const Withdrawal = require('../models/withdrawal');
const ReferralCode = require('../models/ReferralCode');
const AdminAmount = require('../models/AdminAmount');
const User = require('../models/User'); 
const FrozenAmount = require('../models/FrozenAmount');
const Deposit = require('../models/deposit');
const OptimizationActivity = require('../models/OptimizationActivity');


const router = express.Router();

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.log('MongoDB connection error:', err));

// Define the schema directly in the route
const adminSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
});

// Create a model from the schema
const Admin = mongoose.model('Admin', adminSchema);

// Middleware to check if admin is authenticated
function checkAdminAuthenticated(req, res, next) {
  if (req.session.isAuthenticated) {
    return next();
  }
  // Store the original URL in the session
  req.session.redirectTo = req.originalUrl;
  res.redirect('/adminlogin23?message=Please log in as an admin first.');
}

// Middleware to check if admin is authenticated and redirect to /login
function checkAdminAuthenticatedRedirectToLogin(req, res, next) {
    if (req.session.isAuthenticated) {
      return next();
    }
    // Store the original URL in the session
    req.session.redirectTo = req.originalUrl;
    res.redirect('/?message=Please log in first.');
  }

// GET Login Page
router.get('/adminlogin23', (req, res) => {
  res.render('adminlogin', { message: req.query.message || null });
});

// GET Register Page (restricted to logged-in admins)
router.get('/adminregister4536',  (req, res) => 
  res.render('adminregister', { error: req.query.error || null })
);

// POST Register (restricted to logged-in admins)
router.post('/adminregister',  async (req, res) => {
    const { username, password, confirmPassword } = req.body;
  
    // Check if passwords match
    if (password !== confirmPassword) {
      return res.redirect('/adminregister4536?error=Passwords do not match.');
    }
  
    // Password validation: 6-16 characters, includes letters and numbers
    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{6,16}$/;
    if (!passwordRegex.test(password)) {
      return res.redirect('/adminregister4536?error=Password must be 6-16 characters long and include both letters and numbers.');
    }
  
    try {
      // Hash the password and save the new admin
      const hashedPassword = await bcrypt.hash(password, 10);
      const newAdmin = new Admin({ username, password: hashedPassword });
  
      await newAdmin.save();
      res.redirect('/adminlogin23?message=Registration successful. Please log in.');
    } catch (err) {
      if (err.code === 11000) {
        return res.redirect('/adminregister4536?error=Username already exists.');
      } else {
        console.log(err);
        return res.redirect('/adminregister4536?error=An error occurred. Please try again.');
      }
    }
  });

 // Route to render the referral codes view
router.get('/viewReferralCodes', checkAdminAuthenticated, async (req, res) => {
  try {
    // Retrieve all referral codes from the database
    const referralCodes = await ReferralCode.find();
    res.render('viewReferralCodes', { referralCodes });
  } catch (error) {
    console.error('Error fetching referral codes:', error);
    res.status(500).send('Server Error');
  }
});

// Route to delete a referral code by ID
router.post('/delete-referral-code/:id', checkAdminAuthenticated, async (req, res) => {
  try {
    await ReferralCode.findByIdAndDelete(req.params.id);
    res.redirect('/viewReferralCodes');
  } catch (error) {
    console.error('Error deleting referral code:', error);
    res.status(500).send('Server Error');
  }
});
  


// Render the dashboard (restricted to logged-in admins)
router.get('/dashboard',checkAdminAuthenticated,  (req, res) => {
    res.render('dashboard');
  });

// POST Login
router.post('/adminlogin', async (req, res) => {
    const { username, password } = req.body;
  
    const admin = await Admin.findOne({ username });
    if (!admin) return res.redirect('/adminlogin23?message=Admin not found.');
  
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) return res.redirect('/adminlogin23?message=Invalid credentials.');
  
    req.session.isAuthenticated = true;
    req.session.adminusername = username; // Store the admin username in the session
  
    const redirectTo = req.session.redirectTo || '/admin/dashboard';
    delete req.session.redirectTo;
    res.redirect(redirectTo);
  });

 // Route to display accounts with freezingPoint <= latest optimizationCount for each specific user, excluding zero freezingPoint
router.get('/accounts', checkAdminAuthenticated, async (req, res) => {
  try {
    // Find all users in the Amount model with freezingPoint greater than zero
    const users = await Amount.find({ freezingPoint: { $gt: 0 } });

    // Create an array to hold users who meet the condition
    const eligibleAccounts = [];

    // Loop through each user and check their latest optimization count
    for (const user of users) {
      const latestOptimization = await Optimization.findOne({ username: user.username })
        .sort({ submissionDate: -1 });

      // If a latest optimization exists and freezingPoint <= optimizationCount, add user to the list with latest count
      if (latestOptimization && user.freezingPoint <= latestOptimization.optimizationCount) {
        eligibleAccounts.push({
          ...user.toObject(),
          latestOptimizationCount: latestOptimization.optimizationCount
        });
      }
    }

    res.render('accounts', { accounts: eligibleAccounts });
  } catch (error) {
    console.error(error);
    res.status(500).send('Server Error');
  }
});
  
// Render form to set freezing point for a specific user
router.get('/setFreezingPoint', checkAdminAuthenticated,  async (req, res) => {
    try {
      const username = req.session.username;
      const amountData = await Amount.findOne({ username });
  
      res.render('freezingPoint', {
        username,
        freezingPoint: amountData ? amountData.freezingPoint : 0
      });
    } catch (error) {
      res.render('freezingPoint', { message: 'Error Updating Freezing PointTry again.' });
    }
  });

// Route to set freezing point
router.post('/setFreezingPoint', checkAdminAuthenticated, async (req, res) => {
    const { username, freezingPoint } = req.body;
    await Amount.findOneAndUpdate({ username }, { freezingPoint });
    res.render('freezingPoint', { message: 'Freezing Point Updated' });
  });

  // Render form to set daily limit for a specific user
  router.get('/setDailyLimit', checkAdminAuthenticated, async (req, res) => {
    try {
      const username = req.session.username;
      const amountData = await Amount.findOne({ username });
  
      res.render('dailyLimit', {
        username,
        dailyLimit: amountData ? amountData.dailyLimit : 0
      });
    } catch (error) {
      res.render('dailyLimit', { message: 'Error Updating Daily Limit Try again.' });
    }
  });
  
  // Route to set daily limit
  router.post('/setDailyLimit', checkAdminAuthenticated, async (req, res) => {
    const { username, dailyLimit } = req.body;
    await Amount.findOneAndUpdate({ username }, { dailyLimit });
    res.render('dailyLimit', { message: 'Daily Limit Updated successfully!' });
  });
// Render form to change optimization count for a specific user
router.get('/setOptimizationCount', checkAdminAuthenticated, async (req, res) => {
  try {
      const username = req.session.username; // Ensure username is from the session or form

      // Fetch the latest optimization count and VIP level
      const amountData = await Amount.findOne({ username });
      const optimizationData = await Optimization.findOne({ username }).sort({ _id: -1 });

      const optimizationCount = optimizationData ? optimizationData.optimizationCount : 0;
      console.log("Latest Optimization Count from DB:", optimizationCount); // Log the latest optimization count

      const vipLevel = amountData ? amountData.vipLevel : 'VIP1';
      const optimizationLimits = {
          VIP1: 40,
          VIP2: 45,
          VIP3: 50,
          VIP4: 55,
      };
      const maxOptimizationCount = optimizationLimits[vipLevel] || 40;

      res.render('optimizationCount', {
          username,
          optimizationCount,
          maxOptimizationCount,
      });
  } catch (error) {
      console.error("Error loading optimization count page:", error);
      res.status(500).send('Error loading optimization count page');
  }
});

router.post('/setOptimizationCount', checkAdminAuthenticated, async (req, res) => {
  const { username } = req.body;

  try {
      // Check if the user exists in the database
      const user = await User.findOne({ username });
      if (!user) {
          return res.render('optimizationCount', { message: 'User not found.' });
      }

      // Fetch the user's current optimization count
      const optimizationData = await Optimization.findOne({ username }).sort({ _id: -1 });
     // Retrieve the optimization activity for the user
     const activity = await OptimizationActivity.findOne({ username });
     const currentOptimizationCount = activity ? activity.recordCreationCount : 0;
      // Prevent resetting the optimization count if it's >= 3
      if (currentOptimizationCount >= 3) {
          return res.render('optimizationCount', {
              message: `Optimization count cannot be reset as the current count is ${currentOptimizationCount}.`,
          });
      }

      // Create a new optimization record with default values and status as "completed"
      const newOptimization = new Optimization({
          username,
          selectedImage: 'images/msithin15.6.jpg', // Default value for required field
          imageName: 'MSI Thin 15.6"', // Default value for image name
          usdcAmount: 0, // Default value for USDC amount
          profitAmount: 0, // Default value for profit amount
          optimizationCount: 0, // Reset optimization count
          status: 'completed', // Explicitly set status as completed
      });

      await newOptimization.save();

      // Track the creation activity
     
      if (activity) {
          // Increment the record creation count
          activity.recordCreationCount += 1;
          await activity.save();
      } else {
          // Create a new record for the user's activity
          const newActivity = new OptimizationActivity({
              username,
              recordCreationCount: 1, // Start at 1 for the first creation
          });
          await newActivity.save();
      }

      res.render('optimizationCount', {
          message: 'Optimization count reset and activity recorded successfully.',
      });
  } catch (error) {
      console.error('Error updating optimization count:', error);
      res.status(500).send('Error updating optimization count');
  }
});


 // Admin Dashboard Route - Updated with user statistics
router.get('/admin/dashboard', checkAdminAuthenticated, async (req, res) => {
  try {
    // Fetch user statistics from database
    const totalUsers = await User.countDocuments();
    const pendingUsers = await User.countDocuments({ status: 'pending' });
    const activeUsers = await User.countDocuments({ status: 'active' });
    const bannedUsers = await User.countDocuments({ status: 'banned' });

    // Prepare user stats object
    const userStats = {
      total: totalUsers,
      pending: pendingUsers,
      active: activeUsers,
      banned: bannedUsers
    };

    // Render dashboard with stats and any messages
    res.render('adminDashboard', { 
      userStats: userStats,
      message: req.query.message || null,  // Allow passing message via query param
      error: req.query.error || null        // Allow passing error via query param
    });
    
  } catch (error) {
    console.error('Error fetching user stats:', error);
    res.render('adminDashboard', { 
      userStats: { total: 0, pending: 0, active: 0, banned: 0 },
      message: null,
      error: 'Failed to load user statistics'
    });
  }
});

  // Fetch all withdrawals in descending order
router.get('/withdrawals', async (req, res) => {
  try {
    const withdrawals = await Withdrawal.find().sort({ createdAt: -1 }); // Sort by createdAt in descending order
    res.render('withdrawals', { withdrawals }); // Pass sorted withdrawals to the view
  } catch (error) {
    console.error(error);
    res.status(500).send('Server error');
  }
});

// Search withdrawals by username
router.get('/withdrawals/search', async (req, res) => {
  const { username } = req.query;

  try {
    const withdrawals = await Withdrawal.find({ 
      username: { $regex: username, $options: 'i' } // Case-insensitive search
    }).sort({ createdAt: -1 });

    res.json({ withdrawals });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete a withdrawal
router.delete('/withdrawals/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const withdrawal = await Withdrawal.findByIdAndDelete(id);

    if (!withdrawal) {
      return res.status(404).json({ message: 'Withdrawal not found' });
    }

    res.status(200).json({ message: 'Withdrawal deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update withdrawal status
router.patch('/withdrawals/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['success', 'rejected'].includes(status)) {
    return res.status(400).json({ message: 'Invalid status' });
  }

  try {
    const withdrawal = await Withdrawal.findById(id);

    if (!withdrawal) {
      return res.status(404).json({ message: 'Withdrawal not found' });
    }

    withdrawal.status = status;
    await withdrawal.save();

    res.status(200).json({ message: `Withdrawal marked as ${status}` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin logout route
router.get('/admin/logout', checkAdminAuthenticated, (req, res) => {
  // Destroy the session and redirect to the login page
  req.session.destroy((err) => {
    if (err) {
      console.error('Error logging out:', err);
      return res.status(500).send('Error logging out. Please try again.');
    }
    res.redirect('/adminlogin23?message=You have been logged out successfully.');
  });
});


// Route to display user details
router.get('/user-stats',checkAdminAuthenticated, async (req, res) => {
  try {
    // Fetch all user balances and details
    const users = await Amount.find();

    // Fetch the optimization count for each user
    const userStats = await Promise.all(
      users.map(async (user) => {
        const optimizationCount = await Optimization.countDocuments({ username: user.username });
        return {
          username: user.username,
          totalBalance: user.totalBalance,
          todaysProfit: user.todaysProfit,
          freezingPoint: user.freezingPoint,
          vipLevel: user.vipLevel,
          dailyLimit: user.dailyLimit,
          optimizationCount,
        };
      })
    );

    res.render('userStats', { userStats });
  } catch (error) {
    console.error('Error fetching user stats:', error);
    res.redirect('/?message=An error occurred while fetching user stats.');
  }
});

// Search user stats by username
router.get('/user-stats/search', checkAdminAuthenticated, async (req, res) => {
  const { username } = req.query;

  try {
    // Search users by username with case-insensitive matching
    const users = await Amount.find({
      username: { $regex: username, $options: 'i' }
    });

    // Fetch the optimization count for each user
    const userStats = await Promise.all(
      users.map(async (user) => {
        const optimizationCount = await Optimization.countDocuments({ username: user.username });
        return {
          username: user.username,
          totalBalance: user.totalBalance,
          todaysProfit: user.todaysProfit,
          freezingPoint: user.freezingPoint,
          vipLevel: user.vipLevel,
          dailyLimit: user.dailyLimit,
          optimizationCount,
        };
      })
    );

    res.json({ userStats });
  } catch (error) {
    console.error('Error fetching user stats:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


// GET route to render the reset page
router.get('/reset-profits', checkAdminAuthenticated, (req, res) => {
  res.render('reset-profits', { success: null, message: '' });
});

// POST route to handle profit reset
router.post('/reset-profits', checkAdminAuthenticated, async (req, res) => {
  try {
    await Amount.updateMany({}, { todaysProfit: 0 }); // Reset todaysProfit to 0 for all users
    res.render('reset-profits', { success: true, message: 'All users\' profits reset to zero.' });
  } catch (error) {
    console.error('Error resetting profits:', error);
    res.render('reset-profits', { success: false, message: 'An error occurred while resetting profits.' });
  }
});


// GET route to render the form adminusdc
router.get('/usdc', (req, res) => {
  res.render('adminusdc'); // Ensure the file is in the 'views' folder
});

// POST route to save or update the USDC Amount and Profit for a specific user
router.post('/usdc', async (req, res) => {
  try {
    const { username, usdcAmount, profitAmount } = req.body;

    // Validate input fields
    if (!username || !usdcAmount || !profitAmount) {
      return res.status(400).send('All fields are required');
    }

    // Check if the user exists
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).send(`User with username "${username}" not found.`);
    }

    // Check if there's already a record for the username
    const existingAmount = await AdminAmount.findOne({ username });
    if (existingAmount) {
      // Update the existing record
      existingAmount.usdcAmount = parseFloat(usdcAmount);
      existingAmount.profitAmount = parseFloat(profitAmount);
      await existingAmount.save();

      return res.status(200).send(`USDC Amount and Profit updated successfully for user "${username}".`);
    }

    // Create a new record if none exists
    const newAmount = new AdminAmount({
      username,
      usdcAmount: parseFloat(usdcAmount),
      profitAmount: parseFloat(profitAmount),
    });

    await newAmount.save();
    res.status(201).send(`USDC Amount and Profit saved successfully for user "${username}".`);
  } catch (error) {
    console.error('Error saving admin data:', error);
    res.status(500).send('Server Error');
  }
});




// GET route to render the form for frozenusdc
router.get('/frozen',checkAdminAuthenticated, (req, res) => {
  res.render('frozenusdc'); // Ensure the file is in the 'views' folder
});

// POST route to save or update frozen USDC and profits
router.post('/frozen',checkAdminAuthenticated, async (req, res) => {
  try {
    const { username, frozenUSDC, frozenProfits } = req.body;

    // Validate input fields
    if (!username || !frozenUSDC || !frozenProfits) {
      return res.status(400).send('All fields are required');
    }

    // Check if the user exists
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).send(`User with username "${username}" not found.`);
    }

    // Check if there's already a record for the username
    const existingFrozenAmount = await FrozenAmount.findOne({ username });
    if (existingFrozenAmount) {
      // Update the existing record
      existingFrozenAmount.frozenUSDC = parseFloat(frozenUSDC);
      existingFrozenAmount.frozenProfits = parseFloat(frozenProfits);
      await existingFrozenAmount.save();

      return res.status(200).send(`Frozen USDC and profits updated successfully for user "${username}".`);
    }

    // Create a new record if none exists
    const newFrozenAmount = new FrozenAmount({
      username,
      frozenUSDC: parseFloat(frozenUSDC),
      frozenProfits: parseFloat(frozenProfits),
    });

    await newFrozenAmount.save();
    res.status(201).send(`Frozen USDC and profits saved successfully for user "${username}".`);
  } catch (error) {
    console.error('Error saving frozen data:', error);
    res.status(500).send('Server Error');
  }
});

router.get('/editdeposit', checkAdminAuthenticated, (req, res) => {
  res.render('editdeposit', { message: null, error: null });
});

router.post('/editdeposit', checkAdminAuthenticated, async (req, res) => {
  const { username, usdcAmount, profitAmount, frozenUSDC, frozenProfits, amount } = req.body;
  let message = '';
  let error = '';

  try {
    // Find user
    const user = await User.findOne({ username });
    if (!user) {
      return res.render('editdeposit', { message: null, error: `User with username "${username}" not found.` });
    }

    // Update or create USDC Amount and Profit
    if (usdcAmount && profitAmount) {
      const existingAmount = await AdminAmount.findOne({ username });
      if (existingAmount) {
        existingAmount.usdcAmount = parseFloat(usdcAmount);
        existingAmount.profitAmount = parseFloat(profitAmount);
        await existingAmount.save();
        message += 'USDC Amount and Profit updated successfully. ';
      } else {
        await new AdminAmount({ username, usdcAmount: parseFloat(usdcAmount), profitAmount: parseFloat(profitAmount) }).save();
        message += 'USDC Amount and Profit saved successfully. ';
      }
    }

    // Update or create Frozen USDC and Profits
    if (frozenUSDC && frozenProfits) {
      const existingFrozenAmount = await FrozenAmount.findOne({ username });
      if (existingFrozenAmount) {
        existingFrozenAmount.frozenUSDC = parseFloat(frozenUSDC);
        existingFrozenAmount.frozenProfits = parseFloat(frozenProfits);
        await existingFrozenAmount.save();
        message += 'Frozen USDC and Profits updated successfully. ';
      } else {
        await new FrozenAmount({ username, frozenUSDC: parseFloat(frozenUSDC), frozenProfits: parseFloat(frozenProfits) }).save();
        message += 'Frozen USDC and Profits saved successfully. ';
      }
    }

   // Update or create Deposit
   if (amount) {
    let existingDeposit = await Deposit.findOne({ username });
    if (existingDeposit) {
      existingDeposit.amount = parseFloat(amount);
      existingDeposit.updatedAt = new Date(); // Update timestamp
      await existingDeposit.save();
      message += 'Deposit updated successfully.';
    } else {
      await new Deposit({ username, amount: parseFloat(amount) }).save();
      message += 'Deposit saved successfully.';
    }
  }

  res.render('editdeposit', { message, error: null });
} catch (err) {
  console.error(err);
  res.render('editdeposit', { message: null, error: 'An error occurred while saving the data.' });
}
});

router.get('/userAmounts',checkAdminAuthenticated, async (req, res) => {
  try {
    // Fetch data from the schemas
    const adminAmounts = await AdminAmount.find();
    const frozenAmounts = await FrozenAmount.find();
    const deposits = await Deposit.find();

    // Group data by username
    const userMap = {};

    // Helper to add data into the map
    const addToMap = (username, key, value) => {
      if (!userMap[username]) {
        userMap[username] = {
          username,
          pendingUSDCAmount: 0,
          pendingProfits: 0,
          frozenAmount: 0,
          frozenProfits: 0,
          deposit: 0,
        };
      }
      userMap[username][key] += value;
    };

    // Add data from AdminAmount
    adminAmounts.forEach((item) => {
      addToMap(item.username, 'pendingUSDCAmount', item.usdcAmount);
      addToMap(item.username, 'pendingProfits', item.profitAmount);
    });

    // Add data from FrozenAmount
    frozenAmounts.forEach((item) => {
      addToMap(item.username, 'frozenAmount', item.frozenUSDC);
      addToMap(item.username, 'frozenProfits', item.frozenProfits);
    });

    // Add data from Deposit
    deposits.forEach((item) => {
      addToMap(item.username, 'deposit', item.amount);
    });

    // Convert the map to an array
    const userAmounts = Object.values(userMap);

    // Pass data to EJS
    res.render('userAmounts', { userAmounts });
  } catch (error) {
    console.error('Error fetching user amounts:', error);
    res.status(500).send('Server error');
  }
});

// Search user amounts by username
router.get('/userAmounts/search', checkAdminAuthenticated, async (req, res) => {
  const { username } = req.query;

  try {
    // Fetch data filtered by username (case-insensitive)
    const adminAmounts = await AdminAmount.find({ username: { $regex: username, $options: 'i' } });
    const frozenAmounts = await FrozenAmount.find({ username: { $regex: username, $options: 'i' } });
    const deposits = await Deposit.find({ username: { $regex: username, $options: 'i' } });

    // Group data by username
    const userMap = {};

    const addToMap = (username, key, value) => {
      if (!userMap[username]) {
        userMap[username] = {
          username,
          pendingUSDCAmount: 0,
          pendingProfits: 0,
          frozenAmount: 0,
          frozenProfits: 0,
          deposit: 0,
        };
      }
      userMap[username][key] += value;
    };

    adminAmounts.forEach(item => {
      addToMap(item.username, 'pendingUSDCAmount', item.usdcAmount);
      addToMap(item.username, 'pendingProfits', item.profitAmount);
    });

    frozenAmounts.forEach(item => {
      addToMap(item.username, 'frozenAmount', item.frozenUSDC);
      addToMap(item.username, 'frozenProfits', item.frozenProfits);
    });

    deposits.forEach(item => {
      addToMap(item.username, 'deposit', item.amount);
    });

    const userAmounts = Object.values(userMap);

    res.json({ userAmounts });
  } catch (error) {
    console.error('Error searching user amounts:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


// GET: Display users
router.get('/admin/users',checkAdminAuthenticated, async (req, res) => {
  try {
      const users = await User.find();
      res.render('users', { users });
  } catch (err) {
      console.error(err);
      res.status(500).send('Error retrieving users');
  }
});
router.get('/admin/users/search',checkAdminAuthenticated, async (req, res) => {
  try {
    const usernameQuery = req.query.username || '';
    const users = await User.find({ username: { $regex: usernameQuery, $options: 'i' } }); // Case-insensitive search
    res.json({ users });
  } catch (error) {
    console.error('Error in search route:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Route to show users with search and status filter
router.get('/admin/users/filter', async (req, res) => {
  try {
    const { username, status } = req.query;
    let filter = {};

    if (username) {
      filter.username = { $regex: username, $options: 'i' }; // Case-insensitive username search
    }

    if (status) {
      filter.status = status;
    }

    const users = await User.find(filter);
    res.json({ users });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'An error occurred while fetching users.' });
  }
});



// POST: Update user status
router.post('/admin/users/:id/status',checkAdminAuthenticated, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // Expect 'status' as 'active' or 'banned'
  try {
      await User.findByIdAndUpdate(id, { status });
      res.redirect('/admin/users');
  } catch (err) {
      console.error(err);
      res.status(500).send('Error updating user status');
  }
});


router.post('/admin/users/:id/delete', checkAdminAuthenticated, async (req, res) => {
  const { id } = req.params;

  try {
    // Find the user by ID to get their username
    const targetUser = await User.findById(id);

    if (!targetUser) {
      return res.status(404).send('User not found');
    }

    const username = targetUser.username;

    // Delete associated records in other collections
    await Promise.all([
      AdminAmount.deleteMany({ username }),
      Amount.deleteMany({ username }),
      Deposit.deleteMany({ username }),
      FrozenAmount.deleteMany({ username }),
      Optimization.deleteMany({ username }),
      Withdrawal.deleteMany({ username }),
    ]);

    // Finally, delete the user
    await User.findByIdAndDelete(id);

    res.redirect('/admin/users'); // Redirect to the user management page
  } catch (err) {
    console.error('Error deleting user and associated records:', err);
    res.status(500).send('Error deleting user and associated records');
  }
});


router.get('/optimization-activity', checkAdminAuthenticated, async (req, res) => {
  try {
      // Fetch all data from OptimizationActivity
      const data = await OptimizationActivity.find({});
      res.render('optimizationActivity', { data }); // Pass data to the EJS template
  } catch (error) {
      console.error('Error fetching optimization activity:', error);
      res.status(500).send('Error fetching optimization activity');
  }
});

// Route to reset optimization activity for all users
router.post('/resetAllOptimizationActivities', checkAdminAuthenticated, async (req, res) => {
  try {
      // Reset all users' recordCreationCount to zero
      await OptimizationActivity.updateMany({}, { $set: { recordCreationCount: 0 } });
      res.redirect('/optimization-activity'); // Redirect to the activity page after reset
  } catch (error) {
      console.error('Error resetting optimization activity for all users:', error);
      res.status(500).send('Error resetting optimization activity for all users');
  }
});

// Render form to reset optimization activity count for a specific user
router.get('/resetOptimizationActivity', checkAdminAuthenticated, async (req, res) => {
  res.render('resetOptimizationActivity', { message: null });
});

// Handle reset of optimization activity count for a specific user
router.post('/resetOptimizationActivity', checkAdminAuthenticated, async (req, res) => {
  const { username } = req.body;

  try {
      // Check if the user exists in the database
      const user = await User.findOne({ username });
      if (!user) {
          return res.render('resetOptimizationActivity', { message: 'User not found.' });
      }

      // Find the user's optimization activity record
      const activity = await OptimizationActivity.findOne({ username });
      if (!activity) {
          return res.render('resetOptimizationActivity', {
              message: 'No optimization activity record found for this user.',
          });
      }

      // Reset the record creation count to zero
      activity.recordCreationCount = 0;
      await activity.save();

      res.render('resetOptimizationActivity', {
          message: `Optimization activity for user "${username}" has been reset to zero.`,
      });
  } catch (error) {
      console.error('Error resetting optimization activity:', error);
      res.status(500).send('Error resetting optimization activity.');
  }
});






  
  
module.exports = router;
