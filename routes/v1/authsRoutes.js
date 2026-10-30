const express = require('express');
const router = express.Router();
const authController = require('../../controllers/v1/authController');
const verifyToken = require('../../middlewares/verifyToken');
const verifyRefreshToken = require('../../middlewares/verifyRefreshToken');
// Done and Tested
router.post('/signup', authController.signup);
router.post('/login', authController.login);
router.post('/recover/request', authController.recoverRequest);
router.post('/recover', authController.recover);

router.post('/refresh-token', verifyRefreshToken, authController.refreshToken);
router.post('/mfa', verifyToken, authController.mfa);
router.post('/sessions', verifyToken, authController.sessions);

module.exports = router;
