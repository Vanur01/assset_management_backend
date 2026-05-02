import UserService from '../services/user.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendResponse } from '../utils/response.js';

class UserController {
  // ==================== AUTHENTICATION ====================
  registersuper_admin = asyncHandler(async (req, res) => {
    const result = await UserService.registersuper_admin(req.body);
    return sendResponse(res, 201, 'Super admin account created successfully', result);
  });

  login = asyncHandler(async (req, res) => {
    const result = await UserService.login(req.body);
    res.cookie('refreshToken', result.refreshToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 30 * 24 * 60 * 60 * 1000 });
    return sendResponse(res, 200, 'Login successful', { user: result.user, accessToken: result.accessToken });
  });

  logout = asyncHandler(async (req, res) => {
    await UserService.logout(req.user._id);
    res.clearCookie('refreshToken');
    return sendResponse(res, 200, 'Logged out successfully');
  });

  getCurrentUser = asyncHandler(async (req, res) => {
    const user = await UserService.getCurrentUser(req.user._id);
    return sendResponse(res, 200, 'User fetched successfully', { user });
  });

  changePassword = asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    await UserService.changePassword(req.user._id, currentPassword, newPassword);
    res.clearCookie('refreshToken');
    return sendResponse(res, 200, 'Password changed successfully. Please login again.');
  });

  updateLastActive = asyncHandler(async (req, res) => {
    await UserService.updateLastActive(req.user._id);
    return sendResponse(res, 200, 'Last active updated');
  });

  // ==================== CLIENT MANAGEMENT (Super Admin) ====================
  createClient = asyncHandler(async (req, res) => {
    const result = await UserService.createClient(req.body, req.user._id);
    return sendResponse(res, 201, 'Client created successfully', { client: result });
  });

  getAllClients = asyncHandler(async (req, res) => {
    const result = await UserService.getAllClients(req.query);
    return sendResponse(res, 200, 'Clients fetched successfully', result);
  });

  getClientById = asyncHandler(async (req, res) => {
    const client = await UserService.getClientById(req.params.id);
    return sendResponse(res, 200, 'Client fetched successfully', { client });
  });

  updateClient = asyncHandler(async (req, res) => {
    const client = await UserService.updateClient(req.params.id, req.body);
    return sendResponse(res, 200, 'Client updated successfully', { client });
  });

  deleteClient = asyncHandler(async (req, res) => {
    const permanent = req.query.permanent === 'true';
    const result = await UserService.deleteClient(req.params.id, permanent);
    return sendResponse(res, 200, result.message);
  });

  toggleClientStatus = asyncHandler(async (req, res) => {
    const { status } = req.body;
    const result = await UserService.toggleClientStatus(req.params.id, status);
    return sendResponse(res, 200, result.message);
  });

  toggleAutoRenewal = asyncHandler(async (req, res) => {
    const { enabled } = req.body;
    const result = await UserService.toggleAutoRenewal(req.params.id, enabled);
    return sendResponse(res, 200, `Auto-renewal ${enabled ? 'enabled' : 'disabled'} successfully`, result);
  });

  getSubscriptionReport = asyncHandler(async (req, res) => {
    const report = await UserService.getSubscriptionReport(req.query);
    return sendResponse(res, 200, 'Subscription report fetched successfully', report);
  });

  exportSubscriptionReport = asyncHandler(async (req, res) => {
    const workbook = await UserService.exportSubscriptionReport(req.query);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=subscription_report_${Date.now()}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  });

  getAdminDashboard = asyncHandler(async (req, res) => {
    const dashboard = await UserService.getAdminDashboardStats(req.user._id);
    return sendResponse(res, 200, 'Dashboard fetched successfully', dashboard);
  });

  // ==================== TEAM MANAGEMENT (Admin) ====================
  createTeamMember = asyncHandler(async (req, res) => {
    const adminId = req.query.adminId || req.user._id;
    const member = await UserService.createTeamMember(req.body, adminId, req.user._id);
    return sendResponse(res, 201, 'Team member created successfully', { member });
  });

  getAllTeamMembers = asyncHandler(async (req, res) => {
    console.log("fetch data...", req.user._id)
    const adminId = req.user._id;
    const result = await UserService.getAllTeamMembers(req.user._id, req.query);
    return sendResponse(res, 200, 'Team members fetched successfully', result);
  });

  getTeamMemberById = asyncHandler(async (req, res) => {
    const adminId = req.query.adminId || req.user._id;
    const member = await UserService.getTeamMemberById(req.params.id, adminId);
    return sendResponse(res, 200, 'Team member fetched successfully', { member });
  });

  getTeamMemberDetails = asyncHandler(async (req, res) => {
    const adminId = req.query.adminId || req.user._id;
    const member = await UserService.getTeamMemberDetails(req.params.id, adminId);
    return sendResponse(res, 200, 'Team member details fetched successfully', { member });
  });

  updateTeamMember = asyncHandler(async (req, res) => {
    const adminId = req.query.adminId || req.user._id;
    const member = await UserService.updateTeamMember(req.params.id, adminId, req.body);
    return sendResponse(res, 200, 'Team member updated successfully', { member });
  });

  deleteTeamMember = asyncHandler(async (req, res) => {
    const adminId = req.query.adminId || req.user._id;
    const permanent = req.query.permanent === 'true';
    const result = await UserService.deleteTeamMember(req.params.id, adminId, permanent);
    return sendResponse(res, 200, result.message);
  });

  getTeamStats = asyncHandler(async (req, res) => {
    const adminId = req.query.adminId || req.user._id;
    const stats = await UserService.getTeamStats(adminId);
    return sendResponse(res, 200, 'Team stats fetched successfully', { stats });
  });

  // ==================== TEAM SELF-SERVICE ====================
  getMyProfile = asyncHandler(async (req, res) => {
    const profile = await UserService.getMyProfile(req.user._id);
    return sendResponse(res, 200, 'Profile fetched successfully', { profile });
  });

  updateMyProfile = asyncHandler(async (req, res) => {
    const profile = await UserService.updateMyProfile(req.user._id, req.body);
    return sendResponse(res, 200, 'Profile updated successfully', { profile });
  });

  changeMyPassword = asyncHandler(async (req, res) => {
    const result = await UserService.changeMyPassword(req.user._id, req.body);
    return sendResponse(res, 200, result.message);
  });

  getMyRecentInspections = asyncHandler(async (req, res) => {
    const limit = parseInt(req.query.limit) || 10;
    const inspections = await UserService.getMyRecentInspections(req.user._id, limit);
    return sendResponse(res, 200, 'Recent inspections fetched successfully', inspections);
  });

  getMyAssignedAssets = asyncHandler(async (req, res) => {
    const assets = await UserService.getMyAssignedAssets(req.user._id);
    return sendResponse(res, 200, 'Assigned assets fetched successfully', assets);
  });

  getMyScheduledTasks = asyncHandler(async (req, res) => {
    const tasks = await UserService.getMyScheduledTasks(req.user._id);
    return sendResponse(res, 200, 'Scheduled tasks fetched successfully', tasks);
  });
}

export default new UserController();