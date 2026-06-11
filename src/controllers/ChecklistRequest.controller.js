import ChecklistRequestService from '../services/ChecklistRequest.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendResponse } from '../utils/response.js';

class ChecklistRequestController {
    createRequest = asyncHandler(async (req, res) => {
        console.log("Request body:", req.body);
        console.log("User ID:", req.user._id);
        console.log("Files uploaded:", req.files?.length || 0);

        const result = await ChecklistRequestService.createRequest(
            req.user._id,
            req.body,
            req.files || [],
            req
        );

        return sendResponse(res, 201, 'Checklist request submitted successfully', result);
    });

    getRequests = asyncHandler(async (req, res) => {
        const result = await ChecklistRequestService.getRequests(
            req.user._id,
            req.user.role,
            req.query,
            req
        );

        return sendResponse(res, 200, 'Requests retrieved successfully', result);
    });

    getRequest = asyncHandler(async (req, res) => {
        const { id } = req.params;

        if (!id || id === 'undefined') {
            return sendResponse(res, 400, 'Invalid request ID', null);
        }

        const result = await ChecklistRequestService.getRequestById(
            id,
            req.user._id,
            req.user.role,
            req
        );

        return sendResponse(res, 200, 'Request retrieved successfully', result);
    });

    reviewRequest = asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { status, rejectionReason, resultingChecklistId, resultingChecklistName, comments } = req.body;

        if (!id || id === 'undefined') {
            return sendResponse(res, 400, 'Invalid request ID', null);
        }

        const result = await ChecklistRequestService.reviewRequest(
            id,
            req.user._id,
            {
                status,
                rejectionReason,
                resultingChecklistId,
                resultingChecklistName,
                comments
            },
            req
        );

        return sendResponse(res, 200, 'Request reviewed successfully', result);
    });

    // ==================== SOFT DELETE ====================
    softDeleteRequest = asyncHandler(async (req, res) => {
        const { id } = req.params;

        if (!id || id === 'undefined') {
            return sendResponse(res, 400, 'Invalid request ID', null);
        }

        const result = await ChecklistRequestService.softDeleteRequest(
            id,
            req.user._id,
            req.user.role,
            req
        );

        return sendResponse(res, 200, result.message, result.request);
    });

    // ==================== RESTORE ====================
    restoreRequest = asyncHandler(async (req, res) => {
        const { id } = req.params;

        if (!id || id === 'undefined') {
            return sendResponse(res, 400, 'Invalid request ID', null);
        }

        const result = await ChecklistRequestService.restoreRequest(
            id,
            req.user._id,
            req.user.role,
            req
        );

        return sendResponse(res, 200, result.message, result.request);
    });

    // ==================== BULK RESTORE ====================
    bulkRestoreRequests = asyncHandler(async (req, res) => {
        const { requestIds } = req.body;

        if (!requestIds || !Array.isArray(requestIds) || requestIds.length === 0) {
            return sendResponse(res, 400, 'Valid request IDs array is required', null);
        }

        const result = await ChecklistRequestService.bulkRestoreRequests(
            requestIds,
            req.user._id,
            req.user.role,
            req
        );

        const message = `Successfully restored ${result.successful.length} out of ${result.successful.length + result.failed.length} requests`;
        return sendResponse(res, 200, message, result);
    });

    // ==================== PERMANENT DELETE ====================
    permanentDeleteRequest = asyncHandler(async (req, res) => {
        const { id } = req.params;

        if (!id || id === 'undefined') {
            return sendResponse(res, 400, 'Invalid request ID', null);
        }

        const result = await ChecklistRequestService.permanentDeleteRequest(
            id,
            req.user._id,
            req.user.role,
            req
        );

        return sendResponse(res, 200, result.message, result.deletedRequest);
    });

    // ==================== BULK PERMANENT DELETE ====================
    bulkPermanentDeleteRequests = asyncHandler(async (req, res) => {
        const { requestIds } = req.body;

        if (!requestIds || !Array.isArray(requestIds) || requestIds.length === 0) {
            return sendResponse(res, 400, 'Valid request IDs array is required', null);
        }

        const result = await ChecklistRequestService.bulkPermanentDeleteRequests(
            requestIds,
            req.user._id,
            req.user.role,
            req
        );

        const message = `Successfully permanently deleted ${result.successful.length} out of ${result.successful.length + result.failed.length} requests`;
        return sendResponse(res, 200, message, result);
    });

    // ==================== GET DELETED REQUESTS (RECYCLE BIN) ====================
    getDeletedRequests = asyncHandler(async (req, res) => {
        const result = await ChecklistRequestService.getDeletedRequests(
            req.user._id,
            req.user.role,
            req.query,
            req
        );

        return sendResponse(res, 200, 'Deleted requests retrieved successfully from recycle bin', result);
    });

    // ==================== GET REQUEST STATISTICS ====================
    getRequestStatistics = asyncHandler(async (req, res) => {
        const result = await ChecklistRequestService.getRequestStatistics(
            req.user._id,
            req.user.role,
            req
        );

        return sendResponse(res, 200, 'Statistics retrieved successfully', result);
    });

    // ==================== GET MY REQUESTS (FOR TEAM MEMBERS) ====================
    getMyRequests = asyncHandler(async (req, res) => {
        const result = await ChecklistRequestService.getRequests(
            req.user._id,
            'user',
            req.query,
            req
        );

        return sendResponse(res, 200, 'Your requests retrieved successfully', result);
    });

    // ==================== GET RECYCLE BIN STATISTICS ====================
    getRecycleBinStatistics = asyncHandler(async (req, res) => {
        // Only admin and super_admin can access
        if (req.user.role !== 'super_admin' && req.user.role !== 'admin') {
            return sendResponse(res, 403, 'Access denied. Only admin and super admin can view recycle bin statistics', null);
        }

        const stats = await ChecklistRequestService.getRecycleBinStatistics(req.user._id, req.user.role, req);
        
        return sendResponse(res, 200, 'Recycle bin statistics retrieved successfully', stats);
    });

    // ==================== EMPTY RECYCLE BIN ====================
    emptyRecycleBin = asyncHandler(async (req, res) => {
        // Only super_admin can empty entire recycle bin
        if (req.user.role !== 'super_admin') {
            return sendResponse(res, 403, 'Access denied. Only super admin can empty the recycle bin', null);
        }

        const result = await ChecklistRequestService.emptyRecycleBin(req.user._id, req.user.role, req);
        
        return sendResponse(res, 200, result.message, result);
    });

    // ==================== GET DELETED REQUEST BY ID ====================
    getDeletedRequestById = asyncHandler(async (req, res) => {
        const { id } = req.params;

        if (!id || id === 'undefined') {
            return sendResponse(res, 400, 'Invalid request ID', null);
        }

        // Only admin and super_admin can view deleted requests
        if (req.user.role !== 'super_admin' && req.user.role !== 'admin') {
            return sendResponse(res, 403, 'Access denied. Only admin and super admin can view deleted requests', null);
        }

        const result = await ChecklistRequestService.getDeletedRequestById(
            id,
            req.user._id,
            req.user.role,
            req
        );

        return sendResponse(res, 200, 'Deleted request retrieved successfully', result);
    });
}

export default new ChecklistRequestController();