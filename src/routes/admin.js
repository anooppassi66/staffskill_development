const express = require('express');
const router = express.Router();
const { authMiddleware, requireRole } = require('../middleware/auth');
const adminController = require('../controllers/adminController');

// Admin-only employee management
router.get('/employees', authMiddleware, requireRole('admin'), adminController.listEmployees);
router.post('/employees/:employeeId/deactivate', authMiddleware, requireRole('admin'), adminController.deactivateEmployee);
router.post('/employees/:employeeId/activate', authMiddleware, requireRole('admin'), adminController.activateEmployee);
router.put('/employees/:employeeId', authMiddleware, requireRole('admin'), adminController.updateEmployee);
router.post('/employees/:employeeId/regenerate-password', authMiddleware, requireRole('admin'), adminController.regeneratePassword);

// Admin-only quiz management
router.post('/quizzes/:quizId/deactivate', authMiddleware, requireRole('admin'), adminController.deactivateQuiz);

// Admin-only enrolled employees
router.get('/enrolled-employees', authMiddleware, requireRole('admin'), adminController.getEnrolledEmployees);

router.get('/dashboard', authMiddleware, requireRole('admin'), adminController.dashboard);

module.exports = router;
