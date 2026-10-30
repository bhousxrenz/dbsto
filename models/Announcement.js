const mongoose = require('mongoose');

// Announcements posted by the admin. Comments (and their replies) live inside the
// announcement so one read gives the whole thread.
const AnnouncementSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true, index: true }, // numeric id the Android app uses
  content: { type: String, required: true },
  authorId: { type: String, required: true },
  authorName: { type: String, required: true },

  hasImage: { type: Boolean, default: false },
  // Not returned by normal queries (keeps /sync small). Served by GET /barangay/images/announcements/:id
  image: { type: { data: Buffer, contentType: String }, select: false },

  // [{ id, authorId, authorName, text, timestamp, reactions: [{u, e}], replies: [ same shape ] }]
  comments: { type: [mongoose.Schema.Types.Mixed], default: [] },
}, { timestamps: true });

module.exports = mongoose.model('Announcement', AnnouncementSchema);
