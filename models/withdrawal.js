const mongoose = require('mongoose');

const withdrawalSchema = new mongoose.Schema({
  username: { type: String, required: true },
  withdrawAmount: { type: Number, required: true },
  status: { type: String, enum: ['reviewing', 'success', 'rejected'], default: 'reviewing' }, // Add status field
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Withdrawal', withdrawalSchema);
