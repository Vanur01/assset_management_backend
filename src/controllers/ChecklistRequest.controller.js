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
            req.files // This should be req.files (plural) for array upload
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
        const result = await ChecklistRequestService.getRequestById(
            req.params.id,
            req.user._id,
            req.user.role
        );
        return sendResponse(res, 200, 'Request retrieved successfully', result);
    });

    reviewRequest = asyncHandler(async (req, res) => {
        const result = await ChecklistRequestService.reviewRequest(
            req.params.id,
            req.user._id,
            req.body
        );
        return sendResponse(res, 200, 'Request reviewed successfully', result);
    });

    deleteRequest = asyncHandler(async (req, res) => {
        const result = await ChecklistRequestService.deleteRequest(
            req.params.id,
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
}

export default new ChecklistRequestController();