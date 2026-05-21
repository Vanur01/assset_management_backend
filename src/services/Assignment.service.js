import Assignment from '../models/AssignedChecklist.model.js';
import Checklist from '../models/checklist.model.js';
import User from '../models/user.model.js';
import Asset from '../models/asset.model.js';
import ExcelJS from 'exceljs';
import {
  NotFoundError,
  AuthorizationError,
  ValidationError,
  BadRequestError,
} from '../errors/customError.js';

class AssignmentService {

  // ═══════════════════════════════════════════════════════════════
  //  CREATE ASSIGNMENTS
  // ═══════════════════════════════════════════════════════════════

  async assignChecklistToAdmin(assignedByUserId, assignedByRole, data) {
    const { checklistId, adminId, dueDate, priority, notes, assetIds = [] } = data;

    if (!checklistId || !adminId || !dueDate) {
      throw new BadRequestError('checklistId, adminId and dueDate are required');
    }

    const checklist = await Checklist.findById(checklistId);
    if (!checklist) throw new NotFoundError('Checklist not found');

    const admin = await User.findById(adminId);
    if (!admin || admin.role !== 'admin') throw new NotFoundError('Admin not found');

    const assets = await this._resolveAssets(assetIds);

    const assignment = await Assignment.create({
      checklist: checklistId,
      checklistName: checklist.name,
      checklistVersion: checklist.version,
      assignedBy: assignedByUserId,
      assignedByRole,
      assignedToAdmin: adminId,
      assignedToAdminName: admin.customerName || admin.name || admin.email,
      customerId: adminId,
      customerName: admin.customerName || admin.name || admin.email,
      customerEmail: admin.email,
      assets,
      dueDate: new Date(dueDate),
      priority: priority || 'medium',
      notes: notes || '',
      status: 'pending',
    });

    return assignment;
  }

  async assignChecklistToTeam(assignedByUserId, assignedByRole, data) {
    const { checklistId, teamMemberIds, assetIds = [], dueDate, priority, notes } = data;

    if (!checklistId || !dueDate) {
      throw new BadRequestError('checklistId and dueDate are required');
    }

    // Normalise to array and guard against empty
    const memberIdList = Array.isArray(teamMemberIds) ? teamMemberIds : [teamMemberIds];
    if (!memberIdList.length || memberIdList.some(id => !id)) {
      throw new BadRequestError('At least one valid teamMemberId is required');
    }

    const checklist = await Checklist.findById(checklistId);
    if (!checklist) throw new NotFoundError('Checklist not found');

    // Validate all members
    const teamMembers = [];
    for (const memberId of memberIdList) {
      const member = await User.findById(memberId);
      if (!member || member.role !== 'team') {
        throw new NotFoundError(`Team member not found or invalid role: ${memberId}`);
      }
      teamMembers.push({
        userId: member._id,
        name: member.name || member.email,
        status: 'pending',
        assignedAt: new Date(),
      });
    }

    const assets = await this._resolveAssets(assetIds);

    // Derive customer from first asset's admin
    let customerId = null;
    let customerName = null;
    for (const assetId of assetIds) {
      const asset = await Asset.findById(assetId);
      if (asset?.adminId && !customerId) {
        customerId = asset.adminId;
        const customer = await User.findById(customerId);
        customerName = customer?.customerName || customer?.name || null;
        break;
      }
    }

    const assignment = await Assignment.create({
      checklist: checklistId,
      checklistName: checklist.name,
      checklistVersion: checklist.version,
      assignedBy: assignedByUserId,
      assignedByRole,
      assignedToTeamMembers: teamMembers,
      customerId,
      customerName,
      assets,
      dueDate: new Date(dueDate),
      priority: priority || 'medium',
      notes: notes || '',
      status: 'pending',
    });

    return assignment;
  }

  // ═══════════════════════════════════════════════════════════════
  //  GET ASSIGNMENTS
  // ═══════════════════════════════════════════════════════════════

