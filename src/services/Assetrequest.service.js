import AssetRequest from '../models/AssetRequest.model.js';
import Asset from '../models/asset.model.js';
import { NotFoundError, ValidationError } from '../errors/customError.js';
import mongoose from 'mongoose';

class AssetRequestService {

  toObjectId(id) {
    if (!id) return null;
    if (id instanceof mongoose.Types.ObjectId) return id;
    if (typeof id === 'string' && mongoose.Types.ObjectId.isValid(id)) {
      return new mongoose.Types.ObjectId(id);
    }
    return null;
  }

  async getRequestStats(adminId, userId, userRole) {
    const matchStage = userRole === 'team'
      ? { requestedBy: this.toObjectId(userId) }
      : { adminId: this.toObjectId(adminId) };

    const [aggrResult, recentRequests, pendingCount] = await Promise.all([
      AssetRequest.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: { status: '$status', requestType: '$requestType' },
            count: { $sum: 1 }
          }
        }
      ]),
      AssetRequest.find(matchStage)
        .sort('-createdAt')
        .limit(5)
        .select('requestType assetName status priority requestedAt requestedByName')
        .populate('requestedBy', 'firstName lastName avatarUrl')
        .populate('parentAssetId', 'assetName assetId')
        .lean(),
      AssetRequest.countDocuments({ ...matchStage, status: 'pending' })
    ]);

    const counts = {
      pending: { total: 0, parent: 0, child: 0 },
      approved: { total: 0, parent: 0, child: 0 },
      rejected: { total: 0, parent: 0, child: 0 }
    };

    aggrResult.forEach(({ _id: { status, requestType }, count }) => {
      const type = requestType === 'parent' ? 'parent' : 'child';
      if (counts[status]) {
        counts[status][type] += count;
        counts[status].total += count;
      }
    });

    let priorityBreakdown = [];
    try {
      priorityBreakdown = await AssetRequest.aggregate([
        { $match: { adminId: this.toObjectId(adminId), status: 'pending' } },
        { $group: { _id: '$priority', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]);
    } catch (error) {
      priorityBreakdown = [];
    }

    return { counts, recentRequests, pendingCount, priorityBreakdown };
  }

  async getAllRequests(adminId, filters = {}) {
    const {
      status, requestType, priority,
      search, fromDate, toDate,
      page = 1, limit = 20,
      sortBy = 'createdAt', sortOrder = 'desc'
    } = filters;

    const query = { adminId: this.toObjectId(adminId) };

    if (status) query.status = status;
    if (requestType) query.requestType = requestType;
    if (priority) query.priority = priority;

    if (fromDate || toDate) {
      query.createdAt = {};
      if (fromDate) query.createdAt.$gte = new Date(fromDate);
      if (toDate) query.createdAt.$lte = new Date(toDate);
    }

    if (search) {
      query.$or = [
        { assetName: { $regex: search, $options: 'i' } },
        { requestedByName: { $regex: search, $options: 'i' } },
        { parentAssetName: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOptions = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const [requests, total] = await Promise.all([
      AssetRequest.find(query)
        .populate('requestedBy', 'firstName lastName email avatarUrl')
        .populate('parentAssetId', 'assetName assetId assetCategory tagNumber status currentLocation')
        .populate('assignedTo', 'firstName lastName email')
        .populate('approvedBy', 'firstName lastName')
        .populate('rejectedBy', 'firstName lastName')
        .populate('createdAssetId', 'assetName assetId tagNumber status')
        .select('-__v')
        .sort(sortOptions)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      AssetRequest.countDocuments(query)
    ]);

    return {
      requests,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
        hasNextPage: parseInt(page) < Math.ceil(total / parseInt(limit)),
        hasPrevPage: parseInt(page) > 1
      }
    };
  }

  async getParentAssetRequests(adminId, filters = {}) {
    return this.getAllRequests(adminId, { ...filters, requestType: 'parent' });
  }

  async getChildAssetRequests(adminId, filters = {}) {
    return this.getAllRequests(adminId, { ...filters, requestType: 'child' });
  }

  async getRequestById(requestId) {
    const request = await AssetRequest.findById(requestId)
      .populate('requestedBy', 'firstName lastName email avatarUrl role')
      .populate('parentAssetId', 'assetName assetId assetCategory tagNumber status currentLocation')
      .populate('assignedTo', 'firstName lastName email')
      .populate('approvedBy', 'firstName lastName email')
      .populate('rejectedBy', 'firstName lastName email')
      .populate('createdAssetId', 'assetName assetId tagNumber status')
      .lean();

    if (!request) {
      throw new NotFoundError('Asset request not found');
    }

    return request;
  }

  async getMyRequests(userId, filters = {}) {
    const {
      status, requestType,
      page = 1, limit = 20,
      sortBy = 'createdAt', sortOrder = 'desc'
    } = filters;

    const query = { requestedBy: this.toObjectId(userId) };

    if (status) query.status = status;
    if (requestType) query.requestType = requestType;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOptions = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const [requests, total] = await Promise.all([
      AssetRequest.find(query)
        .populate('parentAssetId', 'assetName assetId assetCategory tagNumber')
        .populate('assignedTo', 'firstName lastName email')
        .populate('createdAssetId', 'assetName assetId tagNumber status')
        .select('-requestedByDetails -approvedByDetails -rejectedByDetails')
        .sort(sortOptions)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      AssetRequest.countDocuments(query)
    ]);

    return {
      requests,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
        hasNextPage: parseInt(page) < Math.ceil(total / parseInt(limit)),
        hasPrevPage: parseInt(page) > 1
      }
    };
  }

  async createAssetRequest(requestData, userId, userRole, adminId) {
    const requiredFields = ['assetName', 'category', 'location'];
    for (const field of requiredFields) {
      if (!requestData[field]) {
        throw new ValidationError(`${field} is required`);
      }
    }

    if (requestData.requestType === 'child' && !requestData.parentAssetId) {
      throw new ValidationError('Parent asset ID is required for child asset requests');
    }

    const request = new AssetRequest({
      ...requestData,
      requestedBy: userId,
      requestedByRole: userRole,
      adminId: adminId,
      status: 'pending',
      requestedAt: new Date()
    });

    await request.save();

    return await AssetRequest.findById(request._id)
      .populate('requestedBy', 'firstName lastName email')
      .populate('parentAssetId', 'assetName assetId tagNumber')
      .lean();
  }

  async approveAssetRequest(requestId, adminId, approvalData = {}) {
    const request = await AssetRequest.findById(requestId);

    if (!request) {
      throw new NotFoundError('Asset request not found');
    }

    if (request.status !== 'pending') {
      throw new ValidationError(`Cannot approve request that is already ${request.status}`);
    }

    // Update request status
    request.status = 'approved';
    request.approvedBy = adminId;
    request.approvedAt = new Date();

    if (approvalData.notes) {
      request.approvalNotes = approvalData.notes;
    }

    if (approvalData.assignedTo) {
      request.assignedTo = approvalData.assignedTo;
    }

    if (approvalData.createdAssetId) {
      request.createdAssetId = approvalData.createdAssetId;
    }

    await request.save();

    // If this is a child asset request and a new asset was created, update the parent relationship
    if (request.requestType === 'child' && approvalData.createdAssetId) {
      try {
        const newAsset = await Asset.findById(approvalData.createdAssetId);
        if (newAsset && request.parentAssetId) {
          newAsset.parentAsset = request.parentAssetId;
          await newAsset.save();
        }
      } catch (error) {
        console.error('Error updating parent asset relationship:', error);
      }
    }

    // Return the updated request with populated fields
    return await AssetRequest.findById(requestId)
      .populate('requestedBy', 'firstName lastName email')
      .populate('approvedBy', 'firstName lastName email')
      .populate('assignedTo', 'firstName lastName email')
      .populate('parentAssetId', 'assetName assetId tagNumber')
      .populate('createdAssetId', 'assetName assetId tagNumber status')
      .lean();
  }

  async rejectAssetRequest(requestId, adminId, rejectionData = {}) {

    const request = await AssetRequest.findById(requestId);

    if (!request) {
      throw new NotFoundError('Asset request not found');
    }

    if (request.status !== 'pending') {
      throw new ValidationError(`Cannot reject request that is already ${request.status}`);
    }

    // Update request status
    request.status = 'rejected';
    request.rejectedBy = adminId;
    request.rejectedAt = new Date();
    request.rejectionReason = rejectionData.reason || rejectionData.notes;

    if (rejectionData.notes) {
      request.rejectionNotes = rejectionData.notes;
    }

    await request.save();

    // Return the updated request with populated fields
    return await AssetRequest.findById(requestId)
      .populate('requestedBy', 'firstName lastName email')
      .populate('rejectedBy', 'firstName lastName email')
      .populate('parentAssetId', 'assetName assetId tagNumber')
      .lean();
  }

  async updateRequestStatus(requestId, status, updateData = {}) {
    const request = await AssetRequest.findById(requestId);
    if (!request) {
      throw new NotFoundError('Asset request not found');
    }

    if (request.status !== 'pending') {
      throw new ValidationError(`Cannot update request that is already ${request.status}`);
    }

    Object.assign(request, { status, ...updateData });
    await request.save();

    return request;
  }

  async getRequestsByDateRange(adminId, startDate, endDate) {
    const query = {
      adminId: this.toObjectId(adminId),
      createdAt: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    };

    return await AssetRequest.aggregate([
      { $match: query },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            status: '$status'
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.date': 1 } }
    ]);
  }

  async deleteAssetRequest(requestId, userId, userRole) {
    const request = await AssetRequest.findById(requestId);

    if (!request) {
      throw new NotFoundError('Asset request not found');
    }

    // Check if request is pending
    if (request.status !== 'pending') {
      throw new ValidationError('Only pending requests can be deleted');
    }

    // Check authorization for team members
    if (userRole === 'team' && request.requestedBy.toString() !== userId) {
      throw new ValidationError('You can only delete your own requests');
    }

    // For parent requests, check if there are any associated child requests
    if (request.requestType === 'parent') {
      const childRequests = await AssetRequest.find({
        parentAssetId: this.toObjectId(requestId),
        status: { $ne: 'rejected' } // Exclude rejected child requests
      });

      const activeChildRequests = childRequests.filter(
        child => child.status !== 'rejected'
      );

      if (activeChildRequests.length > 0) {
        const childStatuses = activeChildRequests.map(c => c.status).join(', ');
        throw new ValidationError(
          `Cannot delete parent request with ${activeChildRequests.length} active child request(s). ` +
          `Child request statuses: ${childStatuses}. ` +
          `Please delete or reject all child requests first.`
        );
      }
    }

    // For child requests, check if it's linked to any asset
    if (request.requestType === 'child' && request.createdAssetId) {
      // Check if the created asset exists and is in use
      const createdAsset = await Asset.findById(request.createdAssetId);
      if (createdAsset) {
        throw new ValidationError(
          'Cannot delete child request as an asset has already been created from this request. ' +
          'Please delete the associated asset first.'
        );
      }
    }

    // Delete the request
    await AssetRequest.findByIdAndDelete(requestId);

    // If this is a child request, also remove reference from parent
    if (request.requestType === 'child' && request.parentAssetId) {
      await AssetRequest.updateMany(
        { _id: request.parentAssetId },
        { $pull: { childRequests: requestId } }
      );
    }

    return {
      success: true,
      message: 'Request deleted successfully',
      deletedRequest: {
        id: requestId,
        type: request.requestType,
        name: request.assetName
      }
    };
  }
}

export default new AssetRequestService();