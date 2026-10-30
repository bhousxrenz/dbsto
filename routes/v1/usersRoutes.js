const express = require('express');
const router = express.Router();
const userController = require('../../controllers/v1/userController');
const verifyToken = require('../../middlewares/verifyToken');

// Basic CRUD
router.get('/', verifyToken, userController.getUsers);
router.get('/:userId', verifyToken, userController.getUser);

router.patch('/:userId', verifyToken, userController.updateUser);

router.delete('/:userId', verifyToken, userController.deleteUser);

// Password & status
router.patch('/:userId/password', verifyToken, userController.changePassword);
router.patch('/:userId/status', verifyToken, userController.updateStatus);

module.exports = router;