  async getAssignments(userId, userRole, filters = {}) {
    const query = this._buildAssignmentQuery(userId, userRole, filters);

    const page = Math.max(parseInt(filters.page) || 1, 1);
    const limit = Math.min(parseInt(filters.limit) || 20, 100);
    const skip = (page - 1) * limit;
    const sortField = filters.sortBy || 'createdAt';
    const sortOrder = filters.sortOrder === 'asc' ? 1 : -1;

    const [assignments, total] = await Promise.all([
      Assignment.find(query)
        .populate('checklist', 'name type category')
        .populate('assignedBy', 'name email role')
        .populate('assignedToAdmin', 'name email customerName')
        .populate('assignedToTeamMembers.userId', 'name email')
        .populate('assets.assetId', 'assetName tagNumber currentLocation')
        .sort({ [sortField]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean(),
      Assignment.countDocuments(query),
    ]);

    const stats = await this._getAssignmentStats(userId, userRole, filters);

    return {
      success: true,
      assignments,
      stats,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      },
    };
  }

  async getAssignmentById(assignmentId) {
    const assignment = await this._populateAssignment(
      await Assignment.findById(assignmentId)
    );
    if (!assignment) throw new NotFoundError('Assignment not found');
    return assignment;
  }

  async getAssignmentDetails(assignmentId, userId, userRole) {
    const assignment = await this.getAssignmentById(assignmentId);

    // Fetch full checklist sections separately
    const checklist = await Checklist.findById(assignment.checklist._id)
      .populate('createdBy', 'name email');

    return {
      ...assignment.toObject(),
      checklist: {
        ...assignment.checklist.toObject(),
        sections: checklist?.sections || [],
      },
    };
  }

  // Add this method to your AssignmentService class

async deleteSubmission(assignmentId, userId, userRole) {
  // Find the assignment
  const assignment = await Assignment.findById(assignmentId);
  if (!assignment) throw new NotFoundError('Assignment not found');

  // Check authorization (only admin/super_admin can delete)
  const isAuthorized = userRole === 'admin' || userRole === 'super_admin';
  if (!isAuthorized) {
    throw new AuthorizationError('Only administrators can delete submissions');
  }

  // Store submission info for response
  const submissionInfo = {
    id: assignment._id,
    checklistName: assignment.checklistName,
    submittedBy: assignment.assignedToTeamMembers[0]?.name || 'Unknown',
    submittedAt: assignment.submittedAt,
    status: assignment.submissionStatus,
  };

  // Hard delete the assignment
  await assignment.deleteOne();

  return {
    message: 'Submission deleted successfully',
    submission: submissionInfo,
  };
}

  // ═══════════════════════════════════════════════════════════════
  //  UPDATE & DELETE
  // ═══════════════════════════════════════════════════════════════

  async updateAssignment(assignmentId, userId, userRole, updateData) {
    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) throw new NotFoundError('Assignment not found');

    const canUpdate =
      userRole === 'super_admin' ||
      (userRole === 'admin' && assignment.assignedBy.toString() === userId.toString());

    if (!canUpdate) {
      throw new AuthorizationError('You do not have permission to update this assignment');
    }

    const allowedFields = ['dueDate', 'priority', 'notes', 'metadata'];
    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) assignment[field] = updateData[field];
    });

    await assignment.save();
    return this._populateAssignment(assignment);
  }

  async deleteAssignment(assignmentId, userId, userRole) {
    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) throw new NotFoundError('Assignment not found');

    const canDelete =
      userRole === 'super_admin' ||
      (userRole === 'admin' && assignment.assignedBy.toString() === userId.toString());

    if (!canDelete) {
      throw new AuthorizationError('You do not have permission to delete this assignment');
    }

    await assignment.deleteOne();
    return { message: 'Assignment deleted successfully' };
  }

  async clearAssignment(assignmentId, userId, userRole) {
    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) throw new NotFoundError('Assignment not found');

    const isTeamMember = assignment.assignedToTeamMembers.some(
      tm => tm.userId.toString() === userId.toString()
    );

    if (!isTeamMember && userRole !== 'admin' && userRole !== 'super_admin') {
      throw new AuthorizationError('You are not authorized to clear this checklist');
    }

    if (['approved', 'submitted'].includes(assignment.status)) {
      throw new BadRequestError(
        'Cannot clear an assignment that is already submitted or approved'
      );
    }

    assignment.responses = [];
    assignment.status = 'pending';
    assignment.isDraft = false;
    assignment.completionRate = 0;
    assignment.totalFieldsSnapshot = 0;
    assignment.submittedAt = null;
    assignment.completedAt = null;
    assignment.submissionStatus = null;

    // Reset team member statuses too
    assignment.assignedToTeamMembers.forEach(tm => {
      tm.status = 'pending';
      tm.completedAt = null;
    });

    await assignment.save();
    return this._populateAssignment(assignment);
  }

  // ═══════════════════════════════════════════════════════════════
  //  SUBMISSIONS
  // ═══════════════════════════════════════════════════════════════

  async getSubmissionsForChecklist(checklistId, userId, userRole, filters = {}) {
    const query = {
      checklist: checklistId,
      status: { $in: ['submitted', 'approved', 'rejected'] },
    };

    if (userRole === 'admin') {
      query.$or = [{ assignedBy: userId }, { assignedToAdmin: userId }];
    }

    const page = Math.max(parseInt(filters.page) || 1, 1);
    const limit = Math.min(parseInt(filters.limit) || 20, 100);
    const skip = (page - 1) * limit;
    const sortField = filters.sortBy || 'submittedAt';
    const sortOrder = filters.sortOrder === 'asc' ? 1 : -1;

    const [submissions, total] = await Promise.all([
      Assignment.find(query)
        .populate('assignedToTeamMembers.userId', 'name email')
        .populate('assets.assetId', 'assetName assetId tagNumber')
        .sort({ [sortField]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean(),
      Assignment.countDocuments(query),
    ]);

    return {
      submissions,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async reviewSubmission(assignmentId, userId, userRole, data) {
    const { action, rejectionReason, reviewComments } = data;

    if (!['approve', 'reject'].includes(action)) {
      throw new BadRequestError('Invalid action. Must be "approve" or "reject"');
    }

    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) throw new NotFoundError('Assignment not found');

    const canReview =
      userRole === 'super_admin' ||
      (userRole === 'admin' && assignment.assignedBy?.toString() === userId.toString());

    if (!canReview) {
      throw new AuthorizationError('You do not have permission to review this submission');
    }

    // FIX: accept both 'submitted' status OR 'pending_review' submissionStatus
    const isReviewable =
      assignment.status === 'submitted' ||
      assignment.submissionStatus === 'pending_review';

    if (!isReviewable) {
      throw new BadRequestError(
        'Only submitted inspections awaiting review can be actioned'
      );
    }

    if (action === 'approve') {
      assignment.status = 'approved';
      assignment.submissionStatus = 'approved';
    } else {
      if (!rejectionReason?.trim()) {
        throw new ValidationError(['Rejection reason is required when rejecting']);
      }
      assignment.status = 'rejected';
      assignment.submissionStatus = 'rejected';
      assignment.rejectionReason = rejectionReason.trim();
    }

    assignment.reviewedBy = userId;
    assignment.reviewedAt = new Date();
    assignment.reviewComments = reviewComments?.trim() || '';
    assignment.completedAt = new Date();

    await assignment.save();
    return this._populateAssignment(assignment);
  }

  // ═══════════════════════════════════════════════════════════════
  //  INSPECTION — Team Member actions
  // ═══════════════════════════════════════════════════════════════

  async submitInspection(assignmentId, userId, userRole, data, files) {
    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) throw new NotFoundError('Assignment not found');

    const isTeamMember = assignment.assignedToTeamMembers.some(
      tm => tm.userId.toString() === userId.toString()
    );

    if (!isTeamMember && userRole !== 'admin' && userRole !== 'super_admin') {
      throw new AuthorizationError('You are not authorized to submit this inspection');
    }

    if (['completed', 'approved'].includes(assignment.status)) {
      throw new BadRequestError('This inspection has already been completed or approved');
    }

    const { responses, overallRating, inspectorNotes, notes } = data;

    const checklist = await Checklist.findById(assignment.checklist);
    if (!checklist) throw new NotFoundError('Checklist not found');

    const totalFields = checklist.sections.reduce(
      (sum, s) => sum + (s.fields?.length || 0), 0
    );

    const processedResponses = this._processResponses(responses, checklist.sections);

    // FIX: store totalFields so pre-save can compute completion % correctly
    assignment.totalFieldsSnapshot = totalFields;
    assignment.responses = processedResponses;
    assignment.overallRating = overallRating ? parseInt(overallRating, 10) : null;
    assignment.inspectorNotes = inspectorNotes || '';
    assignment.notes = notes || assignment.notes || '';
    assignment.status = 'submitted';
    assignment.submissionStatus = 'pending_review';
    assignment.submittedAt = new Date();
    assignment.completedAt = new Date();
    assignment.isDraft = false;

    // Attach uploaded files
    if (files) {
      if (files.photos) {
        assignment.uploadedPhotos = files.photos.map(f => f.path || f.location);
      }
      if (files.signature?.[0]) {
        assignment.signaturePath = files.signature[0].path || files.signature[0].location;
      }
      if (files.attachments) {
        assignment.attachments = files.attachments.map(f => ({
          name: f.originalname,
          url: f.path || f.location,
          uploadedAt: new Date(),
        }));
      }
    }

    // Mark the submitting team member as completed
    const memberEntry = assignment.assignedToTeamMembers.find(
      tm => tm.userId.toString() === userId.toString()
    );
    if (memberEntry) {
      memberEntry.status = 'completed';
      memberEntry.completedAt = new Date();
    }

    await assignment.save();
    return this._populateAssignment(assignment);
  }

  async saveDraft(assignmentId, userId, data) {
    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) throw new NotFoundError('Assignment not found');

    const isTeamMember = assignment.assignedToTeamMembers.some(
      tm => tm.userId.toString() === userId.toString()
    );
    if (!isTeamMember) {
      throw new AuthorizationError('You are not authorized to save drafts for this assignment');
    }

    if (['submitted', 'approved', 'completed'].includes(assignment.status)) {
      throw new BadRequestError('Cannot save a draft for an already-submitted assignment');
    }

    const { responses, overallRating, inspectorNotes, notes } = data;

    const checklist = await Checklist.findById(assignment.checklist);

    if (responses && checklist) {
      const totalFields = checklist.sections.reduce(
        (sum, s) => sum + (s.fields?.length || 0), 0
      );
      assignment.totalFieldsSnapshot = totalFields;
      assignment.responses = this._processResponses(responses, checklist.sections);
    }

    if (overallRating !== undefined) assignment.overallRating = overallRating;
    if (inspectorNotes !== undefined) assignment.inspectorNotes = inspectorNotes;
    if (notes !== undefined) assignment.notes = notes;

    assignment.status = 'in_progress';
    assignment.isDraft = true;
    assignment.lastSavedAt = new Date();
    assignment.draftCount = (assignment.draftCount || 0) + 1;

    // Mark submitting member as in_progress
    const memberEntry = assignment.assignedToTeamMembers.find(
      tm => tm.userId.toString() === userId.toString()
    );
    if (memberEntry && memberEntry.status === 'pending') {
      memberEntry.status = 'in_progress';
    }

    await assignment.save();
    return assignment;
  }

  // ═══════════════════════════════════════════════════════════════
  //  INSPECTION HISTORY  (primary fix area)
  // ═══════════════════════════════════════════════════════════════

async getInspectionHistory(userId, userRole, filters = {}) {
  try {
    // Ensure userId is valid for database queries
    const isValidObjectId = (id) => {
      return id && mongoose.Types.ObjectId.isValid(id);
    };

    const {
      status,
      search,
      dateFrom,
      dateTo,
      page: rawPage = 1,
      limit: rawLimit = 20,
      sortBy = 'submittedAt',
      sortOrder = 'desc',
      customerId,
    } = filters;

    // ── Build DB query ──────────────────────────────────────────
    const query = {};

    // Only show completed/submitted inspections by default
    query.status = { $in: ['submitted', 'approved', 'rejected', 'completed'] };

    // Handle status filter
    if (status && status !== 'all' && status !== 'undefined') {
      const submissionStatuses = ['pending_review', 'approved', 'rejected', 'needs_revision'];
      if (submissionStatuses.includes(status)) {
        query.submissionStatus = status;
      } else {
        query.status = status;
      }
    }

    // Role-based scoping - only add userId to query if it's a valid ObjectId
    if (userRole === 'team') {
      if (isValidObjectId(userId)) {
        query['assignedToTeamMembers.userId'] = userId;
      }
    } else if (userRole === 'admin') {
      if (isValidObjectId(userId)) {
        query.$or = [
          { assignedBy: userId },
          { assignedToAdmin: userId },
          { customerId: userId },
        ];
      }
    } else if (userRole === 'super_admin' && customerId) {
      if (isValidObjectId(customerId)) {
        query.customerId = customerId;
      }
    }

    // Date range filter
    if (dateFrom || dateTo) {
      query.submittedAt = {};
      if (dateFrom) query.submittedAt.$gte = new Date(dateFrom);
      if (dateTo) query.submittedAt.$lte = new Date(dateTo);
    }

    // Search filter
    if (search && search.trim()) {
      const searchRegex = { $regex: search.trim(), $options: 'i' };
      const searchOr = [
        { checklistName: searchRegex },
        { customerName: searchRegex },
        { 'assets.assetName': searchRegex },
        { 'assets.assetTagNumber': searchRegex },
      ];
      
      if (query.$or) {
        query.$and = [{ $or: query.$or }, { $or: searchOr }];
        delete query.$or;
      } else {
        query.$or = searchOr;
      }
    }

    // ── Pagination ──────────────────────────────────────────────
    const page = Math.max(parseInt(rawPage, 10) || 1, 1);
    const limit = Math.min(parseInt(rawLimit, 10) || 20, 100);
    const skip = (page - 1) * limit;
    const sortDir = sortOrder === 'asc' ? 1 : -1;
    const sortField = sortBy === 'date' ? 'submittedAt' : sortBy;

    // ── Execute queries ─────────────────────────────────────────────────
    const [submissions, total] = await Promise.all([
      Assignment.find(query)
        .populate('checklist', 'name type category')
        .populate('assignedBy', 'name email')
        .populate('assignedToTeamMembers.userId', 'name email')
        .populate('assets.assetId', 'assetName assetId tagNumber currentLocation')
        .populate('reviewedBy', 'name email')
        .sort({ [sortField]: sortDir, _id: sortDir })
        .skip(skip)
        .limit(limit)
        .lean(),
      Assignment.countDocuments(query),
    ]);

    // ── Aggregate stats ───────────────────────────────────────────────
    const statsAgg = await Assignment.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          approved: { $sum: { $cond: [{ $eq: ['$submissionStatus', 'approved'] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ['$submissionStatus', 'rejected'] }, 1, 0] } },
          underReview: { $sum: { $cond: [{ $eq: ['$submissionStatus', 'pending_review'] }, 1, 0] } },
          needsRevision: { $sum: { $cond: [{ $eq: ['$submissionStatus', 'needs_revision'] }, 1, 0] } },
          avgScore: { $avg: '$completionRate' },
        },
      },
    ]);

    const aggResult = statsAgg[0] || {};
    const avgScore = aggResult.avgScore != null ? Math.round(aggResult.avgScore) : 0;

    return {
      success: true,
      message: 'Inspection history retrieved successfully',
      submissions,
      stats: {
        total: aggResult.total || 0,
        approved: aggResult.approved || 0,
        rejected: aggResult.rejected || 0,
        underReview: aggResult.underReview || 0,
        needsRevision: aggResult.needsRevision || 0,
        avgScore,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      },
    };
  } catch (error) {
    console.error('Error in getInspectionHistory:', error);
    throw error;
  }
}

  // ═══════════════════════════════════════════════════════════════
  //  LISTS & VIEWS
  // ═══════════════════════════════════════════════════════════════

  async getAssignees(checklistId, userId, userRole) {
    const query = { checklist: checklistId };

    if (userRole === 'admin') {
      query.$or = [{ assignedBy: userId }, { assignedToAdmin: userId }];
    }

    const assignments = await Assignment.find(query)
      .populate('assignedToTeamMembers.userId', 'name email')
      .populate('assignedToAdmin', 'name email customerName')
      .lean();

    const userMap = new Map();

    assignments.forEach(a => {
      (a.assignedToTeamMembers || []).forEach(tm => {
        if (!tm.userId) return;
        const id = (tm.userId._id ?? tm.userId).toString();
        if (!userMap.has(id)) {
          userMap.set(id, { user: tm.userId, role: 'team_member', assignments: [] });
        }
        userMap.get(id).assignments.push(a);
      });

      if (a.assignedToAdmin) {
        const id = (a.assignedToAdmin._id ?? a.assignedToAdmin).toString();
        if (!userMap.has(id)) {
          userMap.set(id, { user: a.assignedToAdmin, role: 'admin', assignments: [] });
        }
        userMap.get(id).assignments.push(a);
      }
    });

    return Array.from(userMap.values());
  }

  async getCalendarTasks(userId, userRole, filters = {}) {
    const query = this._buildAssignmentQuery(userId, userRole, filters);
    query.status = { $in: ['pending', 'in_progress'] };
    // FIX: only include docs that have a dueDate
    query.dueDate = { ...(query.dueDate || {}), $ne: null };

    const assignments = await Assignment.find(query)
      .populate('checklist', 'name')
      .populate('assets.assetId', 'assetName assetId')
      .lean();

    const calendarMap = new Map();

    assignments.forEach(a => {
      if (!a.dueDate) return;                          // safety guard
      const dateKey = new Date(a.dueDate).toISOString().split('T')[0];
      if (!calendarMap.has(dateKey)) calendarMap.set(dateKey, []);

      calendarMap.get(dateKey).push({
        id: a._id,
        title: a.checklistName || a.checklist?.name,
        assets: (a.assets || []).map(asset => asset.assetName).filter(Boolean),
        priority: a.priority,
        status: a.status,
        dueDate: a.dueDate,
        completionRate: a.completionRate,
      });
    });

    return Array.from(calendarMap.entries())
      .map(([date, tasks]) => ({ date, tasks, count: tasks.length }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  // ═══════════════════════════════════════════════════════════════
  //  ANALYTICS & STATISTICS
  // ═══════════════════════════════════════════════════════════════

  async getChecklistAnalytics(checklistId, userId, userRole, filters = {}) {
    const query = { checklist: checklistId };

    if (userRole === 'admin') {
      query.$or = [{ assignedBy: userId }, { assignedToAdmin: userId }];
    }

    const { dateRange = 30 } = filters;
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - parseInt(dateRange, 10));
    query.submittedAt = { $gte: fromDate };

    const assignments = await Assignment.find(query)
      .populate('assignedToTeamMembers.userId', 'name')
      .lean();

    const completed = assignments.filter(a => ['submitted', 'approved'].includes(a.status));
    const total = assignments.length;
    const totalResponses = completed.length;

    const completionRate = total > 0 ? Math.round((totalResponses / total) * 100) : 0;
    const approved = completed.filter(a => a.submissionStatus === 'approved').length;
    const rejected = completed.filter(a => a.submissionStatus === 'rejected').length;
    const pendingReview = completed.filter(a => a.submissionStatus === 'pending_review').length;
    const approvalRate = totalResponses > 0 ? Math.round((approved / totalResponses) * 100) : 0;

    const completionTimes = completed
      .filter(a => a.submittedAt && a.createdAt)
      .map(a => (new Date(a.submittedAt) - new Date(a.createdAt)) / (1000 * 60));

    const avgCompletionTime = completionTimes.length > 0
      ? (completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length).toFixed(1)
      : 0;

    const trendMap = new Map();
    completed.forEach(a => {
      if (a.submittedAt) {
        const day = new Date(a.submittedAt).toISOString().split('T')[0];
        trendMap.set(day, (trendMap.get(day) || 0) + 1);
      }
    });

    const submissionTrend = Array.from(trendMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Performer stats from assignedToTeamMembers
    const performerMap = new Map();
    completed.forEach(a => {
      (a.assignedToTeamMembers || []).forEach(tm => {
        if (!tm.userId) return;
        const memberId = (tm.userId._id ?? tm.userId).toString();
        const memberName = tm.name || 'Unknown';
        if (!performerMap.has(memberId)) {
          performerMap.set(memberId, { name: memberName, submissions: 0, totalScore: 0 });
        }
        const perf = performerMap.get(memberId);
        perf.submissions += 1;
        perf.totalScore += a.completionRate || 0;
      });
    });

    const topPerformers = Array.from(performerMap.values())
      .map(p => ({
        name: p.name,
        submissions: p.submissions,
        score: p.submissions > 0 ? Math.round(p.totalScore / p.submissions) : 0,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    return {
      summary: {
        totalAssignments: total,
        totalResponses,
        completionRate,
        approvalRate,
        approved,
        rejected,
        pendingReview,
        avgCompletionTime: parseFloat(avgCompletionTime),
      },
      submissionTrend,
      topPerformers,
      statusDistribution: [
        {
          label: 'Approved',
          value: approved,
          percentage: totalResponses > 0 ? Math.round((approved / totalResponses) * 100) : 0,
        },
        {
          label: 'Rejected',
          value: rejected,
          percentage: totalResponses > 0 ? Math.round((rejected / totalResponses) * 100) : 0,
        },
        {
          label: 'Pending Review',
          value: pendingReview,
          percentage: totalResponses > 0 ? Math.round((pendingReview / totalResponses) * 100) : 0,
        },
      ],
    };
  }

  async getOverallStatistics(userId, userRole) {
    const query = this._buildAssignmentQuery(userId, userRole, {});

    const [total, pending, inProgress, completed, overdue, approved, rejected, averageRatingAgg] =
      await Promise.all([
        Assignment.countDocuments(query),
        Assignment.countDocuments({ ...query, status: 'pending' }),
        Assignment.countDocuments({ ...query, status: 'in_progress' }),
        Assignment.countDocuments({ ...query, status: 'completed' }),
        Assignment.countDocuments({ ...query, status: 'overdue' }),
        Assignment.countDocuments({ ...query, submissionStatus: 'approved' }),
        Assignment.countDocuments({ ...query, submissionStatus: 'rejected' }),
        Assignment.aggregate([
          { $match: { ...query, overallRating: { $ne: null } } },
          { $group: { _id: null, avg: { $avg: '$overallRating' } } },
        ]),
      ]);

    return {
      total,
      pending,
      inProgress,
      completed,
      overdue,
      approved,
      rejected,
      completionRate: total > 0 ? ((completed / total) * 100).toFixed(2) : '0.00',
      averageRating: averageRatingAgg[0]?.avg?.toFixed(2) || '0.00',
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  EXPORT
  // ═══════════════════════════════════════════════════════════════

  async exportAssignments(userId, userRole, filters = {}) {
    const query = this._buildAssignmentQuery(userId, userRole, filters);

    const assignments = await Assignment.find(query)
      .populate('checklist', 'name type category')
      .populate('assignedToTeamMembers.userId', 'name email')
      .populate('assets.assetId', 'assetName assetId tagNumber')
      .lean();

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Assignments');

    worksheet.columns = [
      { header: 'Form Name', key: 'formName', width: 30 },
      { header: 'Assigned To (Team)', key: 'assignedTo', width: 30 },
      { header: 'Assets', key: 'assets', width: 30 },
      { header: 'Due Date', key: 'dueDate', width: 15 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Submission Status', key: 'submissionStatus', width: 18 },
      { header: 'Completion Rate', key: 'completionRate', width: 15 },
      { header: 'Submitted At', key: 'submittedAt', width: 20 },
      { header: 'Priority', key: 'priority', width: 10 },
    ];

    // Style header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

    assignments.forEach(a => {
      const teamNames = (a.assignedToTeamMembers || [])
        .map(tm => tm.userId?.name || tm.name || '')
        .filter(Boolean)
        .join(', ');

      const assetNames = (a.assets || [])
        .map(asset => asset.assetName || '')
        .filter(Boolean)
        .join(', ');

      worksheet.addRow({
        formName: a.checklistName || a.checklist?.name || '-',
        assignedTo: teamNames || a.customerName || '-',
        assets: assetNames || '-',
        dueDate: a.dueDate ? new Date(a.dueDate).toISOString().split('T')[0] : '-',
        status: a.status || '-',
        submissionStatus: a.submissionStatus || '-',
        completionRate: `${Math.round(a.completionRate || 0)}%`,
        submittedAt: a.submittedAt ? new Date(a.submittedAt).toISOString().split('T')[0] : '-',
        priority: a.priority || '-',
      });
    });

    return workbook;
  }

  // ═══════════════════════════════════════════════════════════════
  //  PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Build a MongoDB query scoped to the requesting user's role.
   * FIX: search $or is merged safely using $and so it never clobbers
   *      the role-based $or already in the query.
   */
  _buildAssignmentQuery(userId, userRole, filters) {
    const query = {};
    const { status, priority, checklistId, search, dateFrom, dateTo, customerId, assetId } = filters;

    // Role-based scoping
    if (userRole === 'super_admin') {
      if (customerId) query.customerId = customerId;
    } else if (userRole === 'admin') {
      query.$or = [
        { assignedBy: userId },
        { assignedToAdmin: userId },
        { customerId: userId },
      ];
    } else if (userRole === 'team') {
      query['assignedToTeamMembers.userId'] = userId;
    }

    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (checklistId) query.checklist = checklistId;
    if (assetId) query['assets.assetId'] = assetId;

    if (dateFrom || dateTo) {
      query.dueDate = {};
      if (dateFrom) query.dueDate.$gte = new Date(dateFrom);
      if (dateTo) query.dueDate.$lte = new Date(dateTo);
    }

    // FIX: merge search $or with role $or using $and
    if (search) {
      const searchRegex = { $regex: search, $options: 'i' };
      const searchOr = [
        { customerName: searchRegex },
        { checklistName: searchRegex },
        { 'assets.assetName': searchRegex },
        { 'assets.assetTagNumber': searchRegex },
      ];

      if (query.$or) {
        query.$and = [{ $or: query.$or }, { $or: searchOr }];
        delete query.$or;
      } else {
        query.$or = searchOr;
      }
    }

    return query;
  }

  /**
   * Stats counts scoped to the same filters as the listing query.
   * FIX: rebuilds the query instead of spreading a potentially status-keyed object.
   */
  async _getAssignmentStats(userId, userRole, filters) {
    // Build base query without status filter for cross-status counts
    const baseFilters = { ...filters };
    delete baseFilters.status;
    const baseQuery = this._buildAssignmentQuery(userId, userRole, baseFilters);

    const [total, pending, inProgress, completed, overdue, approved, rejected] =
      await Promise.all([
        Assignment.countDocuments(baseQuery),
        Assignment.countDocuments({ ...baseQuery, status: 'pending' }),
        Assignment.countDocuments({ ...baseQuery, status: 'in_progress' }),
        Assignment.countDocuments({ ...baseQuery, status: 'completed' }),
        Assignment.countDocuments({ ...baseQuery, status: 'overdue' }),
        Assignment.countDocuments({ ...baseQuery, submissionStatus: 'approved' }),
        Assignment.countDocuments({ ...baseQuery, submissionStatus: 'rejected' }),
      ]);

    return { total, pending, inProgress, completed, overdue, approved, rejected };
  }

  /** Resolve an array of assetIds to embedded asset sub-documents. */
  async _resolveAssets(assetIds = []) {
    const assets = [];
    for (const assetId of assetIds) {
      const asset = await Asset.findById(assetId);
      if (asset) {
        assets.push({
          assetId: asset._id,
          assetName: asset.assetName || asset.assetId,
          assetTagNumber: asset.tagNumber,
          assetLocation: asset.currentLocation,
          assetCategory: asset.assetCategory,
          assignedAt: new Date(),
        });
      }
    }
    return assets;
  }

  /**
   * Map raw response payloads to the stored fieldResponse sub-documents.
   * Unknown fieldIds are stored with null label/type so data isn't lost.
   */
  _processResponses(responses = [], sections = []) {
    const fieldMap = new Map();
    (sections || []).forEach(section => {
      (section.fields || []).forEach(field => {
        fieldMap.set(field._id.toString(), field);
      });
    });

    return responses.map(r => {
      const field = fieldMap.get(r.fieldId?.toString());
      return {
        fieldId: r.fieldId,
        label: field?.label || null,
        fieldType: field?.fieldType || null,
        value: r.value,
        filePaths: r.filePaths || [],
        answeredAt: new Date(),
      };
    });
  }

  /** Populate all reference paths on an assignment document. */
  async _populateAssignment(assignment) {
    if (!assignment) return null;
    return Assignment.findById(assignment._id)
      .populate('checklist', 'name type category totalFields sections status')
      .populate('assignedBy', 'name email role')
      .populate('assignedToAdmin', 'name email customerName')
      .populate('assignedToTeamMembers.userId', 'name email role')
      .populate('assets.assetId', 'assetName assetId tagNumber currentLocation assetCategory')
      .populate('customerId', 'name email customerName')
      .populate('reviewedBy', 'name email');
  }
}

export default new AssignmentService();