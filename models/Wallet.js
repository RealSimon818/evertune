const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
  username: { type: String, required: true },
  name: { type: String, required: true },
  network: { type: String, required: true },
  cryptoWallet: { type: String, required: true },
  cryptoWalletAddress: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Wallet', walletSchema);
