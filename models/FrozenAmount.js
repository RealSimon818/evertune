const mongoose = require('mongoose');

const frozenAmountSchema = new mongoose.Schema({
  username: { type: String, required: true }, // User's username
  frozenUSDC: { type: Number, required: true }, // Frozen USDC amount
  frozenProfits: { type: Number, required: true }, // Frozen profit amount
  createdAt: { type: Date, default: Date.now }, // Timestamp
});

module.exports = mongoose.model('FrozenAmount', frozenAmountSchema);
