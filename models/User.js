const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    phoneNumber: {
        type: String,
        required: true,
        unique: true
    },
    loginPassword: {
        type: String,
        required: true
    },
    withdrawalPassword: {
        type: String,
        required: true
    },
    gender: {
        type: String,
        enum: ['male', 'female', 'other'],
        required: true
    },
    invitationCode: {
        type: String,
        required: true
    },
    status: { 
        type: String, 
        enum: ['pending', 'active', 'banned'], 
        default: 'pending' 
    },
    referredBy: {
        type: String,
        default: 'TYLX98M'
    },
    agreedToTerms: {
        type: Boolean,
        required: true,
        default: false
    },
    resetPasswordToken: {
        type: String
    },
    resetPasswordExpires: {
        type: Date
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('User', userSchema);