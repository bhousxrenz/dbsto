// Must run after verifyToken. Admin accounts are listed in ADMIN_USER_IDS (comma separated, default "admin").
const adminIds = () => (process.env.ADMIN_USER_IDS || 'admin').split(',').map(s => s.trim()).filter(Boolean);

module.exports = function requireAdmin(req, res, next) {
  if (!req.user || !adminIds().includes(req.user.userId)) {
    return res.status(403).json({ success: false, message: 'Admin only', error: null, meta: null, data: null });
  }
  next();
};

module.exports.adminIds = adminIds;
