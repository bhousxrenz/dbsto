const mongoose = require('mongoose');

// Wanted / missing person records (admin only can write).
const PersonSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true, index: true },
  type: { type: String, enum: ['WANTED', 'MISSING'], required: true, index: true },
  name: { type: String, required: true },
  age: { type: String, default: 'Unknown' },
  gender: { type: String, default: 'Unknown' },
  address: { type: String, default: 'Unknown' },
  description: { type: String, default: 'No description' },
  contactNumber: { type: String, default: '' },
  isFound: { type: Boolean, default: false },

  hasImage: { type: Boolean, default: false },
  image: { type: { data: Buffer, contentType: String }, select: false },
}, { timestamps: true });

module.exports = mongoose.model('Person', PersonSchema);
