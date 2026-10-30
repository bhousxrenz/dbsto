const mongoose = require('mongoose');

// Certificate / Clearance / Barangay ID requests filled in by citizens.
const DocumentRequestSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true, index: true },
  type: { type: String, enum: ['CERTIFICATE', 'CLEARANCE', 'ID'], required: true },
  requestedByUsername: { type: String, required: true, index: true },
  fullName: { type: String, required: true },
  address: { type: String, required: true },
  contactNumber: { type: String, default: '' },
  birthDate: { type: String, default: '' },
  civilStatus: { type: String, default: '' },
  purpose: { type: String, default: '' },
  emergencyContactName: { type: String, default: '' },
  emergencyContactNumber: { type: String, default: '' },
  status: { type: String, enum: ['PENDING', 'READY', 'CLAIMED'], default: 'PENDING' },
}, { timestamps: true });

module.exports = mongoose.model('DocumentRequest', DocumentRequestSchema);
