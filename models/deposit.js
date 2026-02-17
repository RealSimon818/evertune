const mongoose = require('mongoose');

const depositSchema = new mongoose.Schema({
  username: { type: String, required: true }, // Add username
  amount: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Deposit', depositSchema);
