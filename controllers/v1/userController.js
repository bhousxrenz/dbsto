const User = require('../../models/User');
const Role = require('../../models/Role');
const jwt = require('jsonwebtoken');
const { adminIds } = require('../../middlewares/requireAdmin');

const isAdmin = (req) => adminIds().includes(req.user.userId);
// helpers
const generateAccessToken = async (user) => {
  // Get roles where user is a member
  const roles = await Role.find({ members: user.userId }).select('roleId');

  const roleIds = roles.map(r => r.roleId);

  return jwt.sign(
    { id: user._id, userId: user.userId, roles: roleIds },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '15m' }
  );
};

const generateRefreshToken = (user) => {
  return jwt.sign(
    { id: user._id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );
};


// GET all users
exports.getUsers = async (req, res) => {
    try {
        if (!isAdmin(req)) return res.status(403).json({ message: 'Admin only' });
        const users = await User.find().select('-userPasswordHash');
        res.json(users);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// GET single user + roles
exports.getUser = async (req, res) => {
    try {
        console.log('getUser');
        let { userId } = req.params;
        if (userId === '#self') {
            userId = req.user.userId;
        }
        if (userId !== req.user.userId && !isAdmin(req)) {
            return res.status(403).json({ message: 'Forbidden' });
        }
        const user = await User.findOne({ userId }).select('-userPasswordHash');
        if (!user) return res.status(404).json({ message: 'User not found' });

        const roles = await Role.find({ members: userId });

        res.json({ user, roles });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.updateUser = async (req, res) => {
    try {
        let { userId } = req.params;
        if (userId === '#self') {
            userId = req.user.userId;
        }

        if (userId !== req.user.userId && !isAdmin(req)) {
            return res.status(403).json({ message: 'Forbidden: can only edit your own account' });
        }

        if (req.body.userId && req.body.userId !== userId) {
            return res.status(400).json({ message: 'Cannot change userId' });
        }

        const user = await User.findOne({ userId });
        if (!user) return res.status(404).json({ message: 'User not found' });

        // Separate userData and userLink from other fields
        const { userData, userLink, ...otherFields } = req.body;

        // Non-admins may only change userData / userLink (not status, mfa, etc.)
        if (!isAdmin(req) && Object.keys(otherFields).length > 0) {
            return res.status(403).json({ message: 'Forbidden: only profile data can be changed' });
        }

        // Update only the fields explicitly provided in req.body
        for (const [key, value] of Object.entries(otherFields)) {
            if(key === 'userPasswordHash') {
                return res.status(400).json({ message: 'Cannot update password here' });
            }
            user[key] = value;
        }

        // Merge userData keys if provided
        if (userData) {
            for (const [key, value] of Object.entries(userData)) {
                user.userData.set(key, value); // update or add key
            }
        }

        // Merge userLink keys if provided
        if (userLink) {
            for (const [key, value] of Object.entries(userLink)) {
                user.userLink.set(key, value); // update or add key
            }
        }

        const accessToken = await generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        await user.save();
        res.status(201).json({ message: 'User updated', accessToken, refreshToken });
    } catch (err) {
        console.log(err.message);
        res.status(500).json({ message: err.message });
    }
};


// DELETE (soft)
exports.deleteUser = async (req, res) => {
    try {
        let { userId } = req.params;
        if (userId === '#self') {
            userId = req.user.userId;
        }
        if (userId !== req.user.userId && !isAdmin(req)) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        const user = await User.findOne({ userId });
        if (!user) return res.status(404).json({ message: 'User not found' });

        user.status = 'deleted';
        await user.save();

        res.json({ message: 'User deleted' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// CHANGE PASSWORD
exports.changePassword = async (req, res) => {
    try {
        let { userId } = req.params;
        if(userId === '#self') {
            userId = req.user.userId;
        }
        if (req.user.userId !== userId) {
            return res.status(403).json({ message: 'Forbidden: Can only change own password' });
        }
        const { newPassword } = req.body;

        const user = await User.findOne({ userId });
        if (!user) return res.status(404).json({ message: 'User not found' });

        user.userPasswordHash = newPassword;
        await user.save();

        res.json({ message: 'Password updated' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// UPDATE STATUS
exports.updateStatus = async (req, res) => {
    try {
        const { userId } = req.params;
        const { status } = req.body;
        if(req.user.userId !== userId) {
            return res.status(403).json({ message: 'Forbidden: Can only change own status' });
        }

        const user = await User.findOne({ userId });
        if (!user) return res.status(404).json({ message: 'User not found' });

        user.status = status;
        await user.save();

        res.json({ message: 'Status updated' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
