const mongoose = require('mongoose');

const historySchema = new mongoose.Schema({
    
    username: {
        type: String,
        required: true,
        index: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    status: {
        type: String,
        enum: ['reviewing', 'success', 'rejected'],
        default: 'reviewing'
    },
    transactionId: {
        type: String,
        default: function() {
            return 'DEP-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8).toUpperCase();
        }
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update the updatedAt field on save
historySchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// Index for better query performance
historySchema.index({ username: 1, createdAt: -1 });
historySchema.index({ status: 1, type: 1 });

module.exports = mongoose.model('History', historySchema);