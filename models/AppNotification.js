const mongoose = require('mongoose');

// Created by the server whenever something happens, so it reaches the other person's phone.
// recipient: "ALL" (every citizen) | "ADMIN" | a citizen's userId
const AppNotificationSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true, index: true },
  recipient: { type: String, required: true, index: true },
  title: { type: String, required: true },
  message: { type: String, default: '' },
  type: { type: String, default: 'GENERAL' }, // ANNOUNCEMENT, WANTED, MISSING, MESSAGE, COMMENT, DOCUMENT
  refId: { type: Number, default: 0 },
  extra: { type: String, default: '' },
  readBy: { type: [String], default: [] },    // userIds that opened it (a broadcast is read per user)
}, { timestamps: true });

module.exports = mongoose.model('AppNotification', AppNotificationSchema);
