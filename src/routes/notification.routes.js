import express from 'express';
import NotificationController from '../controllers/notification.controller.js';
import { authenticate, allowRoles } from '../middlewares/verifyToken.js';
import {
  validateNotificationId,
  validateListNotifications
} from '../validation/user.validation.js';

const router = express.Router();

// All notification routes require authentication
router.use(authenticate);

// User notification routes
router.get('/', validateListNotifications, NotificationController.getUserNotifications);
router.get('/unread-count', NotificationController.getUnreadCount);
router.patch('/:id/read', validateNotificationId, NotificationController.markAsRead);
router.patch('/read-all', NotificationController.markAllAsRead);
router.delete('/:id', validateNotificationId, NotificationController.deleteNotification);
router.get('/team', allowRoles('admin'), validateListNotifications, NotificationController.getTeamNotifications);
router.get('/clients', allowRoles('super_admin'), validateListNotifications, NotificationController.getClientNotifications);

export default router;