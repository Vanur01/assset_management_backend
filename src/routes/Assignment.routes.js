import express from 'express';
import AssignmentController from '../controllers/Assignment.controller.js';
import { authenticate, allowRoles } from '../middlewares/verifyToken.js';
import { upload } from '../middlewares/upload.js';
import {
  validateCreateAdminAssignment,
  validateCreateTeamAssignment,
  validateGetAssignments,
  validateAssignmentId,
  validateUpdateAssignment,
  validateSubmitResponse,
  validateReviewAssignment
} from '../validation/assignedChecklist.validation.js';
import { handleValidation } from '../validation/validationResult.js';

const router = express.Router();
router.use(authenticate);

// ==================== STATISTICS ====================
router.get(
  '/statistics',
  AssignmentController.getStatistics
);

// ==================== EXPORT ====================
router.get(
  '/export',
  allowRoles('super_admin', 'admin'),
  AssignmentController.exportAssignments
);

// ==================== CREATE ASSIGNMENTS ====================

// Super Admin assigns to Admin
router.post(
  '/assign-to-admin',
  allowRoles('super_admin'),
  AssignmentController.assignToAdmin
);

// Admin assigns to Team Member
router.post(
  '/assign-to-team',
  allowRoles('admin'),
  AssignmentController.assignToTeam
);

// ==================== GET ASSIGNMENTS ====================
router.get(
  '/',
  allowRoles('super_admin', 'admin', 'team'),
  validateGetAssignments,
  handleValidation,
  AssignmentController.getAssignments
);

router.get(
  '/calendar',
  allowRoles('super_admin', 'admin', 'team'),
  AssignmentController.getCalendarTasks
);

router.get(
  '/my/history',
  allowRoles('team'),
  AssignmentController.getInspectionHistory
);

router.get(
  '/:id',
  allowRoles('super_admin', 'admin'),
  validateAssignmentId,
  handleValidation,
  AssignmentController.getAssignmentById
);

router.get(
  '/:id/details',
  allowRoles('super_admin', 'admin', 'team'),
  validateAssignmentId,
  handleValidation,
  AssignmentController.getAssignmentDetails
);

// ==================== UPDATE & DELETE ====================
router.patch(
  '/:id',
  allowRoles('super_admin', 'admin'),
  validateAssignmentId,
  validateUpdateAssignment,
  handleValidation,
  AssignmentController.updateAssignment
);

router.delete(
  '/:id',
  allowRoles('super_admin', 'admin'),
  validateAssignmentId,
  handleValidation,
  AssignmentController.deleteAssignment
);

// ==================== SUBMISSIONS & REVIEW ====================
router.get(
  '/checklist/:checklistId/submissions',
  allowRoles('super_admin', 'admin'),
  AssignmentController.getSubmissionsForChecklist
);

router.get(
  '/:id/submission',
  allowRoles('super_admin', 'admin', 'team'),
  validateAssignmentId,
  handleValidation,
  AssignmentController.getSubmissionDetail
);

router.patch(
  '/:id/review',
  allowRoles('super_admin', 'admin'),
  validateAssignmentId,
  validateReviewAssignment,
  handleValidation,
  AssignmentController.reviewSubmission
);

// ==================== INSPECTION ACTIONS (Team Member) ====================
router.post(
  '/:id/submit',
  allowRoles('team', 'admin'),
  upload.fields([
    { name: 'photos', maxCount: 10 },
    { name: 'signature', maxCount: 1 },
    { name: 'attachments', maxCount: 10 }
  ]),
  AssignmentController.submitInspection
);

router.post(
  '/:id/draft',
  allowRoles('team'),
  validateAssignmentId,
  handleValidation,
  AssignmentController.saveDraft
);

router.post(
  '/:id/clear',
  allowRoles('team', 'admin'),
  validateAssignmentId,
  handleValidation,
  AssignmentController.clearChecklist
);

// ==================== ASSIGNEES & ANALYTICS ====================
router.get(
  '/checklist/:checklistId/assignees',
  allowRoles('super_admin', 'admin'),
  AssignmentController.getAssignees
);

router.get(
  '/checklist/:checklistId/analytics',
  allowRoles('super_admin', 'admin'),
  AssignmentController.getChecklistAnalytics
);

export default router;