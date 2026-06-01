import TeamService from '../services/team.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendResponse } from '../utils/response.js';

// Helper: build an asyncHandler that resolves adminId from query or JWT
const adminHandler = (fn) =>
  asyncHandler(async (req, res) => {
    const adminId = req.query.adminId || req.user._id;
    return fn(req, res, adminId);
  });

class TeamController {

  // ── Admin: CRUD ─────────────────────────────────────────────────────────────

  createTeamMember = adminHandler(async (req, res, adminId) => {
    const member = await TeamService.createTeamMember(req.body, adminId, req.user._id);
    return sendResponse(res, 201, 'Team member created successfully', { member });
  });

  getAllTeamMembers = asyncHandler(async (req, res) => {
    const result = await TeamService.getAllTeamMembers(req.user._id, req.query);
    return sendResponse(res, 200, 'Team members fetched successfully', result);
  });

  getTeamMemberById = adminHandler(async (req, res, adminId) => {
    const member = await TeamService.getTeamMemberById(req.params.id, adminId);
    return sendResponse(res, 200, 'Team member fetched successfully', { member });
  });

  getTeamMemberDetails = adminHandler(async (req, res, adminId) => {
    const member = await TeamService.getTeamMemberDetails(req.params.id, adminId);
    return sendResponse(res, 200, 'Team member details fetched successfully', { member });
  });

  updateTeamMember = adminHandler(async (req, res, adminId) => {
    const member = await TeamService.updateTeamMember(req.params.id, adminId, req.body, req.user._id);
    return sendResponse(res, 200, 'Team member updated successfully', { member });
  });

  deleteTeamMember = adminHandler(async (req, res, adminId) => {
    const result = await TeamService.deleteTeamMember(req.params.id, adminId, req.user._id);
    return sendResponse(res, 200, result.message);
  });

  getMyProfile = asyncHandler(async (req, res) => {
    const profile = await TeamService.getMyProfile(req.user._id);
    return sendResponse(res, 200, 'Profile fetched successfully', { profile });
  });

  updateMyProfile = asyncHandler(async (req, res) => {
    const profile = await TeamService.updateMyProfile(req.user._id, req.body);
    return sendResponse(res, 200, 'Profile updated successfully', { profile });
  });

  changeMyPassword = asyncHandler(async (req, res) => {
    const result = await TeamService.changeMyPassword(req.user._id, req.body);
    return sendResponse(res, 200, result.message);
  });

  getMyRecentInspections = asyncHandler(async (req, res) => {
    const inspections = await TeamService.getMyRecentInspections(req.user._id, parseInt(req.query.limit) || 10);
    return sendResponse(res, 200, 'Recent inspections fetched successfully', inspections);
  });
}

export default new TeamController();