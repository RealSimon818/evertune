// models/Deposit.js
const mongoose = require('mongoose');

const depositSchema = new mongoose.Schema({
  username: { 
    type: String, 
    required: true,
    index: true
  },
  amount: { 
    type: Number, 
    required: true 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  },
});

depositSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Check for both 'deposit' and 'Deposit' to be safe
const Deposit = mongoose.models.deposit || mongoose.models.Deposit || mongoose.model('deposit', depositSchema);

module.exports = Deposit;