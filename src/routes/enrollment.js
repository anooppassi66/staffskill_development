const express = require('express');
const router = express.Router();
const { authMiddleware, requireRole } = require('../middleware/auth');
const enrollmentController = require('../controllers/enrollmentController');

router.post('/:courseId/enroll', authMiddleware, enrollmentController.enroll);
router.post('/:courseId/enroll/:employeeId', authMiddleware, requireRole('admin'), enrollmentController.enrollEmployee);
router.post('/:enrollmentId/approve', authMiddleware, requireRole('admin'), enrollmentController.approveEnrollment);
router.get('/pending', authMiddleware, requireRole('admin'), enrollmentController.listPendingEnrollments);
router.get('/me', authMiddleware, enrollmentController.listUserEnrollments);
router.post('/:courseId/complete-lesson', authMiddleware, [
	require('express-validator').body('chapterId').isLength({ min: 1 }),
	require('express-validator').body('lessonId').isLength({ min: 1 }),
	require('../middleware/validate')
], enrollmentController.markLessonComplete);
router.get('/:courseId/progress', authMiddleware, enrollmentController.getProgress);
router.get('/:courseId/resume', authMiddleware, enrollmentController.getNextLesson);

module.exports = router;
