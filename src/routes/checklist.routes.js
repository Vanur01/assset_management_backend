import express from 'express';
import ChecklistController from '../controllers/checklist.controller.js';
import { authenticate, allowRoles } from '../middlewares/verifyToken.js';
import { upload } from '../middlewares/upload.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// ── Import ────────────────────────────────────────────────────────────────────
router.post(
  '/import-excel',
  allowRoles('super_admin', 'admin'),
  upload.single('excelFile'),
  ChecklistController.importFromExcel
);

router.get(
  '/cloneable',
  allowRoles('super_admin', 'admin'),
  ChecklistController.getCloneableChecklists
);

router.get(
  '/types/summary',
  allowRoles('super_admin', 'admin'),
  ChecklistController.getChecklistTypesSummary
);

router.get(
  '/deleted/list',
  allowRoles('super_admin', 'admin'),
  ChecklistController.getDeletedChecklists
);

// ── CRUD ──────────────────────────────────────────────────────────────────────
router.post(
  '/',
  allowRoles('super_admin', 'admin'),
  ChecklistController.createChecklist
);

router.get(
  '/',
  allowRoles('super_admin', 'admin'),
  ChecklistController.getChecklists
);

router.get(
  '/:id',
  allowRoles('super_admin', 'admin'),
  ChecklistController.getChecklistById
);

router.delete(
  '/:id',
  allowRoles('super_admin', 'admin'),
  ChecklistController.deleteChecklist
);

// ── Restore / permanent delete ────────────────────────────────────────────────
router.patch(
  '/:id/restore',
  allowRoles('super_admin', 'admin'),
  ChecklistController.restoreChecklist
);

router.delete(
  '/:id/permanent',
  allowRoles('super_admin', 'admin'),
  ChecklistController.permanentDeleteChecklist
);

// ── Clone ─────────────────────────────────────────────────────────────────────
router.post(
  '/:id/clone',
  allowRoles('super_admin', 'admin'),
  ChecklistController.cloneChecklist
);

export default router;