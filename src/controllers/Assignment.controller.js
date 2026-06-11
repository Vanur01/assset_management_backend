// Assignment.controller.js

import AssignmentService from '../services/Assignment.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendResponse } from '../utils/response.js';

class AssignmentController {

  // ═══════════════════════════════════════════════════════════════
  //  ASSIGN
  // ═══════════════════════════════════════════════════════════════

  assignToAdmin = asyncHandler(async (req, res) => {
    const result = await AssignmentService.assignToAdmin(
      req.user._id,
      req.user.role,
      req.body
    );
    return sendResponse(res, 201, 'Checklist(s) assigned to admin successfully', result);
  });

  assignToTeam = asyncHandler(async (req, res) => {
    const result = await AssignmentService.assignToTeam(
      req.user._id,
      req.user.role,
      req.body
    );
    return sendResponse(res, 201, 'Checklist(s) assigned to team successfully', result);
  });

  // ═══════════════════════════════════════════════════════════════
  //  REASSIGN
  // ═══════════════════════════════════════════════════════════════

  reassignToAdmin = asyncHandler(async (req, res) => {
    const result = await AssignmentService.reassignToAdmin(
      req.params.id,
      req.body.newAdminId,
      req.user._id,
      req.user.role,
      req.body
    );
    return sendResponse(res, 200, 'Assignment reassigned to admin successfully', result);
  });

  reassignToTeam = asyncHandler(async (req, res) => {
    const result = await AssignmentService.reassignToTeam(
      req.params.id,
      req.body.newTeamMemberIds,
      req.user._id,
      req.user.role,
      req.body
    );
    return sendResponse(res, 200, 'Assignment reassigned to team successfully', result);
  });

  // ═══════════════════════════════════════════════════════════════
  //  GET ASSIGNMENTS (admin / super_admin view)
  // ═══════════════════════════════════════════════════════════════

  getAssignments = asyncHandler(async (req, res) => {
    const result = await AssignmentService.getAssignments(
      req.user._id,
      req.user.role,
      req.query
    );
    return sendResponse(res, 200, 'Assignments retrieved successfully', result);
  });

  getAssignmentById = asyncHandler(async (req, res) => {
    const result = await AssignmentService.getAssignmentById(
      req.params.id,
      req.user._id,
      req.user.role
    );
    return sendResponse(res, 200, 'Assignment retrieved successfully', result);
  });

  getDeletedAssignments = asyncHandler(async (req, res) => {
    const result = await AssignmentService.getDeletedAssignments(
      req.user._id,
      req.user.role,
      req.query
    );
    return sendResponse(res, 200, 'Deleted assignments retrieved successfully', result);
  });

  // ═══════════════════════════════════════════════════════════════
  //  SUBMISSIONS (admin / super_admin)
  // ═══════════════════════════════════════════════════════════════

  /**
   * GET /assignments/:id/submissions
   * List all submissions for one assignment with submitter info
   */
  getSubmissionsByAssignment = asyncHandler(async (req, res) => {
    const result = await AssignmentService.getSubmissionsByAssignment(
      req.params.id,
      req.user._id,
      req.user.role,
      req.query
    );
    return sendResponse(res, 200, 'Submissions retrieved successfully', result);
  });

  /**
   * GET /assignments/:id/submissions/:submissionId
   * Full detail of one submission
   */
  getSubmissionDetail = asyncHandler(async (req, res) => {
    const result = await AssignmentService.getSubmissionDetail(
      req.params.id,
      req.params.submissionId,
      req.user._id,
      req.user.role
    );
    return sendResponse(res, 200, 'Submission detail retrieved successfully', result);
  });

  /**
   * GET /assignments/recent-submissions
   * Recent submissions across all assignments (admin/super_admin dashboard)
   */
  getRecentSubmissions = asyncHandler(async (req, res) => {
    const result = await AssignmentService.getRecentSubmissions(
      req.user._id,
      req.user.role,
      req.query
    );
    return sendResponse(res, 200, 'Recent submissions retrieved successfully', result);
  });

