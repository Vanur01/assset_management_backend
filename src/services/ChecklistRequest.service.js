import ChecklistRequest from '../models/Checklistrequest.model.js';
import AuditLog from '../models/auditLog.model.js';
import {
    NotFoundError,
    AuthorizationError,
    ValidationError,
    BadRequestError
} from '../errors/customError.js';
import mongoose from 'mongoose';

class ChecklistRequestService {

    /**
     * Helper to create audit logs
     */
    async createAuditLog({ action, resource, resourceId, actor, actorRole, description, status = 'success', changes = {}, metadata = {}, req = null }) {
        try {
            // Map role to valid enum values for AuditLog
            let mappedRole = actorRole;

            // Map 'user' to 'team' since 'user' is not in enum
            if (mappedRole === 'user') {
                mappedRole = 'team';
            }

            // Ensure role is one of the valid enum values
            const validRoles = ['super_admin', 'admin', 'team'];
            if (!validRoles.includes(mappedRole)) {
                mappedRole = 'team'; // Default to team if invalid
            }

            await AuditLog.create({
                action,
                resource,
                resourceId,
                actor,
                actorRole: mappedRole,
                description,
                status,
                changes,
                metadata,
                ipAddress: req?.ip || req?.headers?.['x-forwarded-for'] || 'system',
                userAgent: req?.headers?.['user-agent'] || 'system',
            });
        } catch (error) {
            console.error('Failed to create audit log:', error);
        }
    }

    /**
     * Helper to get user role safely
     */
    getUserRole(req) {
        if (!req?.user?.role) return 'team';
        const role = req.user.role;
        // Map 'user' to 'team' for audit log compatibility
        if (role === 'user') return 'team';
        return role;
    }

    async createRequest(userId, data, files, req = null) {
        const {
            checklistName,
            category,
            detailedDescription,
            businessJustification,
            urgencyLevel,
            expectedUsageFrequency,
            numberOfTeamMembers,
            additionalNotes,
            message
        } = data;

        const requiredFields = ['checklistName', 'category', 'detailedDescription',
            'businessJustification', 'urgencyLevel'];
        const missingFields = requiredFields.filter(field => !data[field]);

        if (missingFields.length > 0) {
            throw new ValidationError(`Missing required fields: ${missingFields.join(', ')}`);
        }

        const validUrgencyLevels = ['low', 'medium', 'high', 'critical'];
        if (urgencyLevel && !validUrgencyLevels.includes(urgencyLevel)) {
            throw new ValidationError(`Invalid urgency level. Must be one of: ${validUrgencyLevels.join(', ')}`);
        }

        const validFrequencies = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'as_needed'];
        if (expectedUsageFrequency && !validFrequencies.includes(expectedUsageFrequency)) {
            throw new ValidationError(`Invalid usage frequency. Must be one of: ${validFrequencies.join(', ')}`);
        }

        const referenceFiles = files && files.length > 0
            ? files.map(file => ({
                originalName: file.originalname,
                filePath: `http://localhost:9001/uploads/checklist-requests/${file.filename}`,
                mimeType: file.mimetype,
                sizeBytes: file.size,
                uploadedAt: new Date(),
            }))
            : [];

