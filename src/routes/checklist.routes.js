import express from 'express';
import ChecklistController from '../controllers/checklist.controller.js';
import { authenticate, allowRoles } from '../middlewares/verifyToken.js';
import { upload } from '../middlewares/upload.js';
import {
  validatePagination,
  validateCreateChecklist,
  validateUpdateChecklist,
  validateChecklistId,
  validateSubmitRequest,
  validateReviewRequest,
  validateRequestId,
  validateCloneChecklist,
  validateImportChecklist
} from '../validation/checklist.validation.js';
import { handleValidation } from '../validation/validationResult.js';

const router = express.Router();
router.use(authenticate);

// ==================== CHECKLIST CRUD ====================

// Create checklist (Admin & Super Admin)
router.post(
  '/',
  allowRoles('super_admin', 'admin'),
  validateCreateChecklist,
  handleValidation,
  ChecklistController.createChecklist
);

// Get checklists (role-based: Admin sees own, Super Admin sees all)
router.get(
  '/',
  allowRoles('super_admin', 'admin'),
  validatePagination,
  handleValidation,
  ChecklistController.getChecklists
);

// Get single checklist
router.get(
  '/:id',
  allowRoles('super_admin', 'admin'),
  validateChecklistId,
  handleValidation,
  ChecklistController.getChecklistById
);

// Update checklist
router.put(
  '/:id',
  allowRoles('super_admin', 'admin'),
  validateChecklistId,
  validateUpdateChecklist,
  handleValidation,
  ChecklistController.updateChecklist
);

// Delete checklist
router.delete(
  '/:id',
  allowRoles('super_admin', 'admin'),
  validateChecklistId,
  handleValidation,
  ChecklistController.deleteChecklist
);

// ==================== CLONE OPERATIONS ====================

// Get clone list (checklists available for cloning)
router.get(
  '/clone/list',
  allowRoles('super_admin', 'admin'),
  validatePagination,
  handleValidation,
  ChecklistController.getCloneList
);

// Clone checklist
router.post(
  '/clone/:id',
  allowRoles('super_admin', 'admin'),
  validateChecklistId,
  validateCloneChecklist,
  handleValidation,
  ChecklistController.cloneChecklist
);

// ==================== IMPORT EXCEL ====================

// Import checklist from Excel
router.post(
  '/import-excel',
  allowRoles('super_admin', 'admin'),
  upload.single('excelFile'),
  ChecklistController.importFromExcel
);

// ==================== REQUEST MANAGEMENT ====================

// Submit checklist request (Admin only)
router.post(
  '/requests',
  allowRoles('admin'),
  validateSubmitRequest,
  handleValidation,
  ChecklistController.submitRequest
);

// Get requests (role-based: Admin sees own, Super Admin sees all)
router.get(
  '/requests/list',
  allowRoles('super_admin', 'admin'),
  ChecklistController.getRequests
);

// Get request stats
router.get(
  '/requests/stats',
  allowRoles('super_admin', 'admin'),
  ChecklistController.getRequestStats
);

// Get single request
router.get(
  '/requests/:id',
  allowRoles('super_admin', 'admin'),
  validateRequestId,
  handleValidation,
  ChecklistController.getRequestById
);

// Review request (Super Admin only)
router.patch(
  '/requests/:id/review',
  allowRoles('super_admin'),
  validateRequestId,
  validateReviewRequest,
  handleValidation,
  ChecklistController.reviewRequest
);

export default router;