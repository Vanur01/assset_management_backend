import mongoose from 'mongoose';
import AssetRequest from '../models/AssetRequest.model.js';
import Asset from '../models/asset.model.js';
import AuditLog from '../models/auditLog.model.js';
import { NotFoundError, ValidationError, ForbiddenError, ConflictError } from '../errors/customError.js';

class AssetRequestService {
    toObjectId(id) {
        if (!id) return null;
        if (mongoose.Types.ObjectId.isValid(id)) return new mongoose.Types.ObjectId(id);
        return id;
    }

    async createAuditLog(action, resource, resourceId, actorId, actorRole, status = 'success', data = {}) {
        try {
            await AuditLog.create({
                action,
                resource,
                resourceId: this.toObjectId(resourceId),
                actor: this.toObjectId(actorId),
                actorRole,
                status,
                description: data.description || `${action} performed on ${resource}`,
                changes: data.changes || {},
                ipAddress: data.ipAddress || 'system',
                userAgent: data.userAgent || 'system',
                metadata: data.metadata || {}
            });
        } catch (error) {
            console.error('Audit log failed:', error);
        }
    }

    async validateAssetAccess(assetId, userId, userRole, adminId) {
        const asset = await Asset.findById(this.toObjectId(assetId)).select('adminId assignedUsers createdBy');
        if (!asset) throw new NotFoundError('Asset not found');

        if (userRole === 'admin') {
            if (asset.adminId.toString() !== userId.toString())
                throw new ForbiddenError('No access to this asset');
        } else {
            if (asset.adminId.toString() !== adminId?.toString())
                throw new ForbiddenError('No access to this asset');

            const isAssigned = [asset.assignedUsers?.primaryUser, asset.assignedUsers?.secondaryUser,
            asset.assignedUsers?.custodian, asset.createdBy].some(id => id?.toString() === userId.toString());

            if (!isAssigned) throw new ForbiddenError('Not assigned to this asset');
        }
        return asset;
    }

    async validateRequestAccess(requestId, userId, userRole, adminId) {
        const request = await AssetRequest.findById(this.toObjectId(requestId))
            .populate('adminId', '_id').populate('requestedBy', '_id');

        if (!request) throw new NotFoundError('Request not found');

        if (userRole === 'admin') {
            if (request.adminId._id.toString() !== userId.toString())
                throw new ForbiddenError('No access to this request');
        } else {
            const isRequester = request.requestedBy._id.toString() === userId.toString();
            const isUnderAdmin = request.adminId._id.toString() === adminId?.toString();
            if (!isRequester && !isUnderAdmin) throw new ForbiddenError('No access to this request');
        }
        return request;
    }

