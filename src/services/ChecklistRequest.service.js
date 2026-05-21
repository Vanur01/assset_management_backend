import ChecklistRequest from '../models/Checklistrequest.model.js';
import {
    NotFoundError,
    AuthorizationError,
    ValidationError,
    BadRequestError
} from '../errors/customError.js';

class ChecklistRequestService {
    async createRequest(userId, data, files) {
        const {
            checklistName,
            category,
            detailedDescription,
            businessJustification,
            urgencyLevel,
            expectedUsageFrequency,
            numberOfTeamMembers,
            additionalNotes,
        } = data;

        // Validate required fields
        const requiredFields = ['checklistName', 'category', 'detailedDescription',
            'businessJustification', 'urgencyLevel'];
        const missingFields = requiredFields.filter(field => !data[field]);

        if (missingFields.length > 0) {
            throw new ValidationError(`Missing required fields: ${missingFields.join(', ')}`);
        }

        // Validate urgency level
        const validUrgencyLevels = ['low', 'medium', 'high', 'critical'];
        if (urgencyLevel && !validUrgencyLevels.includes(urgencyLevel)) {
            throw new ValidationError(`Invalid urgency level. Must be one of: ${validUrgencyLevels.join(', ')}`);
        }

        // Process uploaded files (array of files)
        const referenceFiles = files && files.length > 0
            ? files.map(file => ({
                originalName: file.originalname,
                filePath: `http://localhost:9001/uploads/checklist-requests/${file.filename}`,
                mimeType: file.mimetype,
                sizeBytes: file.size,
                uploadedAt: new Date(),
            }))
            : [];

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
            requestedBy: userId,
            requestDate: new Date(),
            status: 'pending',
        });

        const populatedRequest = await ChecklistRequest.findById(request._id)
            .populate('requestedBy', 'name email role');

        return populatedRequest._doc;
    }

    async getRequests(userId, userRole, filters = {}) {
        let query = {};

        // Filter by user role
        if (userRole !== 'super_admin') {
            query.requestedBy = userId;
        }

        // Apply filters
        if (filters.status) {
            const validStatuses = ['pending', 'approved', 'rejected', 'under_review', 'in_progress'];
            if (validStatuses.includes(filters.status)) {
                query.status = filters.status;
            }
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

        // Search functionality
        if (filters.search && filters.search.trim()) {
            const searchTerm = filters.search.trim();
            query.$or = [
                { checklistName: { $regex: searchTerm, $options: 'i' } },
                { category: { $regex: searchTerm, $options: 'i' } },
                { detailedDescription: { $regex: searchTerm, $options: 'i' } },
                { businessJustification: { $regex: searchTerm, $options: 'i' } }
            ];
        }

        // Date range filters
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

        // Pagination
        const page = Math.max(1, parseInt(filters.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(filters.limit) || 10));
        const skip = (page - 1) * limit;

        // Sorting
        const sortField = filters.sortBy || 'createdAt';
        const sortOrder = filters.sortOrder === 'asc' ? 1 : -1;
        const sort = { [sortField]: sortOrder };

        const [requests, total] = await Promise.all([
            ChecklistRequest.find(query)
                .populate('requestedBy', 'name email role')
                .populate('reviewedBy', 'name email role')
                .populate('resultingChecklist', 'name version')
                .sort(sort)
                .skip(skip)
                .limit(limit)
                .lean(),
            ChecklistRequest.countDocuments(query)
        ]);

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
                dateRange: {
                    from: filters.fromDate || null,
                    to: filters.toDate || null
                }
            }
        };
    }

    async getRequestById(requestId, userId, userRole) {
        // Validate requestId
        if (!requestId || requestId === 'undefined') {
            throw new ValidationError('Valid request ID is required');
        }

        const request = await ChecklistRequest.findById(requestId)
            .populate('requestedBy', 'name email role')
            .populate('reviewedBy', 'name email role')
            .populate('resultingChecklist', 'name version category')
            .populate('createdChecklistId', 'name version category')
            .lean();

        if (!request) {
            throw new NotFoundError('Request not found');
        }

        // Check permissions - Allow super_admin, admin, or the request owner
        const canView = userRole === 'super_admin' ||
            userRole === 'admin' ||
            (request.requestedBy && request.requestedBy._id.toString() === userId);

        if (!canView) {
            throw new AuthorizationError('You do not have permission to view this request');
        }

        return request;
    }

    async reviewRequest(requestId, reviewerId, data) {
        const { status, rejectionReason, resultingChecklistId, resultingChecklistName } = data;

        const validStatuses = ['approved', 'rejected', 'under_review', 'in_progress'];
        if (!status || !validStatuses.includes(status)) {
            throw new ValidationError(`Status must be one of: ${validStatuses.join(', ')}`);
        }

        const request = await ChecklistRequest.findById(requestId);

        if (!request) {
            throw new NotFoundError('Request not found');
        }

        // Check if request is already finalized
        if (request.status === 'approved' || request.status === 'rejected') {
            throw new BadRequestError('This request has already been finalized and cannot be modified');
        }

        // Store previous status for tracking
        const previousStatus = request.status;

        // Update request
        request.status = status;
        request.reviewedBy = reviewerId;
        request.reviewedAt = new Date();

        // Handle rejection
        if (status === 'rejected') {
            if (!rejectionReason || !rejectionReason.trim()) {
                throw new ValidationError('Rejection reason is required when rejecting a request');
            }
            request.rejectionReason = rejectionReason.trim();
        } else {
            // Clear rejection reason if not rejecting
            request.rejectionReason = null;
        }

        // Handle approval with resulting checklist
        if (status === 'approved') {
            if (resultingChecklistId) {
                request.resultingChecklist = resultingChecklistId;
                request.resultingChecklistName = resultingChecklistName || null;

                // Also set deprecated fields for backward compatibility
                request.createdChecklistId = resultingChecklistId;
                request.createdChecklistName = resultingChecklistName || null;
            }
        }

        // Calculate time to review if moving from pending
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

        return populatedRequest;
    }

    async deleteRequest(requestId, userId, userRole) {
        if (!requestId || requestId === 'undefined') {
            throw new ValidationError('Valid request ID is required');
        }

        const request = await ChecklistRequest.findById(requestId);

        if (!request) {
            throw new NotFoundError('Request not found');
        }

        const canDelete = userRole === 'super_admin' ||
            (request.requestedBy && request.requestedBy.toString() === userId);

        if (!canDelete) {
            throw new AuthorizationError('You do not have permission to delete this request');
        }

        // Prevent deletion of approved/rejected requests for non-super admins
        if (userRole !== 'super_admin' && ['approved', 'rejected'].includes(request.status)) {
            throw new AuthorizationError('Cannot delete finalized requests');
        }

        await request.deleteOne();

        return {
            message: 'Request deleted successfully',
            deletedRequestId: requestId
        };
    }

    async getRequestStatistics(userId, userRole) {
        let query = {};

        if (userRole !== 'super_admin') {
            query.requestedBy = userId;
        }

        const [
            total,
            pending,
            approved,
            rejected,
            underReview,
            inProgress,
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

        return {
            summary: {
                total,
                pending,
                approved,
                rejected,
                underReview,
                inProgress,
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

}

export default new ChecklistRequestService();