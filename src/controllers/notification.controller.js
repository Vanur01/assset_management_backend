import NotificationService from '../services/notification.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendResponse } from '../utils/response.js';

class NotificationController {
  getUserNotifications = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, unreadOnly = false } = req.query;
    const result = await NotificationService.getUserNotifications(req.user._id, {
      page: parseInt(page),
      limit: parseInt(limit),
      unreadOnly: unreadOnly === 'true'
    });
    return sendResponse(res, 200, 'Notifications fetched successfully', result);
  });

  markAsRead = asyncHandler(async (req, res) => {
    const notification = await NotificationService.markAsRead(req.params.id, req.user._id);
    return sendResponse(res, 200, 'Notification marked as read', { notification });
  });

  markAllAsRead = asyncHandler(async (req, res) => {
    const result = await NotificationService.markAllAsRead(req.user._id);
    return sendResponse(res, 200, 'All notifications marked as read', result);
  });

  deleteNotification = asyncHandler(async (req, res) => {
    const result = await NotificationService.deleteNotification(req.params.id, req.user._id);
    return sendResponse(res, 200, 'Notification deleted successfully', result);
  });

  getUnreadCount = asyncHandler(async (req, res) => {
    const count = await NotificationService.getUserNotifications(req.user._id, { limit: 1 });
    return sendResponse(res, 200, 'Unread count fetched', { unreadCount: count.unreadCount });
  });

  // For admin to see team member notifications
  getTeamNotifications = asyncHandler(async (req, res) => {
    const { type, unreadOnly, limit = 50 } = req.query;
    const notifications = await NotificationService.getTeamNotifications(req.user._id, {
      type,
      unreadOnly: unreadOnly === 'true',
      limit: parseInt(limit)
    });
    return sendResponse(res, 200, 'Team notifications fetched successfully', { notifications });
  });

  // For super admin to see client notifications
  getClientNotifications = asyncHandler(async (req, res) => {
    const { type, unreadOnly, limit = 50 } = req.query;
    const notifications = await NotificationService.getClientNotifications({
      type,
      unreadOnly: unreadOnly === 'true',
      limit: parseInt(limit)
    });
    return sendResponse(res, 200, 'Client notifications fetched successfully', { notifications });
  });
}

export default new NotificationController();