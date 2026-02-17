const mongoose = require('mongoose');

const optimizationActivitySchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    recordCreationCount: { type: Number, default: 0 }, // Tracks how many times a record is created
}, { timestamps: true });

module.exports = mongoose.model('OptimizationActivity', optimizationActivitySchema);
