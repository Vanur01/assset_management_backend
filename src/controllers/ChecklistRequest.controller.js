// controllers/ChecklistRequest.controller.js
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
            req.files || []
        );
        
        return sendResponse(res, 201, 'Checklist request submitted successfully', result);
    });

    getRequests = asyncHandler(async (req, res) => {
        const result = await ChecklistRequestService.getRequests(
            req.user._id,
            req.user.role,
            req.query
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
            req.user.role
        );
        
        return sendResponse(res, 200, 'Request retrieved successfully', result);
    });

    reviewRequest = asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { status, rejectionReason, resultingChecklistId, resultingChecklistName } = req.body;
        
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
                resultingChecklistName
            }
        );
        
        return sendResponse(res, 200, 'Request reviewed successfully', result);
    });

    deleteRequest = asyncHandler(async (req, res) => {
        const { id } = req.params;
        
        if (!id || id === 'undefined') {
            return sendResponse(res, 400, 'Invalid request ID', null);
        }
        
        const result = await ChecklistRequestService.deleteRequest(
            id,
            req.user._id,
            req.user.role
        );
        
        return sendResponse(res, 200, result.message, null);
    });

    getRequestStatistics = asyncHandler(async (req, res) => {
        const result = await ChecklistRequestService.getRequestStatistics(
            req.user._id,
            req.user.role
        );
        
        return sendResponse(res, 200, 'Statistics retrieved successfully', result);
    });


    getMyRequests = asyncHandler(async (req, res) => {
        // Helper method for users to see only their own requests
        const result = await ChecklistRequestService.getRequests(
            req.user._id,
            'user', // Force user role to only see their own
            req.query
        );
        
        return sendResponse(res, 200, 'Your requests retrieved successfully', result);
    });


}

export default new ChecklistRequestController();