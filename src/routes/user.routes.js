import express from 'express';
import UserController from '../controllers/user.controller.js';
import { authenticate, allowRoles } from '../middlewares/verifyToken.js';
import {
  validateRegistersuper_admin, validateLogin, validateChangePassword,
  validateCreateClient, validateUpdateClient, validateClientId, validateToggleClientStatus,
  validateListClients, validateCreateTeamMember, validateUpdateTeamMember,
  validateTeamMemberId, validateListTeamMembers, validateUpdateMyProfile, validateChangeMyPassword
} from '../validation/user.validation.js';
import { handleValidation } from '../validation/validationResult.js';

const router = express.Router();

// ==================== PUBLIC AUTH ROUTES ====================
router.post('/auth/register', validateRegistersuper_admin, handleValidation, UserController.registersuper_admin);
router.post('/auth/login', validateLogin, handleValidation, UserController.login);
router.post('/auth/logout', authenticate, UserController.logout);
router.get('/auth/me', authenticate, UserController.getCurrentUser);

// ==================== CLIENT MANAGEMENT (Super Admin Only) ====================
router.post('/clients', authenticate, allowRoles('super_admin'), UserController.createClient);
router.get('/clients', authenticate, allowRoles('super_admin'), UserController.getAllClients);
router.get('/clients/subscription-report', authenticate, allowRoles('super_admin'), UserController.getSubscriptionReport);
router.get('/clients/subscription-report/export', authenticate, allowRoles('super_admin'), UserController.exportSubscriptionReport);
router.get('/clients/:id', authenticate, allowRoles('super_admin'), UserController.getClientById);
router.put('/clients/:id', authenticate, allowRoles('super_admin'), UserController.updateClient);
router.delete('/clients/:id', authenticate, allowRoles('super_admin'), UserController.deleteClient);
router.patch('/clients/:id/status', authenticate, allowRoles('super_admin'), UserController.toggleClientStatus);
router.patch('/clients/:id/auto-renewal', authenticate, allowRoles('super_admin'), UserController.toggleAutoRenewal);

// ==================== ADMIN DASHBOARD ====================
router.get('/admin/dashboard', authenticate, allowRoles('admin'), UserController.getAdminDashboard);

// ==================== TEAM MANAGEMENT (Admin Only) ====================
router.post('/team', authenticate, allowRoles('admin'), validateCreateTeamMember, handleValidation, UserController.createTeamMember);
router.get('/team', authenticate, allowRoles('admin'), validateListTeamMembers, handleValidation, UserController.getAllTeamMembers);
router.get('/team/stats', authenticate, allowRoles('admin'), UserController.getTeamStats);
router.get('/team/:id', authenticate, allowRoles('admin'), UserController.getTeamMemberById);
router.get('/team/:id/details', authenticate, allowRoles('admin'), UserController.getTeamMemberDetails);
router.put('/team/:id', authenticate, allowRoles('admin'), UserController.updateTeamMember);
router.delete('/team/:id', authenticate, allowRoles('admin'), UserController.deleteTeamMember);

// ==================== TEAM SELF-SERVICE ====================
router.get('/team/me/profile', authenticate, allowRoles('team'), UserController.getMyProfile);
router.patch('/team/me/profile', authenticate, allowRoles('team'), validateUpdateMyProfile, handleValidation, UserController.updateMyProfile);
router.post('/team/me/change-password', authenticate, allowRoles('team'), validateChangeMyPassword, handleValidation, UserController.changeMyPassword);
router.get('/team/me/recent-inspections', authenticate, allowRoles('team'), UserController.getMyRecentInspections);
router.get('/team/me/assigned-assets', authenticate, allowRoles('team'), UserController.getMyAssignedAssets);
router.get('/team/me/scheduled-tasks', authenticate, allowRoles('team'), UserController.getMyScheduledTasks);

// ================= contact routes =======================
router.post('/contact', UserController.createContact);
router.get('/getAllContact', authenticate, allowRoles('super_admin'), UserController.getAllContacts);
router.get('/getContactById/:id', authenticate, allowRoles('super_admin'), UserController.getContactById);
router.delete('/deleteContact/:id', authenticate, allowRoles('super_admin'), UserController.deleteContact)


export default router;