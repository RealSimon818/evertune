const mongoose = require('mongoose');

const referralCodeSchema = new mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    used: {
        type: Boolean,
        default: false
    },
    createdBy: {
        type: String,
        ref: 'User'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('ReferralCode', referralCodeSchema);
