import AssignmentService from '../services/Assignment.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendResponse } from '../utils/response.js';

class AssignmentController {

  // ==================== CREATE ====================

  // Super Admin assigns to Admin
  assignToAdmin = asyncHandler(async (req, res) => {
    const result = await AssignmentService.assignChecklistToAdmin(
      req.user._id,
      req.user.role,
      req.body
    );
    return sendResponse(res, 201, 'Checklist assigned to admin successfully', result);
  });

  // Admin assigns to Team Members
  assignToTeam = asyncHandler(async (req, res) => {
    const result = await AssignmentService.assignChecklistToTeam(
      req.user._id,
      req.user.role,
      req.body
    );
    return sendResponse(res, 201, 'Checklist assigned to team members successfully', result);
  });

  // ==================== GET ASSIGNMENTS ====================

  getAssignments = asyncHandler(async (req, res) => {
    const result = await AssignmentService.getAssignments(
      req.user._id,
      req.user.role,
      req.query
    );
    return sendResponse(res, 200, 'Assignments retrieved successfully', result);
  });

  getAssignmentById = asyncHandler(async (req, res) => {
    const result = await AssignmentService.getAssignmentById(req.params.id);
    return sendResponse(res, 200, 'Assignment retrieved successfully', result);
  });

  getAssignmentDetails = asyncHandler(async (req, res) => {
    const result = await AssignmentService.getAssignmentDetails(
      req.params.id,
      req.user._id,
      req.user.role
    );
    return sendResponse(res, 200, 'Assignment details retrieved successfully', result);
  });

  // ==================== UPDATE & DELETE ====================

  updateAssignment = asyncHandler(async (req, res) => {
    const result = await AssignmentService.updateAssignment(
      req.params.id,
      req.user._id,
      req.user.role,
      req.body
    );
    return sendResponse(res, 200, 'Assignment updated successfully', result);
  });

  deleteAssignment = asyncHandler(async (req, res) => {
    const result = await AssignmentService.deleteAssignment(
      req.params.id,
      req.user._id,
      req.user.role
    );
    return sendResponse(res, 200, result.message, null);
  });

  // ==================== SUBMISSIONS ====================

  getSubmissionsForChecklist = asyncHandler(async (req, res) => {
    const result = await AssignmentService.getSubmissionsForChecklist(
      req.params.checklistId,
      req.user._id,
      req.user.role,
      req.query
    );
    return sendResponse(res, 200, 'Submissions retrieved successfully', result);
  });

  getSubmissionDetail = asyncHandler(async (req, res) => {
    const result = await AssignmentService.getAssignmentDetails(
      req.params.id,
      req.user._id,
      req.user.role
    );
    return sendResponse(res, 200, 'Submission detail retrieved successfully', result);
  });

  deleteSubmission = asyncHandler(async (req, res) => {
    const result = await AssignmentService.deleteSubmission(
      req.params.id,
      req.user._id,
      req.user.role
    );
    return sendResponse(res, 200, result.message, result);
  });

  reviewSubmission = asyncHandler(async (req, res) => {
    const result = await AssignmentService.reviewSubmission(
      req.params.id,
      req.user._id,
      req.user.role,
      req.body
    );
    return sendResponse(res, 200, 'Submission reviewed successfully', result);
  });

  // ==================== INSPECTION (Team Member) ====================

  submitInspection = asyncHandler(async (req, res) => {
    const result = await AssignmentService.submitInspection(
      req.params.id,
      req.user._id,
      req.user.role,
      req.body,
      req.files
    );
    return sendResponse(res, 200, 'Inspection submitted successfully', result);
  });

  saveDraft = asyncHandler(async (req, res) => {
    const result = await AssignmentService.saveDraft(
      req.params.id,
      req.user._id,
      req.body
    );
    return sendResponse(res, 200, 'Draft saved successfully', result);
  });

  clearChecklist = asyncHandler(async (req, res) => {
    const result = await AssignmentService.clearAssignment(
      req.params.id,
      req.user._id,
      req.user.role
    );
    return sendResponse(res, 200, 'Checklist cleared successfully', result);
  });

  // ==================== LISTS & VIEWS ====================

  getAssignees = asyncHandler(async (req, res) => {
    const result = await AssignmentService.getAssignees(
      req.params.checklistId,
      req.user._id,
      req.user.role
    );
    return sendResponse(res, 200, 'Assignees retrieved successfully', result);
  });

  getInspectionHistory = asyncHandler(async (req, res) => {
    const result = await AssignmentService.getInspectionHistory(
      req.user._id,
      req.query
    );
    return sendResponse(res, 200, 'Inspection history retrieved successfully', result);
  });

  getCalendarTasks = asyncHandler(async (req, res) => {
    const result = await AssignmentService.getCalendarTasks(
      req.user._id,
      req.user.role,
      req.query
    );
    return sendResponse(res, 200, 'Calendar tasks retrieved successfully', result);
  });

  // ==================== ANALYTICS & STATISTICS ====================

  getChecklistAnalytics = asyncHandler(async (req, res) => {
    const result = await AssignmentService.getChecklistAnalytics(
      req.params.checklistId,
      req.user._id,
      req.user.role,
      req.query
    );
    return sendResponse(res, 200, 'Analytics retrieved successfully', result);
  });

  getStatistics = asyncHandler(async (req, res) => {
    const result = await AssignmentService.getOverallStatistics(
      req.user._id,
      req.user.role
    );
    return sendResponse(res, 200, 'Statistics retrieved successfully', result);
  });

  // ==================== EXPORT ====================

  exportAssignments = asyncHandler(async (req, res) => {
    const workbook = await AssignmentService.exportAssignments(
      req.user._id,
      req.user.role,
      req.query
    );

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=assignments_${Date.now()}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  });
}

export default new AssignmentController();