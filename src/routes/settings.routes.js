// routes/settings.routes.js
import express from 'express';
import SettingsController from '../controllers/settings.controller.js';
import { authenticate, allowRoles } from '../middlewares/verifyToken.js';

const router = express.Router();
router.use(authenticate);
router.get('/', SettingsController.getSettings);
router.put('/notifications', SettingsController.updateNotifications);
router.put('/security', SettingsController.updateSecurity);
router.post('/security/change-password', SettingsController.changePassword);
router.post('/security/2fa/setup', SettingsController.setupTwoFactorAuth);
router.put('/preferences', SettingsController.updatePreferences);
router.put('/appearance', SettingsController.updateAppearance);
router.put(
    '/admin-controls/:userId',
    allowRoles('super_admin'),
    SettingsController.updateAdminControls
);
router.put(
    '/system-settings',
    allowRoles('super_admin'),
    SettingsController.updateSystemSettings
);
router.put(
    '/data-visibility',
    allowRoles('admin'),
    SettingsController.updateDataVisibility
);
router.get(
    '/data-visibility/summary',
    allowRoles('admin'),
    SettingsController.getDataVisibilitySummary
);
router.post('/reset', SettingsController.resetSettings);
router.get('/history', SettingsController.getModificationHistory);
router.get(
    '/by-role/:role',
    allowRoles('super_admin'),
    SettingsController.getSettingsByRole
);

export default router;