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
            message,
        } = data;

        // Validate required fields
        const requiredFields = ['checklistName', 'category', 'detailedDescription', 
                                'businessJustification', 'urgencyLevel'];
        const missingFields = requiredFields.filter(field => !data[field]);
        
        if (missingFields.length > 0) {
            throw new ValidationError(`Missing required fields: ${missingFields.join(', ')}`);
        }

        // Process uploaded files
        const referenceFiles = files && files.length > 0
            ? files.map(f => ({
                originalName: f.originalname,
                filePath: f.path || f.location,
                mimeType: f.mimetype,
                sizeBytes: f.size,
                uploadedAt: new Date(),
            }))
            : [];

        const request = await ChecklistRequest.create({
            checklistName,
            category,
            detailedDescription,
            businessJustification,
            urgencyLevel,
            expectedUsageFrequency: expectedUsageFrequency || 'as_needed',
            numberOfTeamMembers: numberOfTeamMembers ? parseInt(numberOfTeamMembers) : 0,
            referenceFiles,
            additionalNotes: additionalNotes || '',
            message: message || '',
            requestedBy: userId,
            status: 'pending',
        });

        return await request.populate('requestedBy', 'name email');
    }

    async getRequests(userId, userRole, filters = {}) {
        let query = {};
        
        // Filter by user role
        if (userRole !== 'super_admin') {
            query.requestedBy = userId;
        }
        
        // Apply filters
        if (filters.status) query.status = filters.status;
        if (filters.urgencyLevel) query.urgencyLevel = filters.urgencyLevel;
        if (filters.category) query.category = filters.category;
        
        // Search functionality
        if (filters.search) {
            query.$or = [
                { checklistName: { $regex: filters.search, $options: 'i' } },
                { category: { $regex: filters.search, $options: 'i' } }
            ];
        }
        
        // Date range filters
        if (filters.fromDate) {
            query.createdAt = { $gte: new Date(filters.fromDate) };
        }
        if (filters.toDate) {
            query.createdAt = { ...query.createdAt, $lte: new Date(filters.toDate) };
        }
        
        // Pagination
        const page = parseInt(filters.page) || 1;
        const limit = parseInt(filters.limit) || 10;
        const skip = (page - 1) * limit;
        
        const requests = await ChecklistRequest.find(query)
            .populate('requestedBy', 'name email')
            .populate('reviewedBy', 'name email')
            .populate('resultingChecklist', 'name type status')
            .sort('-createdAt')
            .skip(skip)
            .limit(limit);
        
        const total = await ChecklistRequest.countDocuments(query);
        
        return {
            requests,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        };
    }

    async getRequestById(requestId, userId, userRole) {
        const request = await ChecklistRequest.findById(requestId)
            .populate('requestedBy', 'name email')
            .populate('reviewedBy', 'name email')
            .populate('resultingChecklist', 'name type status');
        
        if (!request) {
            throw new NotFoundError('Request not found');
        }
        
        // Check permissions
        const canView = userRole === 'super_admin' || 
                       request.requestedBy._id.toString() === userId;
        
        if (!canView) {
            throw new AuthorizationError('You do not have permission to view this request');
        }
        
        return request;
    }

    async reviewRequest(requestId, reviewerId, data) {
        const { status, rejectionReason } = data;
        
        if (!['approved', 'rejected'].includes(status)) {
            throw new ValidationError('Status must be "approved" or "rejected"');
        }
        
        const request = await ChecklistRequest.findById(requestId);
        
        if (!request) {
            throw new NotFoundError('Request not found');
        }
        
        if (request.status !== 'pending') {
            throw new BadRequestError('This request has already been reviewed');
        }
        
        request.status = status;
        request.reviewedBy = reviewerId;
        request.reviewedAt = new Date();
        
        if (status === 'rejected') {
            if (!rejectionReason) {
                throw new ValidationError('Rejection reason is required when rejecting');
            }
            request.rejectionReason = rejectionReason;
        }
        
        if (status === 'approved') {
            // if (!resultingChecklistId) {
            //     throw new ValidationError('Resulting checklist ID is required when approving');
            // }
            
            // const checklist = await Checklist.findById(resultingChecklistId);
            // if (!checklist) {
            //     throw new NotFoundError('Resulting checklist not found');
            // }
            //request.resultingChecklist = resultingChecklistId;
        }
        
        await request.save();
        return await request
    }

    async deleteRequest(requestId, userId, userRole) {
        const request = await ChecklistRequest.findById(requestId);
        
        if (!request) {
            throw new NotFoundError('Request not found');
        }
        
        const canDelete = userRole === 'super_admin' || 
                         request.requestedBy.toString() === userId;
        
        if (!canDelete) {
            throw new AuthorizationError('You do not have permission to delete this request');
        }
        
        await request.deleteOne();
        return { message: 'Request deleted successfully' };
    }

    async getRequestStatistics(userId, userRole) {
        let query = {};
        
        if (userRole !== 'super_admin') {
            query.requestedBy = userId;
        }
        
        const total = await ChecklistRequest.countDocuments(query);
        const pending = await ChecklistRequest.countDocuments({ ...query, status: 'pending' });
        const approved = await ChecklistRequest.countDocuments({ ...query, status: 'approved' });
        const rejected = await ChecklistRequest.countDocuments({ ...query, status: 'rejected' });
        
        const urgencyBreakdown = await ChecklistRequest.aggregate([
            { $match: query },
            { $group: { _id: '$urgencyLevel', count: { $sum: 1 } } }
        ]);
        
        const categoryBreakdown = await ChecklistRequest.aggregate([
            { $match: query },
            { $group: { _id: '$category', count: { $sum: 1 } } }
        ]);
        
        // Recent requests (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const recentRequests = await ChecklistRequest.countDocuments({
            ...query,
            createdAt: { $gte: thirtyDaysAgo }
        });
        
        return {
            total,
            pending,
            approved,
            rejected,
            recentRequests,
            approvalRate: total > 0 ? ((approved / total) * 100).toFixed(2) : 0,
            urgencyBreakdown: urgencyBreakdown.reduce((acc, curr) => {
                acc[curr._id] = curr.count;
                return acc;
            }, {}),
            categoryBreakdown: categoryBreakdown.reduce((acc, curr) => {
                acc[curr._id] = curr.count;
                return acc;
            }, {})
        };
    }
}

export default new ChecklistRequestService();