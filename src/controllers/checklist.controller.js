import checklistService from '../services/checklist.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendResponse } from '../utils/response.js';

class ChecklistController {
  
  // ==================== CHECKLIST CRUD ====================
  
  createChecklist = asyncHandler(async (req, res) => {
    const result = await checklistService.createChecklist(
      req.user._id,
      req.user.role,
      req.body
    );
    return sendResponse(res, 201, 'Checklist created successfully', result);
  });
  
  getChecklists = asyncHandler(async (req, res) => {
    const result = await checklistService.getChecklists(
      req.user._id,
      req.user.role,
      req.query
    );
    return sendResponse(res, 200, 'Checklists retrieved successfully', result);
  });
  
  getChecklistById = asyncHandler(async (req, res) => {
    const result = await checklistService.getChecklistById(req.params.id);
    return sendResponse(res, 200, 'Checklist retrieved successfully', result);
  });
  
  updateChecklist = asyncHandler(async (req, res) => {
    const result = await checklistService.updateChecklist(
      req.params.id,
      req.user._id,
      req.user.role,
      req.body
    );
    return sendResponse(res, 200, 'Checklist updated successfully', result);
  });
  
  deleteChecklist = asyncHandler(async (req, res) => {
    const result = await checklistService.deleteChecklist(
      req.params.id,
      req.user._id,
      req.user.role
    );
    return sendResponse(res, 200, 'Checklist deleted successfully', result);
  });
  
  // ==================== CLONE OPERATIONS ====================
  
  getCloneList = asyncHandler(async (req, res) => {
    const result = await checklistService.getCloneList(
      req.user._id,
      req.user.role,
      req.query
    );
    return sendResponse(res, 200, 'Clone list retrieved successfully', result);
  });
  
  cloneChecklist = asyncHandler(async (req, res) => {
    const result = await checklistService.cloneChecklist(
      req.user._id,
      req.user.role,
      req.params.id,
      req.body.newName
    );
    return sendResponse(res, 201, 'Checklist cloned successfully', result);
  });
  
  // ==================== IMPORT EXCEL ====================
  
  importFromExcel = asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new ValidationError(['No Excel file uploaded']);
    }
    
    const result = await checklistService.importFromExcel(
      req.user._id,
      req.user.role,
      req.file.path,
      req.body
    );
    return sendResponse(res, 201, 'Checklist imported successfully', result);
  });
  
  // ==================== REQUEST MANAGEMENT ====================
  
  submitRequest = asyncHandler(async (req, res) => {
    const result = await checklistService.submitRequest(
      req.user._id,
      req.user.role,
      req.body
    );
    return sendResponse(res, 201, 'Checklist request submitted successfully', result);
  });
  
  getRequests = asyncHandler(async (req, res) => {
    console.log("files1...")
    const result = await checklistService.getRequests(
      req.user._id,
      req.user.role,
      req.query
    );
    return sendResponse(res, 200, 'Requests retrieved successfully', result);
  });
  
  getRequestById = asyncHandler(async (req, res) => {
    const result = await checklistService.getRequestById(req.params.id);
    return sendResponse(res, 200, 'Request retrieved successfully', result);
  });
  
  getRequestStats = asyncHandler(async (req, res) => {
    const result = await checklistService.getRequestStats(
      req.user._id,
      req.user.role
    );
    return sendResponse(res, 200, 'Request stats retrieved successfully', result);
  });
  
  reviewRequest = asyncHandler(async (req, res) => {
    const result = await checklistService.reviewRequest(
      req.params.id,
      req.user._id,
      req.user.role,
      req.body
    );
    return sendResponse(res, 200, 'Request reviewed successfully', result);
  });
}

export default new ChecklistController();