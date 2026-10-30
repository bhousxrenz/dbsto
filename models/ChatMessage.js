const mongoose = require('mongoose');

// One thread per citizen: threadKey is the citizen's userId. Admin and that citizen both write to it.
const ChatMessageSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true, index: true },
  threadKey: { type: String, required: true, index: true },
  senderUsername: { type: String, required: true },
  text: { type: String, required: true },
}, { timestamps: true });

module.exports = mongoose.model('ChatMessage', ChatMessageSchema);
