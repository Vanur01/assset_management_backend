import express from 'express';
import AuthController from '../controllers/auth.controller.js';
import { authenticate } from '../middlewares/verifyToken.js';
import {
  validateRegisterSuperAdmin,
  validateLogin,
  validateChangePassword,
  validateForgotPassword,
  validateResetPassword
} from '../validation/user.validation.js';

const router = express.Router();

// Public routes
router.post('/register', validateRegisterSuperAdmin, AuthController.registersuper_admin);
router.post('/login', validateLogin, AuthController.login);
router.post('/forgot-password', validateForgotPassword, AuthController.forgotPassword);
router.post('/reset-password', validateResetPassword, AuthController.resetPassword);

// Protected routes
router.post('/logout', authenticate, AuthController.logout);
router.get('/me', authenticate, AuthController.getCurrentUser);
router.post('/change-password', authenticate, validateChangePassword, AuthController.changePassword);
router.post('/update-last-active', authenticate, AuthController.updateLastActive);

export default router;