const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const commentController = require('../controllers/commentController');

// any authenticated role (admin, employee, normal_user) can view/post/vote
router.get('/', authMiddleware, commentController.listComments);
router.post('/', authMiddleware, commentController.createComment);
router.delete('/:commentId', authMiddleware, commentController.deleteComment);
router.post('/:commentId/vote', authMiddleware, commentController.voteComment);

module.exports = router;
