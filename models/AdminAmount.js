const mongoose = require('mongoose');

const adminAmountSchema = new mongoose.Schema({
  username: { type: String, required: true }, // Store the username
  usdcAmount: { type: Number, required: true },
  profitAmount: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now }, // Optional: track when the record was created
});

module.exports = mongoose.model('AdminAmount', adminAmountSchema);
