const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const authController = require('../controllers/authController');
const { authMiddleware, requireRole } = require('../middleware/auth');

// public
router.post('/login', [body('email').isEmail(), body('password').isLength({ min: 1 }), validate], authController.login);
// public self-registration for normal users - stays pending until admin approval
router.post('/signup', [body('email').isEmail(), body('password').isLength({ min: 6 }).withMessage('password min 6'), validate], authController.signup);
// seed admin (dev) - call once
router.get('/seed-admin', authController.seedAdmin);

// admin-only create employee
router.post('/register', authMiddleware, requireRole('admin'), [body('email').isEmail(), validate], authController.register);

// edit profile for logged in user
router.put('/profile', authMiddleware, authController.editProfile);

// get profile for logged in user
router.get('/profile', authMiddleware, authController.getProfile);

// change password for logged in user
router.put('/password', authMiddleware, [
  body('current').isLength({ min: 1 }).withMessage('current required'),
  body('newPassword').isLength({ min: 6 }).withMessage('newPassword min 6'),
  validate
], authController.changePassword);

module.exports = router;
