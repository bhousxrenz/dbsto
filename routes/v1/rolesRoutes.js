const express = require('express');
const router = express.Router();
const roleController = require('../../controllers/v1/roleController');
const verifyToken = require('../../middlewares/verifyToken');

// CRUD
router.get('/', verifyToken, roleController.getRoles);
router.get('/:roleId', verifyToken, roleController.getRole);

router.post('/', verifyToken, roleController.createRole);
router.patch('/:roleId', verifyToken, roleController.updateRole);
router.delete('/:roleId', verifyToken, roleController.deleteRole);

// Membership control (core of your system)

// Add user to role
router.post('/:roleId/members/:userId', verifyToken, roleController.addMember);

// Remove user from role
router.delete('/:roleId/members/:userId', verifyToken, roleController.removeMember);

// Transfer ownership
router.patch('/:roleId/owner', verifyToken, roleController.transferOwnership);

// Permission control for role itself
router.patch('/:roleId/permissions', verifyToken, roleController.updatePermissions);

module.exports = router;