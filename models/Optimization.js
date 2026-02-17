// models/Optimization.js
const mongoose = require('mongoose');

const optimizationSchema = new mongoose.Schema({
  username: { type: String, required: true },
  selectedImage: { type: String, required: true },
  imageName: { type: String, required: true },
  usdcAmount: { type: Number, required: true },
  profitAmount: { type: Number, required: true },
  optimizationCount: { type: Number, required: true },
  submissionDate: { type: Date, default: Date.now },  
  status: { type: String, default: 'pending' } 
});

module.exports = mongoose.model('Optimization', optimizationSchema);
