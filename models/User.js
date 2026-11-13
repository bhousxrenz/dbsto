const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  userPasswordHash: { type: String, required: true },
  mfa: { type: Boolean, required: true },

  userLink: {
    type: Map,
    of: String,
  },
  userData: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
  },

  status: { type: String, enum: ["active", "deleted", "deactivated", "offline"] },

  lastLogin: { type: mongoose.Schema.Types.Mixed },

  publicKey: { type: String },

  // Valid ID uploaded at sign-up, reviewed by the admin to confirm the person is a barangay resident.
  // Not returned by normal queries -- served separately by GET /barangay/users/:userId/id-photo (admin only).
  idPhoto: { type: { data: Buffer, contentType: String }, select: false },
  hasIdPhoto: { type: Boolean, default: false },
  verification: { type: String, enum: ["PENDING", "VERIFIED", "REJECTED"], default: "PENDING" },
  verifiedAt: { type: Date },

  // Profile picture (what admin and citizens see of each other). Served by GET /barangay/images/users/:userId
  profilePhoto: { type: { data: Buffer, contentType: String }, select: false },
  hasProfilePhoto: { type: Boolean, default: false },
  profilePhotoUpdatedAt: { type: Date },

  // Sanctions for inappropriate language / content (see barangayController).
  // strikes: violations in the current period (reset after 90 quiet days); mutedUntil: no commenting before this time.
  strikes: { type: Number, default: 0 },
  lastStrikeAt: { type: Date },
  mutedUntil: { type: Date },
  // 4th violation: blocked for 7 days, 5th and more: 30 days (login refused until then). The admin can lift it.
  blockedUntil: { type: Date },
  sanctionLog: {
    type: [{ at: Date, action: String, reason: String, by: String, _id: false }],
    default: [],
  },
}, { timestamps: true });

UserSchema.pre('save', async function (next) {
  if (!this.isModified('userPasswordHash')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.userPasswordHash = await bcrypt.hash(this.userPasswordHash, salt);
    next();
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.model('User', UserSchema);
