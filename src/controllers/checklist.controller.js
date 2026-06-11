import { sendResponse } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import ChecklistService from '../services/checklist.service.js';
import { BadRequestError } from '../errors/customError.js';

class ChecklistController {
  // ==================== CREATE ====================
  createChecklist = asyncHandler(async (req, res) => {
    const checklist = await ChecklistService.createChecklist(req.body, req.user, req);
    return sendResponse(res, 201, 'Checklist created successfully', checklist);
  });

  // ==================== GET ALL ====================
  getChecklists = asyncHandler(async (req, res) => {
    const result = await ChecklistService.getChecklists(req.query, req.user, req);
    return sendResponse(res, 200, 'Checklists retrieved successfully', result);
  });

  // ==================== GET BY ID ====================
  getChecklistById = asyncHandler(async (req, res) => {
    const checklist = await ChecklistService.getChecklistById(req.params.id, req.user, req);
    return sendResponse(res, 200, 'Checklist retrieved successfully', checklist);
  });

  // ==================== UPDATE ====================
  updateChecklist = asyncHandler(async (req, res) => {
    const checklist = await ChecklistService.updateChecklist(req.params.id, req.body, req.user, req);
    return sendResponse(res, 200, 'Checklist updated successfully', checklist);
  });

  // ==================== SOFT DELETE ====================
  deleteChecklist = asyncHandler(async (req, res) => {
    const checklist = await ChecklistService.deleteChecklist(req.params.id, req.user, req);
    return sendResponse(res, 200, 'Checklist deleted successfully', checklist);
  });

  // ==================== RESTORE ====================
  restoreChecklist = asyncHandler(async (req, res) => {
    const checklist = await ChecklistService.restoreChecklist(req.params.id, req.user, req);
    return sendResponse(res, 200, 'Checklist restored successfully', checklist);
  });

  // ==================== GET DELETED ====================
  getDeletedChecklists = asyncHandler(async (req, res) => {
    const result = await ChecklistService.getDeletedChecklists(req.query, req.user, req);
    return sendResponse(res, 200, 'Deleted checklists retrieved successfully', result);
  });

  // ==================== PERMANENT DELETE ====================
  permanentDeleteChecklist = asyncHandler(async (req, res) => {
    const checklist = await ChecklistService.permanentDeleteChecklist(
      req.params.id,
      req.user,
      req
    );
    return sendResponse(res, 200, 'Checklist permanently deleted successfully', checklist);
  });

  // ==================== CLONE ====================
  cloneChecklist = asyncHandler(async (req, res) => {
    const result = await ChecklistService.cloneChecklist(
      req.params.id,
      req.body,
      req.user,
      req
    );
    return sendResponse(res, 201, 'Checklist cloned successfully', result);
  });

  // ==================== GET CLONEABLE ====================
  getCloneableChecklists = asyncHandler(async (req, res) => {
    const result = await ChecklistService.getCloneableChecklists(req.query, req.user, req);
    return sendResponse(res, 200, 'Cloneable checklists retrieved successfully', result);
  });

  // ==================== TYPES SUMMARY ====================
  getChecklistTypesSummary = asyncHandler(async (req, res) => {
    const summary = await ChecklistService.getChecklistTypesSummary(req.user, req);
    return sendResponse(res, 200, 'Checklist types summary retrieved successfully', summary);
  });

  // ==================== IMPORT FROM EXCEL ====================
  importFromExcel = asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new BadRequestError('Please upload an Excel file');
    }

    const {
      checklistType = 'import',
      isGlobal = 'false',
    } = req.body;

    // Get the full file path from multer
    const filePath = req.file.path;

    const result = await ChecklistService.importFromExcel(
      filePath,
      req.user,
      {
        checklistType,
        isGlobal: isGlobal === 'true',
        fileName: req.file.originalname,
      },
      req
    );

    try {
      fs.unlinkSync(filePath);
    } catch (unlinkError) {
      console.error('Failed to delete temporary file:', unlinkError);
    }

    return sendResponse(res, 200, `${result.imported} checklist(s) imported successfully`, result);
  });
}

export default new ChecklistController();