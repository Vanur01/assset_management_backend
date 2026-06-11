// routes/assignment.routes.js

import express from 'express';
import AssignmentController from '../controllers/Assignment.controller.js';
import { authenticate, allowRoles } from '../middlewares/verifyToken.js';
import { upload } from '../middlewares/upload.js';

const router = express.Router();
router.use(authenticate);

// ═══════════════════════════════════════════════════════════════
//  ASSIGN
// ═══════════════════════════════════════════════════════════════

// Super admin assigns checklist(s) to an admin
router.post(
  '/assign-to-admin',
  allowRoles('super_admin'),
  AssignmentController.assignToAdmin
);

// Admin assigns checklist(s) + assets to team member(s)
router.post(
  '/assign-to-team',
  allowRoles('admin'),
  AssignmentController.assignToTeam
);

// ═══════════════════════════════════════════════════════════════
//  REASSIGN
// ═══════════════════════════════════════════════════════════════

router.put(
  '/:id/reassign-to-admin',
  allowRoles('super_admin'),
  AssignmentController.reassignToAdmin
);

router.put(
  '/:id/reassign-to-team',
  allowRoles('admin'),
  AssignmentController.reassignToTeam
);

// ═══════════════════════════════════════════════════════════════
//  ANALYTICS  (must come before /:id routes to avoid param clash)
// ═══════════════════════════════════════════════════════════════

// Full analytics dashboard data
router.get(
  '/analytics',
  allowRoles('super_admin', 'admin'),
  AssignmentController.getAnalytics
);

// Assignment stats summary
router.get(
  '/stats',
  allowRoles('super_admin', 'admin'),
  AssignmentController.getAssignmentStats
);

// Recent submissions across all assignments
router.get(
  '/recent-submissions',
  allowRoles('super_admin', 'admin'),
  AssignmentController.getRecentSubmissions
);

// ═══════════════════════════════════════════════════════════════
//  TEAM — MY TASKS  (must come before /:id to avoid param clash)
// ═══════════════════════════════════════════════════════════════

// Team member: list all tasks assigned to me
router.get(
  '/my-tasks',
  allowRoles('team'),
  AssignmentController.getMyTasks
);

// Team member: single task with full checklist fields
router.get(
  '/my-tasks/:id',
  allowRoles('team'),
  AssignmentController.getMyTaskById
);

// ═══════════════════════════════════════════════════════════════
//  TEAM — INSPECTION HISTORY  (own submissions)
// ═══════════════════════════════════════════════════════════════

// List all past inspections submitted by me
router.get(
  '/my-inspections',
  allowRoles('team'),
  AssignmentController.getMyInspections
);

// Single inspection detail by submission ID
router.get(
  '/my-inspections/:submissionId',
  allowRoles('team'),
  AssignmentController.getMyInspectionById
);

// ═══════════════════════════════════════════════════════════════
//  DELETED ASSIGNMENTS
// ═══════════════════════════════════════════════════════════════

router.get(
  '/deleted',
  allowRoles('super_admin', 'admin'),
  AssignmentController.getDeletedAssignments
);

// ═══════════════════════════════════════════════════════════════
//  ASSIGNMENT LIST & DETAIL
// ═══════════════════════════════════════════════════════════════

// All roles see assignments filtered by role in service
router.get(
  '/',
  allowRoles('super_admin', 'admin', 'team'),
  AssignmentController.getAssignments
);

// Any role can view a single assignment (access verified in service)
router.get(
  '/:id',
  allowRoles('super_admin', 'admin', 'team'),
  AssignmentController.getAssignmentById
);

// ═══════════════════════════════════════════════════════════════
//  SUBMIT ASSIGNMENT (team member)
//  multer handles up to 10 images per submission
// ═══════════════════════════════════════════════════════════════

router.post(
  '/:id/submit',
  allowRoles('team'),
  upload.array('images', 10),
  AssignmentController.submitAssignment
);

// ═══════════════════════════════════════════════════════════════
//  SUBMISSIONS — admin / super_admin views
// ═══════════════════════════════════════════════════════════════

// List all submissions for an assignment (with who submitted)
router.get(
  '/:id/submissions',
  allowRoles('super_admin', 'admin'),
  AssignmentController.getSubmissionsByAssignment
);

// Full detail of one submission
router.get(
  '/:id/submissions/:submissionId',
  allowRoles('super_admin', 'admin'),
  AssignmentController.getSubmissionDetail
);

// Admin reviews a submission (approve / reject / needs_revision)
router.patch(
  '/:id/submissions/:submissionId/review',
  allowRoles('super_admin', 'admin'),
  AssignmentController.reviewSubmission
);

// ═══════════════════════════════════════════════════════════════
//  DELETE & RESTORE
// ═══════════════════════════════════════════════════════════════

router.delete(
  '/:id/soft',
  allowRoles('super_admin', 'admin'),
  AssignmentController.softDeleteAssignment
);

router.delete(
  '/:id/permanent',
  allowRoles('super_admin'),
  AssignmentController.permanentDeleteAssignment
);

router.post(
  '/:id/restore',
  allowRoles('super_admin', 'admin'),
  AssignmentController.restoreAssignment
);

export default router;