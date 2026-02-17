const mongoose = require('mongoose');

const amountSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        ref: 'User'
    },
    frozenAmount: {
        type: Number,
        default: 0
    },
    totalBalance: {
        type: Number,
        default: 0
    },
    freezingPoint: {
        type: Number,
        default: 0
    },
    vipLevel: {
        type: String,
        default: 'VIP1'
    },
    dailyLimit: {
        type: Number,
        default: 500
    },
    todaysProfit: {
        type: Number,
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Amount', amountSchema);