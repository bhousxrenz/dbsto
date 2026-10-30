const express = require('express');
const router = express.Router();
const c = require('../../controllers/v1/barangayController');
const verifyToken = require('../../middlewares/verifyToken');
const requireAdmin = require('../../middlewares/requireAdmin');

// Everything the logged-in user may see, in one request (the app polls this)
router.get('/sync', verifyToken, c.sync);

// Photos (public read, so the app can load them with a plain URL)
router.get('/images/:kind/:id', c.image);

// Own profile photo (admin and citizens alike); everybody can then load it via /images/users/:userId
router.put('/profile-photo', verifyToken, c.setProfilePhoto);
router.delete('/profile-photo', verifyToken, c.removeProfilePhoto);

// Announcements: admin writes
router.post('/announcements', verifyToken, requireAdmin, c.createAnnouncement);
router.patch('/announcements/:id', verifyToken, requireAdmin, c.updateAnnouncement);
router.delete('/announcements/:id', verifyToken, requireAdmin, c.deleteAnnouncement);

// Comments: any logged-in user
router.post('/announcements/:id/comments', verifyToken, c.addComment);
router.post('/announcements/:id/comments/:commentId/replies', verifyToken, c.addReply);
router.put('/announcements/:id/comments/:commentId/reaction', verifyToken, c.setReaction);

// Wanted / missing persons: admin writes
router.post('/persons', verifyToken, requireAdmin, c.createPerson);
router.patch('/persons/:id', verifyToken, requireAdmin, c.updatePerson);
router.delete('/persons/:id', verifyToken, requireAdmin, c.deletePerson);

// Document requests: citizen creates, admin manages
router.post('/documents', verifyToken, c.createDocumentRequest);
router.patch('/documents/:id/status', verifyToken, requireAdmin, c.updateDocumentStatus);
router.delete('/documents/:id', verifyToken, requireAdmin, c.deleteDocumentRequest);

// Messages and notifications
router.post('/messages', verifyToken, c.sendMessage);
router.post('/notifications/read', verifyToken, c.markNotificationsRead);

// Resident verification: citizen's uploaded ID + admin decision (admin only - this is private)
router.get('/users/:userId/id-photo', verifyToken, requireAdmin, c.getIdPhoto);
router.patch('/users/:userId/verify', verifyToken, requireAdmin, c.setVerification);

module.exports = router;
