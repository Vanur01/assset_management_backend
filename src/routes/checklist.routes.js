import express from 'express';
import ChecklistController from '../controllers/checklist.controller.js';
import { authenticate, allowRoles } from '../middlewares/verifyToken.js';
import { upload } from '../middlewares/upload.js';

const router = express.Router();
router.use(authenticate);

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTANT: Static/named routes MUST be defined BEFORE parameterised /:id
// routes, otherwise Express will swallow "clone", "import-excel", "requests",
// "submissions" as values for the :id parameter.
// ─────────────────────────────────────────────────────────────────────────────

// ==================== IMPORT EXCEL ====================
// POST /checklists/import-excel
router.post(
  '/import-excel',
  allowRoles('super_admin', 'admin'),
  upload.single('excelFile'),
  ChecklistController.importFromExcel
);

// ==================== CLONE LIST ====================
// GET /checklists/clone/list
router.get(
  '/clone/list',
  allowRoles('super_admin', 'admin'),
  ChecklistController.getCloneList
);

// ==================== REQUEST MANAGEMENT ====================
// Must come before /:id to prevent "requests" being matched as an id

// POST /checklists/requests
router.post(
  '/requests',
  allowRoles('admin'),
  ChecklistController.submitRequest
);

// GET /checklists/requests/list
router.get(
  '/requests/list',
  allowRoles('super_admin', 'admin'),
  ChecklistController.getRequests
);

// GET /checklists/requests/stats
router.get(
  '/requests/stats',
  allowRoles('super_admin', 'admin'),
  ChecklistController.getRequestStats
);

// GET /checklists/requests/:id
router.get(
  '/requests/:id',
  allowRoles('super_admin', 'admin'),
  ChecklistController.getRequestById
);

// PATCH /checklists/requests/:id/review
router.patch(
  '/requests/:id/review',
  allowRoles('super_admin'),
  ChecklistController.reviewRequest
);

// ==================== SUBMISSION – non-parameterised ====================
// GET /checklists/submissions/:submissionId
// (single submission lookup; no checklist :id required)
router.get(
  '/submissions/:submissionId',
  allowRoles('super_admin', 'admin'),
  ChecklistController.getSubmissionById
);

// ==================== CHECKLIST CRUD ====================
// POST /checklists
router.post(
  '/',
  allowRoles('super_admin', 'admin'),
  ChecklistController.createChecklist
);

// GET /checklists
router.get(
  '/',
  allowRoles('super_admin', 'admin'),
  ChecklistController.getChecklists
);

// GET /checklists/:id
router.get(
  '/:id',
  allowRoles('super_admin', 'admin'),
  ChecklistController.getChecklistById
);

// DELETE /checklists/:id
router.delete(
  '/:id',
  allowRoles('super_admin', 'admin'),
  ChecklistController.deleteChecklist
);

// ==================== CLONE ====================
// POST /checklists/clone/:id
router.post(
  '/clone/:id',
  allowRoles('super_admin', 'admin'),
  ChecklistController.cloneChecklist
);

// ==================== SUBMISSIONS (checklist-scoped) ====================
// POST /checklists/:id/submit
router.post(
  '/:id/submit',
  allowRoles('super_admin', 'admin', 'user'),
  ChecklistController.submitResponse
);

// GET /checklists/:id/submissions
router.get(
  '/:id/submissions',
  allowRoles('super_admin', 'admin'),
  ChecklistController.getSubmissions
);

export default router;