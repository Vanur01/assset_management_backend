import AssetRequestService from '../services/assetRequest.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendResponse } from '../utils/response.js';

class AssetRequestController {
    getRequests = asyncHandler(async (req, res) => {
        const { user, query } = req;
        const adminId = user.role === 'admin' ? user._id : user.adminId;
        const result = await AssetRequestService.getRequests(query, user._id, user.role, adminId, req);
        return sendResponse(res, 200, 'Requests fetched successfully', result);
    });

    getRequestById = asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { user } = req;
        const adminId = user.role === 'admin' ? user._id : user.adminId;
        const request = await AssetRequestService.getRequestById(id, user._id, user.role, adminId, req);
        return sendResponse(res, 200, 'Request fetched successfully', request);
    });

    getRequestTree = asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { user } = req;
        const adminId = user.role === 'admin' ? user._id : user.adminId;
        const tree = await AssetRequestService.getRequestTree(id, user._id, user.role, adminId, req);
        return sendResponse(res, 200, 'Request tree fetched successfully', tree);
    });

    getRequestsByAsset = asyncHandler(async (req, res) => {
        const { assetId } = req.params;
        const { user, query } = req;
        const adminId = user.role === 'admin' ? user._id : user.adminId;
        const result = await AssetRequestService.getRequestsByAsset(assetId, query.status, user._id, user.role, adminId, req);
        return sendResponse(res, 200, 'Requests fetched successfully', result);
    });

    getRequestStats = asyncHandler(async (req, res) => {
        const { user } = req;
        if (user.role !== 'admin') return sendResponse(res, 403, 'Only admins can view stats', null);
        const stats = await AssetRequestService.getStats(user._id, req);
        return sendResponse(res, 200, 'Stats fetched successfully', stats);
    });

    createParentRequest = asyncHandler(async (req, res) => {
        const { user, body } = req;
        const adminId = user.role === 'admin' ? user._id : user.adminId;
        const request = await AssetRequestService.createParentRequest(body, user._id, user.role, adminId, req);
        return sendResponse(res, 201, 'Request created successfully', request);
    });

    createChildRequest = asyncHandler(async (req, res) => {
        const { parentId } = req.params;
        const { user, body } = req;
        const adminId = user.role === 'admin' ? user._id : user.adminId;
        const childRequest = await AssetRequestService.createChildRequest(parentId, body, user._id, user.role, adminId, req);
        return sendResponse(res, 201, 'Child request created successfully', childRequest);
    });

    linkChildAsset = asyncHandler(async (req, res) => {
        const { requestId } = req.params;
        const { user, body } = req;
        const adminId = user.role === 'admin' ? user._id : user.adminId;
        const updatedRequest = await AssetRequestService.linkChildAsset(requestId, body.childAssetId, body.relationshipType, user._id, user.role, adminId, req);
        return sendResponse(res, 200, 'Child asset linked successfully', updatedRequest);
    });

    approveRequest = asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { user, body } = req;
        if (user.role !== 'admin') return sendResponse(res, 403, 'Only admins can approve requests', null);
        const request = await AssetRequestService.approveRequest(id, user._id, body.approvalNotes, req);
        return sendResponse(res, 200, 'Request approved successfully', request);
    });

    rejectRequest = asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { user, body } = req;
        if (user.role !== 'admin') return sendResponse(res, 403, 'Only admins can reject requests', null);
        if (!body.reason) return sendResponse(res, 400, 'Rejection reason required', null);
        const request = await AssetRequestService.rejectRequest(id, body.reason, user._id, req);
        return sendResponse(res, 200, 'Request rejected successfully', request);
    });

    completeRequest = asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { user, body } = req;
        const adminId = user.role === 'admin' ? user._id : user.adminId;
        const request = await AssetRequestService.completeRequest(id, body.completionNotes, user._id, user.role, adminId, req);
        return sendResponse(res, 200, 'Request completed successfully', request);
    });

    updateChildStatus = asyncHandler(async (req, res) => {
        const { parentId, childId } = req.params;
        const { user, body } = req;
        const adminId = user.role === 'admin' ? user._id : user.adminId;
        const result = await AssetRequestService.updateChildStatus(parentId, childId, body.status, body.updates, user._id, user.role, adminId, req);
        return sendResponse(res, 200, 'Child status updated successfully', result);
    });
}

export default new AssetRequestController();