  /**
   * PATCH /assignments/:id/submissions/:submissionId/review
   * Admin/super_admin reviews (approve/reject/request revision) a submission
   */
  reviewSubmission = asyncHandler(async (req, res) => {
    const result = await AssignmentService.reviewSubmission(
      req.params.id,
      req.params.submissionId,
      req.user._id,
      req.user.role,
      req.body
    );
    return sendResponse(res, 200, 'Submission reviewed successfully', result);
  });

  // ═══════════════════════════════════════════════════════════════
  //  ANALYTICS (admin / super_admin)
  // ═══════════════════════════════════════════════════════════════

  getAssignmentStats = asyncHandler(async (req, res) => {
    const result = await AssignmentService.getAssignmentStats(
      req.user._id,
      req.user.role,
      req.query
    );
    return sendResponse(res, 200, 'Assignment statistics retrieved successfully', result);
  });

  /**
   * GET /assignments/analytics
   * Rich analytics: submission trends, top performers, overdue summary, etc.
   */
  getAnalytics = asyncHandler(async (req, res) => {
    const result = await AssignmentService.getAnalytics(
      req.user._id,
      req.user.role,
      req.query
    );
    return sendResponse(res, 200, 'Analytics retrieved successfully', result);
  });

  // ═══════════════════════════════════════════════════════════════
  //  TEAM — my tasks
  // ═══════════════════════════════════════════════════════════════

  /**
   * GET /assignments/my-tasks
   * Team member: list of all checklists assigned to me
   */
  getMyTasks = asyncHandler(async (req, res) => {
    const result = await AssignmentService.getMyTasks(
      req.user._id,
      req.query
    );
    return sendResponse(res, 200, 'My tasks retrieved successfully', result);
  });

  /**
   * GET /assignments/my-tasks/:id
   * Team member: single task detail with full checklist fields
   */
  getMyTaskById = asyncHandler(async (req, res) => {
    const result = await AssignmentService.getMyTaskById(
      req.params.id,
      req.user._id
    );
    return sendResponse(res, 200, 'Task retrieved successfully', result);
  });

  /**
   * POST /assignments/:id/submit
   * Team member submits a checklist with optional image uploads
   * Body: { responses, notes, overallCondition, inspectorName, ... }
   * Files: req.files (images via multer)
   */
  submitAssignment = asyncHandler(async (req, res) => {
    const result = await AssignmentService.submitAssignment(
      req.params.id,
      req.user._id,
      req.body,
      req.files || []
    );
    return sendResponse(res, 200, 'Assignment submitted successfully', result);
  });

  // ═══════════════════════════════════════════════════════════════
  //  TEAM — inspection history
  // ═══════════════════════════════════════════════════════════════

  /**
   * GET /assignments/my-inspections
   * Team member: all inspections (submissions) they have personally submitted
   */
  getMyInspections = asyncHandler(async (req, res) => {
    const result = await AssignmentService.getMyInspections(
      req.user._id,
      req.query
    );
    return sendResponse(res, 200, 'Inspection history retrieved successfully', result);
  });

  /**
   * GET /assignments/my-inspections/:submissionId
   * Team member: detail of a single inspection by submission ID
   */
  getMyInspectionById = asyncHandler(async (req, res) => {
    const result = await AssignmentService.getMyInspectionById(
      req.params.submissionId,
      req.user._id
    );
    return sendResponse(res, 200, 'Inspection retrieved successfully', result);
  });

  // ═══════════════════════════════════════════════════════════════
  //  DELETE & RESTORE
  // ═══════════════════════════════════════════════════════════════

  softDeleteAssignment = asyncHandler(async (req, res) => {
    const result = await AssignmentService.softDeleteAssignment(
      req.params.id,
      req.user._id,
      req.user.role
    );
    return sendResponse(res, 200, result.message, result.assignment);
  });

  permanentDeleteAssignment = asyncHandler(async (req, res) => {
    const result = await AssignmentService.permanentDeleteAssignment(
      req.params.id,
      req.user._id,
      req.user.role
    );
    return sendResponse(res, 200, result.message, result.deletedInfo);
  });

  restoreAssignment = asyncHandler(async (req, res) => {
    const result = await AssignmentService.restoreAssignment(
      req.params.id,
      req.user._id,
      req.user.role
    );
    return sendResponse(res, 200, result.message, result.assignment);
  });
}

export default new AssignmentController();