    async getRequests(query, userId, userRole, adminId, req = null) {
        const { page = 1, limit = 10, type = 'all', status, requestType, urgency, assetId, search,
            sortBy = 'createdAt', sortOrder = 'desc' } = query;

        const filter = {};

        try {
            // Role-based filtering
            if (userRole === 'admin') {
                filter.adminId = this.toObjectId(userId);
            } else {
                if (!adminId) throw new ValidationError([{ field: 'adminId', message: 'Admin ID required' }]);
                filter.adminId = this.toObjectId(adminId);
                filter.$or = [{ requestedBy: this.toObjectId(userId) }, { adminId: this.toObjectId(adminId) }];
            }

            // Parent/Child filtering
            if (type === 'parent') {
                filter.isChildRequest = false;
                filter.parentRequestId = null;
            } else if (type === 'child') {
                filter.isChildRequest = true;
                filter.parentRequestId = { $ne: null };
            }

            // Optional filters
            if (status) filter.status = status;
            if (requestType) filter.requestType = requestType;
            if (urgency) filter.urgency = urgency;
            if (assetId) filter.assetId = this.toObjectId(assetId);
            if (search) filter.description = { $regex: search, $options: 'i' };

            const skip = (parseInt(page) - 1) * parseInt(limit);
            const sortOptions = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

            const [requests, total] = await Promise.all([
                AssetRequest.find(filter)
                    .populate('assetId', 'name code serialNumber status')
                    .populate('requestedBy', 'name email')
                    .populate('approvedBy', 'name email')
                    .sort(sortOptions)
                    .skip(skip)
                    .limit(parseInt(limit))
                    .lean(),
                AssetRequest.countDocuments(filter)
            ]);

            // Add child count to parent requests
            const requestsWithCount = await Promise.all(requests.map(async (req) => {
                if (!req.isChildRequest && req.childRequests?.length) {
                    req.childCount = await AssetRequest.countDocuments({ parentRequestId: req._id });
                }
                return req;
            }));

            // Get statistics
            const statsFilter = { ...filter };
            delete statsFilter.$or;
            const stats = await this.getStatsForFilter(statsFilter);

            // Audit log for successful fetch
            await this.createAuditLog('FETCH', 'asset_request', null, userId, userRole, 'success', {
                description: `Fetched asset requests list with filters`,
                changes: { filter: Object.keys(query), resultCount: requests.length },
                ipAddress: req?.ip,
                userAgent: req?.headers?.['user-agent'],
                metadata: { page, limit, type, status, requestType, urgency }
            });

            return {
                stats,
                requests: requestsWithCount,
                pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) }
            };
        } catch (error) {
            await this.createAuditLog('FETCH', 'asset_request', null, userId, userRole, 'failure', {
                description: `Failed to fetch asset requests`,
                changes: { error: error.message },
                ipAddress: req?.ip,
                userAgent: req?.headers?.['user-agent']
            });
            throw error;
        }
    }

    async getStatsForFilter(filter) {
        const [statusStats, urgencyStats, typeStats] = await Promise.all([
            AssetRequest.aggregate([{ $match: filter }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
            AssetRequest.aggregate([{ $match: filter }, { $group: { _id: '$urgency', count: { $sum: 1 } } }]),
            AssetRequest.aggregate([{ $match: filter }, { $group: { _id: '$requestType', count: { $sum: 1 } } }])
        ]);

        const result = {
            total: 0, pending: 0, approved: 0, rejected: 0, completed: 0,
            byUrgency: { low: 0, medium: 0, high: 0, critical: 0 },
            byType: { transfer: 0, maintenance: 0, repair: 0, checkout: 0, other: 0 }
        };

        statusStats.forEach(stat => { result[stat._id] = stat.count; result.total += stat.count; });
        urgencyStats.forEach(stat => { if (result.byUrgency[stat._id] !== undefined) result.byUrgency[stat._id] = stat.count; });
        typeStats.forEach(stat => { if (result.byType[stat._id] !== undefined) result.byType[stat._id] = stat.count; });

        return result;
    }

    async getRequestById(requestId, userId, userRole, adminId, req = null) {
        try {
            await this.validateRequestAccess(requestId, userId, userRole, adminId);

            const request = await AssetRequest.findById(requestId)
                .populate('assetId', 'name code assetId serialNumber status')
                .populate('requestedBy', 'name email')
                .populate('adminId', 'name email')
                .populate('approvedBy', 'name email')
                .populate('childRequests', 'requestType status urgency description')
                .populate('parentRequestId', 'requestType status')
                .lean();

            if (request.childRequests) request.childCount = request.childRequests.length;

            await this.createAuditLog('FETCH', 'asset_request', requestId, userId, userRole, 'success', {
                description: `Fetched asset request details`,
                changes: { requestId, requestType: request.requestType, status: request.status },
                ipAddress: req?.ip,
                userAgent: req?.headers?.['user-agent']
            });

            return request;
        } catch (error) {
            await this.createAuditLog('FETCH', 'asset_request', requestId, userId, userRole, 'failure', {
                description: `Failed to fetch asset request`,
                changes: { error: error.message },
                ipAddress: req?.ip,
                userAgent: req?.headers?.['user-agent']
            });
            throw error;
        }
    }

    async getRequestTree(requestId, userId, userRole, adminId, req = null) {
        try {
            await this.validateRequestAccess(requestId, userId, userRole, adminId);
            const tree = await AssetRequest.getRequestTree(requestId);
            if (!tree) throw new NotFoundError('Request tree not found');

            await this.createAuditLog('FETCH', 'asset_request_tree', requestId, userId, userRole, 'success', {
                description: `Fetched complete request tree`,
                changes: { requestId, childCount: tree.childRequests?.length || 0 },
                ipAddress: req?.ip,
                userAgent: req?.headers?.['user-agent']
            });

            return tree;
        } catch (error) {
            await this.createAuditLog('FETCH', 'asset_request_tree', requestId, userId, userRole, 'failure', {
                description: `Failed to fetch request tree`,
                changes: { error: error.message },
                ipAddress: req?.ip,
                userAgent: req?.headers?.['user-agent']
            });
            throw error;
        }
    }

    async getRequestsByAsset(assetId, status, userId, userRole, adminId, req = null) {
        try {
            await this.validateAssetAccess(assetId, userId, userRole, adminId);

            const query = { assetId: this.toObjectId(assetId) };
            if (status) query.status = status;

            const requests = await AssetRequest.find(query)
                .sort({ createdAt: -1 })
                .populate('requestedBy', 'name email')
                .populate('childRequests', 'requestType status')
                .lean();

            await this.createAuditLog('FETCH', 'asset_request', null, userId, userRole, 'success', {
                description: `Fetched requests by asset`,
                changes: { assetId, status: status || 'all', resultCount: requests.length },
                ipAddress: req?.ip,
                userAgent: req?.headers?.['user-agent']
            });

            return { assetId, totalRequests: requests.length, requests };
        } catch (error) {
            await this.createAuditLog('FETCH', 'asset_request', null, userId, userRole, 'failure', {
                description: `Failed to fetch requests by asset`,
                changes: { assetId, error: error.message },
                ipAddress: req?.ip,
                userAgent: req?.headers?.['user-agent']
            });
            throw error;
        }
    }

    async getStats(adminId, req = null) {
        try {
            const objectId = this.toObjectId(adminId);
            const [stats, recentRequests, urgentRequests, avgTime] = await Promise.all([
                AssetRequest.getStats(adminId),
                AssetRequest.find({ adminId: objectId }).sort({ createdAt: -1 }).limit(5)
                    .populate('assetId', 'name code').populate('requestedBy', 'name email').lean(),
                AssetRequest.countDocuments({ adminId: objectId, urgency: { $in: ['high', 'critical'] }, status: 'pending' }),
                this.getAverageCompletionTime(adminId)
            ]);

            const result = { ...stats, urgentPending: urgentRequests, averageCompletionDays: avgTime, recentRequests };

            await this.createAuditLog('FETCH', 'asset_request_stats', null, adminId, 'admin', 'success', {
                description: `Fetched asset request statistics`,
                changes: { totalRequests: stats.total, pending: stats.pending, urgentPending: urgentRequests },
                ipAddress: req?.ip,
                userAgent: req?.headers?.['user-agent']
            });

            return result;
        } catch (error) {
            await this.createAuditLog('FETCH', 'asset_request_stats', null, adminId, 'admin', 'failure', {
                description: `Failed to fetch statistics`,
                changes: { error: error.message },
                ipAddress: req?.ip,
                userAgent: req?.headers?.['user-agent']
            });
            throw error;
        }
    }

    async getAverageCompletionTime(adminId) {
        const result = await AssetRequest.aggregate([
            { $match: { adminId: this.toObjectId(adminId), status: 'completed', completedAt: { $exists: true } } },
            { $project: { completionTime: { $divide: [{ $subtract: ['$completedAt', '$createdAt'] }, 86400000] } } },
            { $group: { _id: null, averageDays: { $avg: '$completionTime' } } }
        ]);
        return result.length ? Math.round(result[0].averageDays * 10) / 10 : 0;
    }

    async createParentRequest(data, userId, userRole, adminId, req = null) {
        try {
            await this.validateAssetAccess(data.assetId, userId, userRole, adminId);

            const resolvedAdminId = userRole === 'admin' ? this.toObjectId(userId) : this.toObjectId(adminId);
            if (!resolvedAdminId) throw new ValidationError([{ field: 'adminId', message: 'Admin ID required' }]);

            const request = new AssetRequest({
                assetId: this.toObjectId(data.assetId),
                requestedBy: this.toObjectId(userId),
                adminId: resolvedAdminId,
                requestType: data.requestType,
                description: data.description,
                urgency: data.urgency || 'medium',
                status: 'pending',
                isChildRequest: false,
                approvalChain: data.approvalChain || []
            });

            await request.save();

            await this.createAuditLog('CREATE', 'asset_request', request._id, userId, userRole, 'success', {
                description: `Parent ${data.requestType} request created for asset`,
                changes: {
                    assetId: data.assetId,
                    requestType: data.requestType,
                    urgency: data.urgency,
                    description: data.description
                },
                ipAddress: req?.ip,
                userAgent: req?.headers?.['user-agent'],
                metadata: { isParent: true, requestId: request._id }
            });

            return await this.getRequestById(request._id, userId, userRole, adminId);
        } catch (error) {
            await this.createAuditLog('CREATE', 'asset_request', null, userId, userRole, 'failure', {
                description: `Failed to create parent request: ${error.message}`,
                changes: { data, error: error.message },
                ipAddress: req?.ip,
                userAgent: req?.headers?.['user-agent']
            });
            throw error;
        }
    }

    async createChildRequest(parentId, childData, userId, userRole, adminId, req = null) {
        try {
            const parentRequest = await this.validateRequestAccess(parentId, userId, userRole, adminId);

            if (parentRequest.status === 'completed') throw new ConflictError('Cannot add child to completed request');
            if (parentRequest.isChildRequest) throw new ValidationError([{ field: 'parentId', message: 'Cannot nest child requests' }]);

            const assetId = childData.assetId || parentRequest.assetId;
            await this.validateAssetAccess(assetId, userId, userRole, adminId);

            const resolvedAdminId = userRole === 'admin' ? this.toObjectId(userId) : this.toObjectId(adminId);

            const childRequest = await parentRequest.addChildRequest({
                assetId: this.toObjectId(assetId),
                requestedBy: this.toObjectId(userId),
                adminId: resolvedAdminId,
                requestType: childData.requestType || parentRequest.requestType,
                description: childData.description,
                urgency: childData.urgency || parentRequest.urgency,
                approvalChain: childData.approvalChain || []
            });

            await this.createAuditLog('CREATE', 'asset_request', childRequest._id, userId, userRole, 'success', {
                description: `Child request created under parent ${parentId}`,
                changes: {
                    parentId,
                    childRequestId: childRequest._id,
                    requestType: childRequest.requestType,
                    urgency: childRequest.urgency
                },
                ipAddress: req?.ip,
                userAgent: req?.headers?.['user-agent'],
                metadata: { isChild: true, parentId }
            });

            return await this.getRequestById(childRequest._id, userId, userRole, adminId);
        } catch (error) {
            await this.createAuditLog('CREATE', 'asset_request', null, userId, userRole, 'failure', {
                description: `Failed to create child request: ${error.message}`,
                changes: { parentId, childData, error: error.message },
                ipAddress: req?.ip,
                userAgent: req?.headers?.['user-agent']
            });
            throw error;
        }
    }

    async linkChildAsset(requestId, childAssetId, relationshipType, userId, userRole, adminId, req = null) {
        try {
            const request = await this.validateRequestAccess(requestId, userId, userRole, adminId);
            if (request.status === 'completed') throw new ConflictError('Cannot link asset to completed request');

            await this.validateAssetAccess(childAssetId, userId, userRole, adminId);
            await request.linkChildAsset(childAssetId, relationshipType, userId);

            await this.createAuditLog('UPDATE', 'asset_request', requestId, userId, userRole, 'success', {
                description: `Child asset linked to request`,
                changes: { childAssetId, relationshipType, requestId },
                ipAddress: req?.ip,
                userAgent: req?.headers?.['user-agent'],
                metadata: { linkedAt: new Date(), linkedBy: userId }
            });

            return await this.getRequestById(requestId, userId, userRole, adminId);
        } catch (error) {
            await this.createAuditLog('UPDATE', 'asset_request', requestId, userId, userRole, 'failure', {
                description: `Failed to link child asset: ${error.message}`,
                changes: { childAssetId, relationshipType, error: error.message },
                ipAddress: req?.ip,
                userAgent: req?.headers?.['user-agent']
            });
            throw error;
        }
    }

    async approveRequest(requestId, adminUserId, approvalNotes = '', req = null) {
        try {
            const request = await AssetRequest.findById(requestId);
            if (!request) throw new NotFoundError('Request not found');
            if (request.status !== 'pending') throw new ConflictError(`Cannot approve request with status: ${request.status}`);

            await request.approve(adminUserId);

            if (approvalNotes) {
                if (!request.metadata) request.metadata = {};
                request.metadata.approvalNotes = approvalNotes;
                await request.save();
            }

            // Update approval chain
            if (request.approvalChain?.length) {
                const pendingIndex = request.approvalChain.findIndex(a => a.status === 'pending');
                if (pendingIndex !== -1) {
                    request.approvalChain[pendingIndex].status = 'approved';
                    request.approvalChain[pendingIndex].approvedAt = new Date();
                    await request.save();
                }
            }

            await this.createAuditLog('APPROVE', 'asset_request', requestId, adminUserId, 'admin', 'success', {
                description: `Request approved`,
                changes: { requestId, requestType: request.requestType, approvalNotes },
                ipAddress: req?.ip,
                userAgent: req?.headers?.['user-agent'],
                metadata: { approvedBy: adminUserId, approvedAt: new Date() }
            });

            return await this.getRequestById(requestId, adminUserId, 'admin', adminUserId);
        } catch (error) {
            await this.createAuditLog('APPROVE', 'asset_request', requestId, adminUserId, 'admin', 'failure', {
                description: `Failed to approve request: ${error.message}`,
                changes: { error: error.message },
                ipAddress: req?.ip,
                userAgent: req?.headers?.['user-agent']
            });
            throw error;
        }
    }

    async rejectRequest(requestId, reason, adminUserId, req = null) {
        try {
            const request = await AssetRequest.findById(requestId);
            if (!request) throw new NotFoundError('Request not found');
            if (request.status !== 'pending') throw new ConflictError(`Cannot reject request with status: ${request.status}`);

            await request.reject(reason);

            if (request.approvalChain?.length) {
                const pendingIndex = request.approvalChain.findIndex(a => a.status === 'pending');
                if (pendingIndex !== -1) {
                    request.approvalChain[pendingIndex].status = 'rejected';
                    request.approvalChain[pendingIndex].approvedAt = new Date();
                    await request.save();
                }
            }

            await this.createAuditLog('REJECT', 'asset_request', requestId, adminUserId, 'admin', 'success', {
                description: `Request rejected`,
                changes: { requestId, requestType: request.requestType, reason },
                ipAddress: req?.ip,
                userAgent: req?.headers?.['user-agent'],
                metadata: { rejectedBy: adminUserId, rejectedAt: new Date() }
            });

            return await this.getRequestById(requestId, adminUserId, 'admin', adminUserId);
        } catch (error) {
            await this.createAuditLog('REJECT', 'asset_request', requestId, adminUserId, 'admin', 'failure', {
                description: `Failed to reject request: ${error.message}`,
                changes: { error: error.message },
                ipAddress: req?.ip,
                userAgent: req?.headers?.['user-agent']
            });
            throw error;
        }
    }

    async completeRequest(requestId, completionNotes, userId, userRole, adminId, req = null) {
        try {
            const request = await this.validateRequestAccess(requestId, userId, userRole, adminId);
            if (request.status !== 'approved') throw new ConflictError(`Only approved requests can be completed`);

            await request.complete(completionNotes);

            await this.createAuditLog('COMPLETE', 'asset_request', requestId, userId, userRole, 'success', {
                description: `Request completed`,
                changes: { requestId, completionNotes, status: 'completed' },
                ipAddress: req?.ip,
                userAgent: req?.headers?.['user-agent'],
                metadata: { completedBy: userId, completedAt: new Date() }
            });

            return await this.getRequestById(requestId, userId, userRole, adminId);
        } catch (error) {
            await this.createAuditLog('COMPLETE', 'asset_request', requestId, userId, userRole, 'failure', {
                description: `Failed to complete request: ${error.message}`,
                changes: { error: error.message },
                ipAddress: req?.ip,
                userAgent: req?.headers?.['user-agent']
            });
            throw error;
        }
    }

    async updateChildStatus(parentId, childId, status, updates, userId, userRole, adminId, req = null) {
        try {
            const parentRequest = await this.validateRequestAccess(parentId, userId, userRole, adminId);
            if (parentRequest.status === 'completed') throw new ConflictError('Cannot update child of completed request');

            const updatedChild = await parentRequest.updateChildStatus(childId, status, updates);

            await this.createAuditLog('UPDATE', 'asset_request', childId, userId, userRole, 'success', {
                description: `Child request status updated to ${status}`,
                changes: { parentId, childId, status, updates },
                ipAddress: req?.ip,
                userAgent: req?.headers?.['user-agent'],
                metadata: { parentId, updatedBy: userId }
            });

            return { childRequest: updatedChild, parentAutomaticallyCompleted: parentRequest.status === 'completed' };
        } catch (error) {
            await this.createAuditLog('UPDATE', 'asset_request', childId, userId, userRole, 'failure', {
                description: `Failed to update child status: ${error.message}`,
                changes: { parentId, childId, status, error: error.message },
                ipAddress: req?.ip,
                userAgent: req?.headers?.['user-agent']
            });
            throw error;
        }
    }
}

export default new AssetRequestService();