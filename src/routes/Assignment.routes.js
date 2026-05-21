import express from 'express';
import AssignmentController from '../controllers/Assignment.controller.js';
import { authenticate, allowRoles } from '../middlewares/verifyToken.js';
import { upload } from '../middlewares/upload.js';

const router = express.Router();
router.use(authenticate);

// ==================== STATISTICS & DASHBOARD ====================
router.get(
  '/statistics',
  allowRoles('super_admin', 'admin', 'team'),
  AssignmentController.getStatistics
);

// ==================== EXPORT & DOWNLOAD ====================
router.get(
  '/export',
  allowRoles('super_admin', 'admin'),
  AssignmentController.exportAssignments
);

// ==================== CALENDAR ====================
router.get(
  '/calendar',
  allowRoles('super_admin', 'admin', 'team'),
  AssignmentController.getCalendarTasks
);

// ==================== INSPECTION HISTORY (SPECIFIC PATH - MUST BE BEFORE /:id) ====================
router.get(
  '/history',
  allowRoles('super_admin', 'admin', 'team'),
  AssignmentController.getInspectionHistory
);

// ==================== SUBMISSION MANAGEMENT ====================
router.get(
  '/submissions/:id',
  allowRoles('super_admin', 'admin', 'team'),
  AssignmentController.getSubmissionDetail
);

router.delete(
  '/:id/submission',
  allowRoles('super_admin', 'admin'),
  AssignmentController.deleteSubmission
);


// ==================== CREATE ASSIGNMENTS ====================
router.post(
  '/assign-to-admin',
  allowRoles('super_admin'),
  AssignmentController.assignToAdmin
);

router.post(
  '/assign-to-team',
  allowRoles('admin'),
  AssignmentController.assignToTeam
);

// ==================== CHECKLIST-SCOPED ROUTES ====================
router.get(
  '/checklist/:checklistId/submissions',
  allowRoles('super_admin', 'admin'),
  AssignmentController.getSubmissionsForChecklist
);

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

// ==================== LIST ALL ASSIGNMENTS ====================
router.get(
  '/',
  allowRoles('super_admin', 'admin', 'team'),
  AssignmentController.getAssignments
);

// ==================== PARAMETERIZED ROUTES (MUST BE LAST) ====================
// Single assignment by ID - these must come AFTER all specific routes
router.get(
  '/:id',
  allowRoles('super_admin', 'admin', 'team'),
  AssignmentController.getAssignmentById
);

router.get(
  '/:id/details',
  allowRoles('super_admin', 'admin', 'team'),
  AssignmentController.getAssignmentDetails
);

router.patch(
  '/:id',
  allowRoles('super_admin', 'admin'),
  AssignmentController.updateAssignment
);

router.delete(
  '/:id',
  allowRoles('super_admin', 'admin'),
  AssignmentController.deleteAssignment
);

router.post(
  '/:id/clear',
  allowRoles('team', 'admin', 'super_admin'),
  AssignmentController.clearChecklist
);

router.patch(
  '/:id/review',
  allowRoles('super_admin', 'admin'),
  AssignmentController.reviewSubmission
);

// ==================== INSPECTION ACTIONS ====================
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
  AssignmentController.saveDraft
);

// Debug: Log all registered routes
console.log('Assignment Routes Registered:');
router.stack.forEach((layer) => {
  if (layer.route) {
    console.log(`${Object.keys(layer.route.methods).join(',')} ${layer.route.path}`);
  }
});

export default router;