import assetRequestService from '../services/Assetrequest.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendResponse } from '../utils/response.js';
import { ValidationError } from '../errors/customError.js';

const resolveUserModel = (userRole) => {
  return userRole === 'admin' ? 'Client' : 'Team';
};

const getAdminId = (req) => {
  const { userRole, user, adminId } = req;
  if (userRole === 'admin') return user._id;
  if (userRole === 'team') return adminId;
  return req.query.adminId;
};

class AssetRequestController {

  getAssetRequestStats = asyncHandler(async (req, res) => {
    const { userRole, user } = req;
    const adminId = getAdminId(req);

    const stats = await assetRequestService.getRequestStats(adminId, user._id, userRole);
    return sendResponse(res, 200, 'Request stats fetched successfully', stats);
  });

  getAllAssetRequests = asyncHandler(async (req, res) => {
    const adminId = getAdminId(req);
    const result = await assetRequestService.getAllRequests(adminId, req.query);
    return sendResponse(res, 200, 'Asset requests fetched successfully', result);
  });

  getParentAssetRequests = asyncHandler(async (req, res) => {
    const adminId = getAdminId(req);
    const result = await assetRequestService.getParentAssetRequests(adminId, req.query);
    return sendResponse(res, 200, 'Parent asset requests fetched successfully', result);
  });

  getChildAssetRequests = asyncHandler(async (req, res) => {
    const adminId = getAdminId(req);
    const result = await assetRequestService.getChildAssetRequests(adminId, req.query);
    return sendResponse(res, 200, 'Child asset requests fetched successfully', result);
  });

  getAssetRequestById = asyncHandler(async (req, res) => {
    const request = await assetRequestService.getRequestById(req.params.id);
    return sendResponse(res, 200, 'Asset request fetched successfully', { request });
  });

  getMyAssetRequests = asyncHandler(async (req, res) => {
    const result = await assetRequestService.getMyRequests(req.user._id, req.query);
    return sendResponse(res, 200, 'Your asset requests fetched successfully', result);
  });

  createAssetRequest = asyncHandler(async (req, res) => {
    const { userRole, user, adminId } = req;

    if (!req.body.requestType) {
      throw new ValidationError('Request type is required');
    }

    const request = await assetRequestService.createAssetRequest(
      req.body, user._id, userRole, adminId
    );

    return sendResponse(res, 201, 'Asset request created successfully', request);
  });

  approveAssetRequest = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { user } = req;
    const { notes, assignedTo, createdAssetId } = req.body;

    const result = await assetRequestService.approveAssetRequest(
      id,
      user._id,
      { notes, assignedTo, createdAssetId }
    );

    return sendResponse(res, 200, 'Asset request approved successfully', result);
  });

  rejectAssetRequest = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { user } = req;
    const { reason, notes } = req.body;

    if (!reason && !notes) {
      throw new ValidationError('Rejection reason or notes is required');
    }

    const result = await assetRequestService.rejectAssetRequest(
      id,
      user._id,
      { reason, notes }
    );

    return sendResponse(res, 200, 'Asset request rejected successfully', result);
  });

  deleteAssetRequest = asyncHandler(async (req, res) => {
    const { userRole, user } = req;
    const { id } = req.params;
    const { cascadeDelete, force } = req.query; // Query params for options

    const result = await assetRequestService.deleteAssetRequest(
      id,
      user._id,
      userRole,
      {
        cascadeDelete: cascadeDelete === 'true',
        force: force === 'true'
      }
    );
    return sendResponse(res, 200, 'Asset request deleted successfully', result);
  });

}

export default new AssetRequestController();