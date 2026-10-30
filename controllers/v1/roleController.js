const Role = require('../../models/Role');

// GET all roles
exports.getRoles = async (req, res) => {
    try {
        const roles = await Role.find();
        res.json(roles);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// GET single role
exports.getRole = async (req, res) => {
    try {
        const role = await Role.findOne({ roleId: req.params.roleId });
        if (!role) return res.status(404).json({ message: 'Role not found' });

        res.json(role);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// CREATE role
exports.createRole = async (req, res) => {
    try {
        const { roleId } = req.body;

        const exists = await Role.findOne({ roleId });
        if (exists) return res.status(400).json({ message: 'Role exists' });

        const role = new Role({
            roleId,
            owner: req.user.id,
            members: [req.user.id]
        });

        await role.save();

        res.status(201).json(role);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// UPDATE role (only owner)
exports.updateRole = async (req, res) => {
    try {
        const role = await Role.findOne({ roleId: req.params.roleId });
        if (!role) return res.status(404).json({ message: 'Role not found' });

        if (role.owner !== req.user.id) {
            return res.status(403).json({ message: 'Only owner can update role' });
        }

        Object.assign(role, req.body);
        await role.save();

        res.json({ message: 'Role updated' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// DELETE role (only owner)
exports.deleteRole = async (req, res) => {
    try {
        const role = await Role.findOne({ roleId: req.params.roleId });
        if (!role) return res.status(404).json({ message: 'Role not found' });

        if (role.owner !== req.user.id) {
            return res.status(403).json({ message: 'Only owner can delete role' });
        }

        await role.deleteOne();

        res.json({ message: 'Role deleted' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ADD MEMBER
exports.addMember = async (req, res) => {
    try {
        const { roleId, userId } = req.params;
        const requester = req.user.id;

        const role = await Role.findOne({ roleId });
        if (!role) return res.status(404).json({ message: 'Role not found' });

        const allowed =
            role.owner === requester ||
            role.allowedToPushUser.includes(requester);

        if (!allowed) {
            return res.status(403).json({ message: 'No permission' });
        }

        if (!role.members.includes(userId)) {
            role.members.push(userId);
            await role.save();
        }

        res.json({ message: 'Member added' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// REMOVE MEMBER
exports.removeMember = async (req, res) => {
    try {
        const { roleId, userId } = req.params;
        const requester = req.user.id;

        const role = await Role.findOne({ roleId });
        if (!role) return res.status(404).json({ message: 'Role not found' });

        const allowed =
            role.owner === requester ||
            role.allowedToPopUser.includes(requester);

        if (!allowed) {
            return res.status(403).json({ message: 'No permission' });
        }

        role.members = role.members.filter((m) => m !== userId);
        await role.save();

        res.json({ message: 'Member removed' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// TRANSFER OWNERSHIP
exports.transferOwnership = async (req, res) => {
    try {
        const { roleId } = req.params;
        const { newOwner } = req.body;

        const role = await Role.findOne({ roleId });
        if (!role) return res.status(404).json({ message: 'Role not found' });

        if (role.owner !== req.user.id) {
            return res.status(403).json({ message: 'Only owner can transfer' });
        }

        role.owner = newOwner;

        if (!role.members.includes(newOwner)) {
            role.members.push(newOwner);
        }

        await role.save();

        res.json({ message: 'Ownership transferred' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// UPDATE PERMISSIONS
exports.updatePermissions = async (req, res) => {
    try {
        const { roleId } = req.params;
        const { update, allowedToPushUser, allowedToPopUser } = req.body;

        const role = await Role.findOne({ roleId });
        if (!role) return res.status(404).json({ message: 'Role not found' });

        if (role.owner !== req.user.id) {
            return res.status(403).json({ message: 'Only owner can update permissions' });
        }

        if (allowedToPushUser && Array.isArray(allowedToPushUser)) {
            if (update === "push") {
                allowedToPushUser.forEach(user => {
                    if (!role.allowedToPushUser.includes(user)) {
                        role.allowedToPushUser.push(user);
                    }
                });
            } else if (update === "pop") {
                role.allowedToPushUser = role.allowedToPushUser.filter(u => !allowedToPushUser.includes(u));
            }
        }
        if (allowedToPopUser && Array.isArray(allowedToPopUser)) {
            if (update === "push") {
                allowedToPopUser.forEach(user => {
                    if (!role.allowedToPopUser.includes(user)) {
                        role.allowedToPopUser.push(user);
                    }
                });
            } else if (update === "pop") {
                role.allowedToPopUser = role.allowedToPopUser.filter(u => !allowedToPopUser.includes(u));
            }
        }

        await role.save();

        res.json({ message: 'Permissions updated' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};