        try {
            const request = await ChecklistRequest.create({
                checklistName: checklistName.trim(),
                category: category.trim(),
                detailedDescription: detailedDescription.trim(),
                businessJustification: businessJustification.trim(),
                urgencyLevel: urgencyLevel || 'medium',
                expectedUsageFrequency: expectedUsageFrequency || 'as_needed',
                numberOfTeamMembers: numberOfTeamMembers ? parseInt(numberOfTeamMembers) : 1,
                referenceFiles,
                additionalNotes: additionalNotes ? additionalNotes.trim() : '',
                message: message ? message.trim() : '',
                requestedBy: userId,
                requestDate: new Date(),
                status: 'pending',
                isDeleted: false
            });

            const populatedRequest = await ChecklistRequest.findById(request._id)
                .populate('requestedBy', 'name email role');

            // Create audit log
            await this.createAuditLog({
                action: 'CREATE',
                resource: 'checklist_request',
                resourceId: request._id,
                actor: userId,
                actorRole: this.getUserRole(req),
                description: `Checklist request "${checklistName}" created successfully`,
                status: 'success',
                changes: {
                    new: {
                        checklistName,
                        category,
                        urgencyLevel,
                        expectedUsageFrequency,
                        numberOfTeamMembers,
                        filesCount: referenceFiles.length
                    }
                },
                metadata: {
                    checklistName,
                    category,
                    urgencyLevel,
                    filesCount: referenceFiles.length
                },
                req
            });

            return populatedRequest._doc;
        } catch (error) {
            // Create audit log for failure
            await this.createAuditLog({
                action: 'CREATE',
                resource: 'checklist_request',
                actor: userId,
                actorRole: this.getUserRole(req),
                description: `Failed to create checklist request "${checklistName || 'unnamed'}": ${error.message}`,
                status: 'failure',
                metadata: {
                    error: error.message,
                    checklistName,
                    category
                },
                req
            });
            throw error;
        }
    }

    async getRequests(userId, userRole, filters = {}, req = null) {
        let query = { isDeleted: false }; // Exclude deleted by default

        // For non-admin users, only show their own non-deleted requests
        if (userRole !== 'super_admin' && userRole !== 'admin') {
            query.requestedBy = userId;
        }

        // Filter by status
        if (filters.status) {
            const validStatuses = ['pending', 'approved', 'rejected', 'under_review', 'in_progress'];
            if (validStatuses.includes(filters.status)) {
                query.status = filters.status;
            }
        }

        // Include deleted if specifically requested (admin only)
        let includeDeleted = false;
        if (filters.includeDeleted === 'true' && (userRole === 'super_admin' || userRole === 'admin')) {
            includeDeleted = true;
            delete query.isDeleted; // Remove isDeleted filter to include deleted
        }

        if (filters.urgencyLevel) {
            const validUrgencies = ['low', 'medium', 'high', 'critical'];
            if (validUrgencies.includes(filters.urgencyLevel)) {
                query.urgencyLevel = filters.urgencyLevel;
            }
        }

        if (filters.category) {
            query.category = { $regex: new RegExp(filters.category, 'i') };
        }

        if (filters.search && filters.search.trim()) {
            const searchTerm = filters.search.trim();
            query.$or = [
                { checklistName: { $regex: searchTerm, $options: 'i' } },
                { category: { $regex: searchTerm, $options: 'i' } },
                { detailedDescription: { $regex: searchTerm, $options: 'i' } },
                { businessJustification: { $regex: searchTerm, $options: 'i' } }
            ];
        }

        if (filters.fromDate) {
            const fromDate = new Date(filters.fromDate);
            if (!isNaN(fromDate)) {
                query.requestDate = { $gte: fromDate };
            }
        }

        if (filters.toDate) {
            const toDate = new Date(filters.toDate);
            if (!isNaN(toDate)) {
                toDate.setHours(23, 59, 59, 999);
                query.requestDate = { ...query.requestDate, $lte: toDate };
            }
        }

        const page = Math.max(1, parseInt(filters.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(filters.limit) || 10));
        const skip = (page - 1) * limit;

        const sortField = filters.sortBy || 'createdAt';
        const sortOrder = filters.sortOrder === 'asc' ? 1 : -1;
        const sort = { [sortField]: sortOrder };

        // Build query with proper options
        let findQuery = ChecklistRequest.find(query);
        
        if (includeDeleted) {
            findQuery = findQuery.setOptions({ includeDeleted: true });
        }

        const [requests, total] = await Promise.all([
            findQuery
                .populate('requestedBy', 'name email role')
                .populate('reviewedBy', 'name email role')
                .populate('resultingChecklist', 'name version')
                .sort(sort)
                .skip(skip)
                .limit(limit)
                .lean(),
            ChecklistRequest.countDocuments(query).setOptions(includeDeleted ? { includeDeleted: true } : {})
        ]);

        // Create audit log for view action (only for first page to avoid excessive logs)
        if (page === 1 && !filters.search) {
            await this.createAuditLog({
                action: 'VIEW_LIST',
                resource: 'checklist_request',
                actor: userId,
                actorRole: this.getUserRole({ ...req, user: { role: userRole } }),
                description: `Retrieved checklist requests list - page ${page}, total ${total} records${includeDeleted ? ' (including deleted)' : ''}`,
                status: 'success',
                metadata: {
                    page,
                    limit,
                    total,
                    includeDeleted,
                    filters: {
                        status: filters.status,
                        urgencyLevel: filters.urgencyLevel,
                        category: filters.category,
                        hasSearch: !!filters.search
                    }
                },
                req
            });
        }

        return {
            requests,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
                hasNextPage: page < Math.ceil(total / limit),
                hasPrevPage: page > 1
            },
            filters: {
                status: filters.status || null,
                urgencyLevel: filters.urgencyLevel || null,
                category: filters.category || null,
                search: filters.search || null,
                includeDeleted,
                dateRange: {
                    from: filters.fromDate || null,
                    to: filters.toDate || null
                }
            }
        };
    }

    async getRequestById(requestId, userId, userRole, req = null) {
        if (!requestId || requestId === 'undefined') {
            throw new ValidationError('Valid request ID is required');
        }

        // Allow admins to view deleted requests
        let findQuery = ChecklistRequest.findById(requestId);
        if (userRole === 'super_admin' || userRole === 'admin') {
            findQuery = findQuery.setOptions({ includeDeleted: true });
        }

        const request = await findQuery
            .populate('requestedBy', 'name email role')
            .populate('reviewedBy', 'name email role')
            .populate('resultingChecklist', 'name version category')
            .populate('createdChecklistId', 'name version category')
            .lean();

        if (!request) {
            await this.createAuditLog({
                action: 'VIEW',
                resource: 'checklist_request',
                resourceId: requestId,
                actor: userId,
                actorRole: this.getUserRole({ ...req, user: { role: userRole } }),
                description: `Failed to view request - request not found`,
                status: 'failure',
                metadata: { requestId },
                req
            });
            throw new NotFoundError('Request not found');
        }

        const canView = userRole === 'super_admin' ||
            userRole === 'admin' ||
            (request.requestedBy && request.requestedBy._id.toString() === userId);

        if (!canView) {
            await this.createAuditLog({
                action: 'VIEW',
                resource: 'checklist_request',
                resourceId: requestId,
                actor: userId,
                actorRole: this.getUserRole({ ...req, user: { role: userRole } }),
                description: `Failed to view request - permission denied`,
                status: 'failure',
                metadata: {
                    requestId,
                    requestedBy: request.requestedBy?._id,
                    userRole
                },
                req
            });
            throw new AuthorizationError('You do not have permission to view this request');
        }

        // Create audit log for successful view
        await this.createAuditLog({
            action: 'VIEW',
            resource: 'checklist_request',
            resourceId: requestId,
            actor: userId,
            actorRole: this.getUserRole({ ...req, user: { role: userRole } }),
            description: `Viewed checklist request "${request.checklistName}"`,
            status: 'success',
            metadata: {
                checklistName: request.checklistName,
                status: request.status,
                urgencyLevel: request.urgencyLevel,
                isDeleted: request.isDeleted || false
            },
            req
        });

        return request;
    }

    // ==================== SOFT DELETE ====================
    async softDeleteRequest(requestId, userId, userRole, req = null) {
        if (!requestId || requestId === 'undefined') {
            throw new ValidationError('Valid request ID is required');
        }

        // Only admin and super_admin can soft delete
        if (userRole !== 'super_admin' && userRole !== 'admin') {
            throw new AuthorizationError('Only admin and super admin can delete requests');
        }

        // Find request including deleted ones to avoid double deletion
        const request = await ChecklistRequest.findById(requestId).setOptions({ includeDeleted: true });

        if (!request) {
            throw new NotFoundError('Request not found');
        }

        if (request.isDeleted) {
            throw new BadRequestError('Request is already deleted');
        }

        // Get deleter name
        const User = mongoose.model('User');
        const user = await User.findById(userId).lean();
        const deletedByName = user?.name || user?.email || 'Unknown User';

        // Perform soft delete
        await request.softDelete(userId, deletedByName);

        // Create audit log
        await this.createAuditLog({
            action: 'SOFT_DELETE',
            resource: 'checklist_request',
            resourceId: requestId,
            actor: userId,
            actorRole: this.getUserRole({ ...req, user: { role: userRole } }),
            description: `Soft deleted checklist request "${request.checklistName}"`,
            status: 'success',
            changes: {
                old: {
                    isDeleted: false,
                    status: request.status
                },
                new: {
                    isDeleted: true,
                    deletedAt: new Date(),
                    permanentDeleteAt: request.permanentDeleteAt
                }
            },
            metadata: {
                checklistName: request.checklistName,
                requestStatus: request.status,
                urgencyLevel: request.urgencyLevel,
                permanentDeleteScheduled: request.permanentDeleteAt
            },
            req
        });

        return {
            message: 'Request soft deleted successfully',
            request: {
                _id: request._id,
                checklistName: request.checklistName,
                isDeleted: request.isDeleted,
                deletedAt: request.deletedAt,
                permanentDeleteAt: request.permanentDeleteAt
            }
        };
    }

    // ==================== GET DELETED REQUESTS (RECYCLE BIN) ====================
    async getDeletedRequests(userId, userRole, filters = {}, req = null) {
        // Only admin and super_admin can view deleted requests
        if (userRole !== 'super_admin' && userRole !== 'admin') {
            throw new AuthorizationError('Only admin and super admin can view deleted requests');
        }

        const query = { isDeleted: true };

        // Search filter
        if (filters.search && filters.search.trim()) {
            const searchTerm = filters.search.trim();
            query.$or = [
                { checklistName: { $regex: searchTerm, $options: 'i' } },
                { category: { $regex: searchTerm, $options: 'i' } },
                { detailedDescription: { $regex: searchTerm, $options: 'i' } }
            ];
        }

        // Status filter (original status before deletion)
        if (filters.status && filters.status !== 'all') {
            query.status = filters.status;
        }

        // Urgency filter
        if (filters.urgencyLevel && filters.urgencyLevel !== 'all') {
            query.urgencyLevel = filters.urgencyLevel;
        }

        // Date range filter (deletion date)
        if (filters.deletedFromDate) {
            const fromDate = new Date(filters.deletedFromDate);
            if (!isNaN(fromDate)) {
                query.deletedAt = { $gte: fromDate };
            }
        }

        if (filters.deletedToDate) {
            const toDate = new Date(filters.deletedToDate);
            if (!isNaN(toDate)) {
                toDate.setHours(23, 59, 59, 999);
                query.deletedAt = { ...query.deletedAt, $lte: toDate };
            }
        }

        // Deleted by filter
        if (filters.deletedBy && filters.deletedBy !== 'all') {
            query.deletedBy = filters.deletedBy;
        }

        const page = Math.max(1, parseInt(filters.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(filters.limit) || 10));
        const skip = (page - 1) * limit;

        // Sort options
        const sortField = filters.sortBy || 'deletedAt';
        const sortOrder = filters.sortOrder === 'asc' ? 1 : -1;
        const sort = { [sortField]: sortOrder };

        const [requests, total] = await Promise.all([
            ChecklistRequest.find(query)
                .setOptions({ includeDeleted: true })
                .populate('requestedBy', 'name email role')
                .populate('reviewedBy', 'name email role')
                .populate('deletedBy', 'name email role')
                .sort(sort)
                .skip(skip)
                .limit(limit)
                .lean(),
            ChecklistRequest.countDocuments(query).setOptions({ includeDeleted: true })
        ]);

        // Get unique deleted by users for filter options
        const deletedByUsers = await ChecklistRequest.distinct('deletedBy', { isDeleted: true })
            .setOptions({ includeDeleted: true });
        
        const deletedByUsersPopulated = await mongoose.model('User')
            .find({ _id: { $in: deletedByUsers } })
            .select('name email role')
            .lean();

        // Create audit log
        await this.createAuditLog({
            action: 'VIEW_DELETED',
            resource: 'checklist_request',
            actor: userId,
            actorRole: this.getUserRole({ ...req, user: { role: userRole } }),
            description: `Retrieved deleted checklist requests from recycle bin - found ${total} records`,
            status: 'success',
            metadata: {
                page,
                limit,
                total,
                filters: {
                    search: filters.search,
                    status: filters.status,
                    urgencyLevel: filters.urgencyLevel,
                    deletedFromDate: filters.deletedFromDate,
                    deletedToDate: filters.deletedToDate,
                    deletedBy: filters.deletedBy
                }
            },
            req
        });

        return {
            requests,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
                hasNextPage: page < Math.ceil(total / limit),
                hasPrevPage: page > 1
            },
            filters: {
                search: filters.search || null,
                status: filters.status || 'all',
                urgencyLevel: filters.urgencyLevel || 'all',
                deletedBy: filters.deletedBy || 'all',
                dateRange: {
                    from: filters.deletedFromDate || null,
                    to: filters.deletedToDate || null
                }
            },
            filterOptions: {
                deletedByUsers: deletedByUsersPopulated
            }
        };
    }

    // ==================== RESTORE SOFT DELETED ====================
    async restoreRequest(requestId, userId, userRole, req = null) {
        if (!requestId || requestId === 'undefined') {
            throw new ValidationError('Valid request ID is required');
        }

        // Only admin and super_admin can restore
        if (userRole !== 'super_admin' && userRole !== 'admin') {
            throw new AuthorizationError('Only admin and super admin can restore requests');
        }

        // Find soft-deleted request
        const request = await ChecklistRequest.findById(requestId).setOptions({ includeDeleted: true });

        if (!request) {
            throw new NotFoundError('Request not found');
        }

        if (!request.isDeleted) {
            throw new BadRequestError('Request is not deleted');
        }

        // Store data before restore for audit
        const requestData = {
            checklistName: request.checklistName,
            deletedAt: request.deletedAt,
            deletedBy: request.deletedBy
        };

        // Perform restore
        await request.restore();

        // Create audit log
        await this.createAuditLog({
            action: 'RESTORE',
            resource: 'checklist_request',
            resourceId: requestId,
            actor: userId,
            actorRole: this.getUserRole({ ...req, user: { role: userRole } }),
            description: `Restored checklist request "${request.checklistName}" from recycle bin`,
            status: 'success',
            changes: {
                old: {
                    isDeleted: true,
                    deletedAt: requestData.deletedAt,
                    deletedBy: requestData.deletedBy
                },
                new: {
                    isDeleted: false,
                    deletedAt: null,
                    deletedBy: null
                }
            },
            metadata: {
                checklistName: requestData.checklistName,
                requestStatus: request.status,
                urgencyLevel: request.urgencyLevel,
                wasDeletedAt: requestData.deletedAt,
                wasDeletedBy: requestData.deletedBy
            },
            req
        });

        const restoredRequest = await ChecklistRequest.findById(requestId)
            .populate('requestedBy', 'name email role')
            .populate('reviewedBy', 'name email role')
            .lean();

        return {
            message: 'Request restored successfully',
            request: restoredRequest
        };
    }

    // ==================== BULK RESTORE ====================
    async bulkRestoreRequests(requestIds, userId, userRole, req = null) {
        if (!requestIds || !Array.isArray(requestIds) || requestIds.length === 0) {
            throw new ValidationError('Valid request IDs array is required');
        }

        // Only admin and super_admin can bulk restore
        if (userRole !== 'super_admin' && userRole !== 'admin') {
            throw new AuthorizationError('Only admin and super admin can bulk restore requests');
        }

        const results = {
            successful: [],
            failed: []
        };

        for (const requestId of requestIds) {
            try {
                const request = await ChecklistRequest.findById(requestId).setOptions({ includeDeleted: true });
                
                if (!request) {
                    results.failed.push({ requestId, reason: 'Request not found' });
                    continue;
                }
                
                if (!request.isDeleted) {
                    results.failed.push({ requestId, reason: 'Request is not deleted' });
                    continue;
                }
                
                await request.restore();
                
                results.successful.push({
                    requestId,
                    checklistName: request.checklistName
                });
                
                // Create individual audit log for each restore
                await this.createAuditLog({
                    action: 'BULK_RESTORE',
                    resource: 'checklist_request',
                    resourceId: requestId,
                    actor: userId,
                    actorRole: this.getUserRole({ ...req, user: { role: userRole } }),
                    description: `Restored checklist request "${request.checklistName}" as part of bulk operation`,
                    status: 'success',
                    metadata: {
                        checklistName: request.checklistName,
                        bulkOperation: true
                    },
                    req
                });
            } catch (error) {
                results.failed.push({ requestId, reason: error.message });
            }
        }

        // Create summary audit log
        await this.createAuditLog({
            action: 'BULK_RESTORE',
            resource: 'checklist_request',
            actor: userId,
            actorRole: this.getUserRole({ ...req, user: { role: userRole } }),
            description: `Bulk restored ${results.successful.length} checklist requests from recycle bin (${results.failed.length} failed)`,
            status: results.failed.length === 0 ? 'success' : 'partial',
            metadata: {
                totalAttempted: requestIds.length,
                successfulCount: results.successful.length,
                failedCount: results.failed.length,
                successfulIds: results.successful.map(r => r.requestId),
                failedDetails: results.failed
            },
            req
        });

        return results;
    }

    // ==================== PERMANENT DELETE ====================
    async permanentDeleteRequest(requestId, userId, userRole, req = null) {
        if (!requestId || requestId === 'undefined') {
            throw new ValidationError('Valid request ID is required');
        }

        // Only super_admin can permanently delete
        if (userRole !== 'super_admin') {
            throw new AuthorizationError('Only super admin can permanently delete requests');
        }

        // Find request including deleted ones
        const request = await ChecklistRequest.findById(requestId).setOptions({ includeDeleted: true });

        if (!request) {
            throw new NotFoundError('Request not found');
        }

        // Store request data for audit log before deletion
        const requestData = {
            _id: request._id,
            checklistName: request.checklistName,
            status: request.status,
            urgencyLevel: request.urgencyLevel,
            wasDeleted: request.isDeleted,
            createdAt: request.createdAt,
            deletedAt: request.deletedAt,
            deletedBy: request.deletedBy
        };

        // Permanently delete from database
        await request.deleteOne();

        // Create audit log
        await this.createAuditLog({
            action: 'PERMANENT_DELETE',
            resource: 'checklist_request',
            resourceId: requestId,
            actor: userId,
            actorRole: this.getUserRole({ ...req, user: { role: userRole } }),
            description: `Permanently deleted checklist request "${request.checklistName}" from recycle bin`,
            status: 'success',
            metadata: {
                checklistName: request.checklistName,
                requestStatus: request.status,
                urgencyLevel: request.urgencyLevel,
                wasSoftDeleted: requestData.wasDeleted,
                createdAt: requestData.createdAt,
                deletedAt: requestData.deletedAt,
                deletedBy: requestData.deletedBy
            },
            req
        });

        return {
            message: 'Request permanently deleted successfully',
            deletedRequest: requestData
        };
    }

    // ==================== BULK PERMANENT DELETE ====================
    async bulkPermanentDeleteRequests(requestIds, userId, userRole, req = null) {
        if (!requestIds || !Array.isArray(requestIds) || requestIds.length === 0) {
            throw new ValidationError('Valid request IDs array is required');
        }

        // Only super_admin can bulk permanently delete
        if (userRole !== 'super_admin') {
            throw new AuthorizationError('Only super admin can permanently delete requests');
        }

        const results = {
            successful: [],
            failed: []
        };

        for (const requestId of requestIds) {
            try {
                const request = await ChecklistRequest.findById(requestId).setOptions({ includeDeleted: true });
                
                if (!request) {
                    results.failed.push({ requestId, reason: 'Request not found' });
                    continue;
                }
                
                const requestData = {
                    requestId: request._id,
                    checklistName: request.checklistName,
                    status: request.status,
                    wasDeleted: request.isDeleted
                };
                
                await request.deleteOne();
                
                results.successful.push(requestData);
                
                // Create individual audit log
                await this.createAuditLog({
                    action: 'BULK_PERMANENT_DELETE',
                    resource: 'checklist_request',
                    resourceId: requestId,
                    actor: userId,
                    actorRole: this.getUserRole({ ...req, user: { role: userRole } }),
                    description: `Permanently deleted checklist request "${request.checklistName}" as part of bulk operation`,
                    status: 'success',
                    metadata: {
                        checklistName: request.checklistName,
                        bulkOperation: true
                    },
                    req
                });
            } catch (error) {
                results.failed.push({ requestId, reason: error.message });
            }
        }

        // Create summary audit log
        await this.createAuditLog({
            action: 'BULK_PERMANENT_DELETE',
            resource: 'checklist_request',
            actor: userId,
            actorRole: this.getUserRole({ ...req, user: { role: userRole } }),
            description: `Bulk permanently deleted ${results.successful.length} checklist requests from recycle bin (${results.failed.length} failed)`,
            status: results.failed.length === 0 ? 'success' : 'partial',
            metadata: {
                totalAttempted: requestIds.length,
                successfulCount: results.successful.length,
                failedCount: results.failed.length,
                successfulIds: results.successful.map(r => r.requestId),
                failedDetails: results.failed
            },
            req
        });

        return results;
    }

    // ==================== REVIEW REQUEST ====================
    async reviewRequest(requestId, reviewerId, data, req = null) {
        const { status, rejectionReason, resultingChecklistId, resultingChecklistName, comments } = data;

        const validStatuses = ['approved', 'rejected', 'under_review', 'in_progress'];
        if (!status || !validStatuses.includes(status)) {
            throw new ValidationError(`Status must be one of: ${validStatuses.join(', ')}`);
        }

        const request = await ChecklistRequest.findById(requestId);

        if (!request) {
            throw new NotFoundError('Request not found');
        }

        if (request.isDeleted) {
            throw new BadRequestError('Cannot review a deleted request');
        }

        if (request.status === 'approved' || request.status === 'rejected') {
            throw new BadRequestError('This request has already been finalized and cannot be modified');
        }

        const previousStatus = request.status;

        request.status = status;
        request.reviewedBy = reviewerId;
        request.reviewedAt = new Date();
        request.reviewComments = comments || '';

        if (status === 'rejected') {
            if (!rejectionReason || !rejectionReason.trim()) {
                throw new ValidationError('Rejection reason is required when rejecting a request');
            }
            request.rejectionReason = rejectionReason.trim();
        } else {
            request.rejectionReason = null;
        }

        if (status === 'approved') {
            if (resultingChecklistId) {
                request.resultingChecklist = resultingChecklistId;
                request.resultingChecklistName = resultingChecklistName || null;
                request.createdChecklistId = resultingChecklistId;
                request.createdChecklistName = resultingChecklistName || null;
            }
        }

        if (previousStatus === 'pending' && request.requestDate) {
            const reviewDuration = (request.reviewedAt - request.requestDate) / (1000 * 60 * 60);
            request.timeToReview = Math.max(0, Math.round(reviewDuration));
        }

        await request.save();

        const populatedRequest = await ChecklistRequest.findById(requestId)
            .populate('reviewedBy', 'name email role')
            .populate('requestedBy', 'name email role')
            .populate('resultingChecklist', 'name version')
            .lean();

        // Create audit log for review action
        await this.createAuditLog({
            action: 'REVIEW',
            resource: 'checklist_request',
            resourceId: requestId,
            actor: reviewerId,
            actorRole: this.getUserRole(req),
            description: `Reviewed checklist request "${request.checklistName}" - Status changed from ${previousStatus} to ${status}`,
            status: 'success',
            changes: {
                old: {
                    status: previousStatus,
                    reviewedBy: request.reviewedBy,
                    reviewedAt: request.reviewedAt
                },
                new: {
                    status: status,
                    reviewedBy: reviewerId,
                    reviewedAt: new Date(),
                    ...(status === 'rejected' && { rejectionReason }),
                    ...(status === 'approved' && resultingChecklistId && {
                        resultingChecklistId,
                        resultingChecklistName
                    })
                }
            },
            metadata: {
                checklistName: request.checklistName,
                previousStatus,
                newStatus: status,
                reviewDurationHours: request.timeToReview,
                hasResultingChecklist: !!resultingChecklistId,
                reviewComments: comments || null
            },
            req
        });

        return populatedRequest;
    }

    // ==================== GET REQUEST STATISTICS ====================
    async getRequestStatistics(userId, userRole, req = null) {
        let query = { isDeleted: false };

        if (userRole !== 'super_admin' && userRole !== 'admin') {
            query.requestedBy = userId;
        }

        // Count only non-deleted for regular stats
        const [
            total,
            pending,
            approved,
            rejected,
            underReview,
            inProgress,
            deleted,
            urgencyBreakdown,
            categoryBreakdown,
            recentRequests,
            reviewTimeResult
        ] = await Promise.all([
            ChecklistRequest.countDocuments(query),
            ChecklistRequest.countDocuments({ ...query, status: 'pending' }),
            ChecklistRequest.countDocuments({ ...query, status: 'approved' }),
            ChecklistRequest.countDocuments({ ...query, status: 'rejected' }),
            ChecklistRequest.countDocuments({ ...query, status: 'under_review' }),
            ChecklistRequest.countDocuments({ ...query, status: 'in_progress' }),
            ChecklistRequest.countDocuments({ isDeleted: true }).setOptions({ includeDeleted: true }),
            ChecklistRequest.aggregate([
                { $match: query },
                { $group: { _id: '$urgencyLevel', count: { $sum: 1 } } }
            ]),
            ChecklistRequest.aggregate([
                { $match: query },
                { $group: { _id: '$category', count: { $sum: 1 } } }
            ]),
            ChecklistRequest.countDocuments({
                ...query,
                requestDate: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
            }),
            ChecklistRequest.aggregate([
                {
                    $match: {
                        ...query,
                        status: { $in: ['approved', 'rejected'] },
                        timeToReview: { $ne: null, $exists: true }
                    }
                },
                {
                    $group: {
                        _id: null,
                        averageHours: { $avg: '$timeToReview' },
                        minHours: { $min: '$timeToReview' },
                        maxHours: { $max: '$timeToReview' }
                    }
                }
            ])
        ]);

        const averageReviewTime = reviewTimeResult.length > 0
            ? Math.round(reviewTimeResult[0].averageHours)
            : 0;

        const approvalRate = total > 0
            ? parseFloat(((approved / total) * 100).toFixed(2))
            : 0;

        // Create audit log for statistics view
        await this.createAuditLog({
            action: 'VIEW_STATISTICS',
            resource: 'checklist_request',
            actor: userId,
            actorRole: this.getUserRole({ ...req, user: { role: userRole } }),
            description: `Retrieved checklist request statistics - Total: ${total}, Deleted: ${deleted}, Pending: ${pending}, Approved: ${approved}, Rejected: ${rejected}`,
            status: 'success',
            metadata: {
                total,
                deleted,
                pending,
                approved,
                rejected,
                underReview,
                inProgress,
                approvalRate,
                averageReviewTime,
                recentRequestsLast30Days: recentRequests
            },
            req
        });

        return {
            summary: {
                total,
                deleted,
                pending,
                approved,
                rejected,
                underReview,
                inProgress,
                activeTotal: total - deleted,
                completionRate: total > 0
                    ? parseFloat((((approved + rejected) / total) * 100).toFixed(2))
                    : 0,
                approvalRate
            },
            recentRequests: {
                last30Days: recentRequests,
                percentageChange: total > 0
                    ? parseFloat(((recentRequests / total) * 100).toFixed(2))
                    : 0
            },
            reviewMetrics: {
                averageReviewTimeHours: averageReviewTime,
                averageReviewTimeDays: (averageReviewTime / 24).toFixed(1),
                minReviewTimeHours: reviewTimeResult[0]?.minHours || 0,
                maxReviewTimeHours: reviewTimeResult[0]?.maxHours || 0
            },
            breakdowns: {
                byUrgency: urgencyBreakdown.reduce((acc, curr) => {
                    acc[curr._id] = curr.count;
                    return acc;
                }, { low: 0, medium: 0, high: 0, critical: 0 }),
                byCategory: categoryBreakdown.reduce((acc, curr) => {
                    acc[curr._id] = curr.count;
                    return acc;
                }, {})
            }
        };
    }

    // Legacy delete method - now uses soft delete
    async deleteRequest(requestId, userId, userRole, req = null) {
        return this.softDeleteRequest(requestId, userId, userRole, req);
    }
}

export default new ChecklistRequestService();