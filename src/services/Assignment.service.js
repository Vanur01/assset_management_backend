import Assignment from '../models/AssignedChecklist.model.js';
import Checklist from '../models/checklist.model.js';
import User from '../models/user.model.js';
import Asset from '../models/asset.model.js';
import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import {
  NotFoundError,
  AuthorizationError,
  ValidationError,
  BadRequestError
} from '../errors/customError.js';

class AssignmentService {

  // ==================== CREATE ASSIGNMENTS ====================

  // Super Admin assigns checklist to Admin (Customer)
  async assignChecklistToAdmin(assignedByUserId, assignedByRole, data) {
    const { checklistId, adminId, dueDate, priority, notes, assetId } = data;

    const checklist = await Checklist.findById(checklistId);
    if (!checklist) throw new NotFoundError('Checklist not found');

    const admin = await User.findById(adminId);
    if (!admin || admin.role !== 'admin') throw new NotFoundError('Admin not found');

    let assetDetails = null;
    if (assetId) {
      const asset = await Asset.findById(assetId);
      if (asset) {
        assetDetails = {
          assetId: asset.assetId,
          tagNumber: asset.tagNumber,
          location: asset.currentLocation,
          category: asset.assetCategory
        };
      }
    }

    const assignment = await Assignment.create({
      checklist: checklistId,
      assignedBy: assignedByUserId,
      assignedByRole,
      assignedToAdmin: adminId,
      customerId: adminId,
      customerName: admin.customerName || admin.name || admin.email,
      assetId: assetId || null,
      assetName: assetDetails?.assetId || null,
      assetDetails,
      dueDate: new Date(dueDate),
      priority: priority || 'medium',
      adminNotes: notes || '',
      status: 'pending'
    });

    return await this.populateAssignment(assignment);
  }

  // Admin assigns checklist to Team Member
  async assignChecklistToTeam(assignedByUserId, assignedByRole, data) {
    const { checklistId, primaryMemberId, secondaryMemberId, assetId, dueDate, priority, notes } = data;

    const checklist = await Checklist.findById(checklistId);
    if (!checklist) throw new NotFoundError('Checklist not found');

    const primaryMember = await User.findById(primaryMemberId);
    if (!primaryMember || primaryMember.role !== 'team') throw new NotFoundError('Team member not found');

    let assetDetails = null;
    let customerId = null;
    let customerName = null;

    if (assetId) {
      const asset = await Asset.findById(assetId);
      if (asset) {
        assetDetails = {
          assetId: asset.assetId,
          tagNumber: asset.tagNumber,
          location: asset.currentLocation,
          category: asset.assetCategory
        };
        customerId = asset.adminId;
        const customer = await User.findById(customerId);
        customerName = customer?.customerName || customer?.name;
      }
    }

    const assignment = await Assignment.create({
      checklist: checklistId,
      assignedBy: assignedByUserId,
      assignedByRole,
      primaryMember: primaryMemberId,
      secondaryMember: secondaryMemberId || null,
      customerId,
      customerName,
      assetId: assetId || null,
      assetName: assetDetails?.assetId || null,
      assetDetails,
      dueDate: new Date(dueDate),
      priority: priority || 'medium',
      adminNotes: notes || '',
      status: 'pending'
    });

    return await this.populateAssignment(assignment);
  }

  // ==================== GET ASSIGNMENTS (Role-based) ====================

  async getAssignments(userId, userRole, filters = {}) {
    let query = this.buildAssignmentQuery(userId, userRole, filters);

    const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = filters;
    const skip = (page - 1) * limit;
    const sortOptions = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const [assignments, total] = await Promise.all([
      Assignment.find(query)
        .populate('checklist', 'name type category totalFields sections status')
        .populate('assignedBy', 'name email role')
        .populate('assignedToAdmin', 'name email customerName')
        .populate('primaryMember', 'name email')
        .populate('secondaryMember', 'name email')
        .populate('customerId', 'name email customerName')
        .populate('assetId', 'assetName assetId tagNumber currentLocation')
        .populate('reviewedBy', 'name email')
        .sort(sortOptions)
        .skip(skip)
        .limit(limit)
        .lean(),
      Assignment.countDocuments(query)
    ]);

    // Calculate stats
    const stats = await this.getAssignmentStats(query);

    return {
      assignments,
      stats,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1
      }
    };
  }

  buildAssignmentQuery(userId, userRole, filters) {
    const query = {};
    const { status, priority, checklistId, search, dateFrom, dateTo, customerId, assetId } = filters;

    if (userRole === 'super_admin') {
      // Super Admin sees all assignments
      if (customerId) query.customerId = customerId;
    }
    else if (userRole === 'admin') {
      // Admin sees assignments they created AND assignments assigned to them
      query.$or = [
        { assignedBy: userId },
        { assignedToAdmin: userId },
        { customerId: userId }
      ];
    }
    else if (userRole === 'team') {
      // Team member sees only their own assignments
      query.$or = [
        { primaryMember: userId },
        { secondaryMember: userId }
      ];
    }

    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (checklistId) query.checklist = checklistId;
    if (assetId) query.assetId = assetId;

    if (dateFrom || dateTo) {
      query.dueDate = {};
      if (dateFrom) query.dueDate.$gte = new Date(dateFrom);
      if (dateTo) query.dueDate.$lte = new Date(dateTo);
    }

    if (search) {
      query.$or = [
        { customerName: { $regex: search, $options: 'i' } },
        { assetName: { $regex: search, $options: 'i' } },
        { 'assetDetails.assetId': { $regex: search, $options: 'i' } }
      ];
    }

    return query;
  }

  async getAssignmentStats(query) {
    const [
      total,
      pending,
      inProgress,
      completed,
      overdue,
      approved,
      rejected
    ] = await Promise.all([
      Assignment.countDocuments(query),
      Assignment.countDocuments({ ...query, status: 'pending' }),
      Assignment.countDocuments({ ...query, status: 'in_progress' }),
      Assignment.countDocuments({ ...query, status: 'completed' }),
      Assignment.countDocuments({ ...query, status: 'overdue' }),
      Assignment.countDocuments({ ...query, submissionStatus: 'approved' }),
      Assignment.countDocuments({ ...query, submissionStatus: 'rejected' })
    ]);

    return { total, pending, inProgress, completed, overdue, approved, rejected };
  }

  // ==================== GET SINGLE ASSIGNMENT ====================

  async getAssignmentById(assignmentId) {
    const assignment = await this.populateAssignment(await Assignment.findById(assignmentId));
    if (!assignment) throw new NotFoundError('Assignment not found');
    return assignment;
  }

  async getAssignmentDetails(assignmentId, userId, userRole) {
    console.log("id761....", assignmentId)
    const assignment = await this.getAssignmentById(assignmentId);
    // Get full checklist details with sections
    const checklist = await Checklist.findById(assignment.checklist._id)
      .populate('createdBy', 'name email');

    return {
      ...assignment,
      checklist: {
        ...assignment.checklist,
        sections: checklist?.sections || []
      }
    };
  }

  // ==================== UPDATE ASSIGNMENT ====================

  async updateAssignment(assignmentId, userId, userRole, updateData) {
    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) throw new NotFoundError('Assignment not found');

    const canUpdate = (userRole === 'super_admin') ||
      (userRole === 'admin' && assignment.assignedBy.toString() === userId);

    if (!canUpdate) throw new AuthorizationError('You do not have permission to update this assignment');

    const allowedFields = ['dueDate', 'priority', 'adminNotes', 'tags'];
    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        assignment[field] = updateData[field];
      }
    });

    await assignment.save();
    return await this.populateAssignment(assignment);
  }

  // ==================== DELETE ASSIGNMENT ====================

  async deleteAssignment(assignmentId, userId, userRole) {
    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) throw new NotFoundError('Assignment not found');

    const canDelete = (userRole === 'super_admin') ||
      (userRole === 'admin' && assignment.assignedBy.toString() === userId);

    if (!canDelete) throw new AuthorizationError('You do not have permission to delete this assignment');

    await assignment.deleteOne();
    return { message: 'Assignment deleted successfully' };
  }

  // ==================== SUBMIT INSPECTION (Team Member) ====================

  async submitInspection(assignmentId, userId, userRole, data, files) {
    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) throw new NotFoundError('Assignment not found');

  const isAssigned = assignment.primaryMember?.toString() === userId.toString() ||
  assignment.secondaryMember?.toString() === userId.toString();

    if (!isAssigned && userRole !== 'admin' && userRole !== 'super_admin') {
      throw new AuthorizationError('You are not authorized to submit this inspection');
    }

    if (assignment.status === 'completed' || assignment.status === 'approved') {
      throw new BadRequestError('This inspection has already been completed');
    }


    const { responses, overallRating, inspectorNotes, additionalNotes } = data;
    const checklist = await Checklist.findById(assignment.checklist);

    if (!checklist) throw new NotFoundError('Checklist not found');

    const processedResponses = this.processResponses(responses, checklist.sections);
    assignment.responses = processedResponses;
    assignment.overallRating = overallRating ? parseInt(overallRating) : null;
    assignment.inspectorNotes = inspectorNotes || '';
    assignment.additionalNotes = additionalNotes || '';
    assignment.status = 'submitted';
    assignment.submissionStatus = 'pending_review';
    assignment.submittedAt = new Date();
    assignment.completedAt = new Date();
    assignment.isDraft = false;

    // Calculate completion rate
    const totalFields = checklist.sections.reduce((sum, s) => sum + s.fields.length, 0);
    assignment.completionRate = assignment.calculateCompletion(totalFields);

    // Handle file uploads
    if (files) {
      if (files.photos) {
        assignment.uploadedPhotos = files.photos.map(f => f.path || f.location);
      }
      if (files.signature) {
        assignment.signaturePath = files.signature[0]?.path || files.signature[0]?.location;
      }
      if (files.attachments) {
        assignment.attachments = files.attachments.map(f => ({
          name: f.originalname,
          url: f.path || f.location,
          uploadedAt: new Date()
        }));
      }
    }

    await assignment.save();
    return await this.populateAssignment(assignment);
  }

  // ==================== SAVE DRAFT ====================

  async saveDraft(assignmentId, userId, data) {
    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) throw new NotFoundError('Assignment not found');

    const isAssigned = assignment.primaryMember?.toString() === userId ||
      assignment.secondaryMember?.toString() === userId;

    if (!isAssigned) throw new AuthorizationError('You are not authorized to save drafts');

    const { responses, overallRating, inspectorNotes, additionalNotes } = data;
    const checklist = await Checklist.findById(assignment.checklist);

    if (responses) {
      assignment.responses = this.processResponses(responses, checklist?.sections || []);
    }
    if (overallRating !== undefined) assignment.overallRating = overallRating;
    if (inspectorNotes !== undefined) assignment.inspectorNotes = inspectorNotes;
    if (additionalNotes !== undefined) assignment.additionalNotes = additionalNotes;

    assignment.status = 'in_progress';
    assignment.isDraft = true;
    assignment.lastSavedAt = new Date();
    assignment.draftCount += 1;

    if (checklist) {
      const totalFields = checklist.sections.reduce((sum, s) => sum + s.fields.length, 0);
      assignment.completionRate = assignment.calculateCompletion(totalFields);
    }

    await assignment.save();
    return assignment;
  }

  // ==================== REVIEW SUBMISSION (Admin/Super Admin) ====================

  async reviewSubmission(assignmentId, userId, userRole, data) {
    const { action, rejectionReason, reviewComments } = data;

    if (!['approve', 'reject'].includes(action)) {
      throw new BadRequestError('Invalid action. Must be "approve" or "reject"');
    }

    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) throw new NotFoundError('Assignment not found');

    const canReview = (userRole === 'super_admin') ||
      (userRole === 'admin' && assignment.assignedBy?.toString() === userId);

    if (!canReview) throw new AuthorizationError('You do not have permission to review this submission');

    if (assignment.status !== 'submitted' && assignment.submissionStatus !== 'pending_review') {
      throw new BadRequestError('Only submitted inspections can be reviewed');
    }

    if (action === 'approve') {
      assignment.status = 'approved';
      assignment.submissionStatus = 'approved';
    } else {
      if (!rejectionReason || rejectionReason.trim() === '') {
        throw new ValidationError(['Rejection reason is required']);
      }
      assignment.status = 'rejected';
      assignment.submissionStatus = 'rejected';
      assignment.rejectionReason = rejectionReason;
    }

    assignment.reviewedBy = userId;
    assignment.reviewedAt = new Date();
    assignment.reviewComments = reviewComments || '';
    assignment.completedAt = new Date();

    await assignment.save();
    return await this.populateAssignment(assignment);
  }

  // ==================== GET SUBMISSIONS FOR CHECKLIST ====================

  async getSubmissionsForChecklist(checklistId, userId, userRole, filters = {}) {
    let query = { checklist: checklistId, status: { $in: ['submitted', 'approved', 'rejected'] } };

    if (userRole === 'admin') {
      query.$or = [{ assignedBy: userId }, { assignedToAdmin: userId }];
    }

    const { page = 1, limit = 20, sortBy = 'submittedAt', sortOrder = 'desc' } = filters;
    const skip = (page - 1) * limit;
    const sortOptions = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const [submissions, total] = await Promise.all([
      Assignment.find(query)
        .populate('primaryMember', 'name email')
        .populate('secondaryMember', 'name email')
        .populate('assetId', 'assetName assetId tagNumber')
        .sort(sortOptions)
        .skip(skip)
        .limit(limit)
        .lean(),
      Assignment.countDocuments(query)
    ]);

    return {
      submissions,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    };
  }

  // ==================== GET ASSIGNEES LIST ====================

  async getAssignees(checklistId, userId, userRole) {
    let query = { checklist: checklistId };

    if (userRole === 'admin') {
      query.$or = [{ assignedBy: userId }, { assignedToAdmin: userId }];
    }

    const assignments = await Assignment.find(query)
      .populate('primaryMember', 'name email')
      .populate('secondaryMember', 'name email')
      .populate('assignedToAdmin', 'name email customerName')
      .lean();

    // Deduplicate users
    const userMap = new Map();

    assignments.forEach(a => {
      if (a.primaryMember) {
        const id = a.primaryMember._id.toString();
        if (!userMap.has(id)) {
          userMap.set(id, {
            user: a.primaryMember,
            role: 'team_member',
            assignments: []
          });
        }
        userMap.get(id).assignments.push(a);
      }
      if (a.secondaryMember) {
        const id = a.secondaryMember._id.toString();
        if (!userMap.has(id)) {
          userMap.set(id, {
            user: a.secondaryMember,
            role: 'team_member',
            assignments: []
          });
        }
        userMap.get(id).assignments.push(a);
      }
      if (a.assignedToAdmin) {
        const id = a.assignedToAdmin._id.toString();
        if (!userMap.has(id)) {
          userMap.set(id, {
            user: a.assignedToAdmin,
            role: 'admin',
            assignments: []
          });
        }
        userMap.get(id).assignments.push(a);
      }
    });

    return Array.from(userMap.values());
  }

  // ==================== GET INSPECTION HISTORY (Team Member) ====================

  async getInspectionHistory(userId, filters = {}) {
    const query = {
      $or: [{ primaryMember: userId }, { secondaryMember: userId }],
      status: { $in: ['submitted', 'approved', 'rejected', 'completed'] }
    };

    const { status, search, page = 1, limit = 20, dateFrom, dateTo } = filters;

    if (status) query.submissionStatus = status;
    if (dateFrom || dateTo) {
      query.submittedAt = {};
      if (dateFrom) query.submittedAt.$gte = new Date(dateFrom);
      if (dateTo) query.submittedAt.$lte = new Date(dateTo);
    }

    const skip = (page - 1) * limit;

    let submissions = await Assignment.find(query)
      .populate('checklist', 'name type category')
      .populate('assetId', 'assetName assetId tagNumber currentLocation')
      .populate('assignedBy', 'name email')
      .sort('-submittedAt')
      .skip(skip)
      .limit(limit)
      .lean();

    if (search) {
      submissions = submissions.filter(s =>
        s.checklist?.name?.toLowerCase().includes(search.toLowerCase()) ||
        s.assetName?.toLowerCase().includes(search.toLowerCase())
      );
    }

    const total = submissions.length;
    const approved = submissions.filter(s => s.submissionStatus === 'approved').length;
    const underReview = submissions.filter(s => s.submissionStatus === 'pending_review').length;
    const avgScore = total > 0
      ? Math.round(submissions.reduce((sum, s) => sum + (s.completionRate || 0), 0) / total)
      : 0;

    return {
      submissions,
      stats: { total, approved, underReview, avgScore },
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    };
  }

  // ==================== GET CALENDAR VIEW (Tasks by Date) ====================

  async getCalendarTasks(userId, userRole, filters = {}) {
    let query = this.buildAssignmentQuery(userId, userRole, filters);
    query.status = { $in: ['pending', 'in_progress'] };

    const assignments = await Assignment.find(query)
      .populate('checklist', 'name')
      .populate('assetId', 'assetName assetId')
      .lean();

    // Group by due date
    const calendarMap = new Map();

    assignments.forEach(a => {
      const dateKey = a.dueDate.toISOString().split('T')[0];
      if (!calendarMap.has(dateKey)) {
        calendarMap.set(dateKey, []);
      }
      calendarMap.get(dateKey).push({
        id: a._id,
        title: a.checklist?.name,
        asset: a.assetName,
        priority: a.priority,
        status: a.status,
        dueDate: a.dueDate,
        completionRate: a.completionRate
      });
    });

    return Array.from(calendarMap.entries()).map(([date, tasks]) => ({
      date,
      tasks,
      count: tasks.length
    }));
  }

  // ==================== EXPORT TO EXCEL ====================

  async exportAssignments(userId, userRole, filters = {}) {
    const query = this.buildAssignmentQuery(userId, userRole, filters);
    const assignments = await Assignment.find(query)
      .populate('checklist', 'name type category')
      .populate('primaryMember', 'name email')
      .populate('assetId', 'assetName assetId tagNumber')
      .lean();

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Assignments');

    worksheet.columns = [
      { header: 'Form Name', key: 'formName', width: 30 },
      { header: 'Assigned To', key: 'assignedTo', width: 25 },
      { header: 'Asset', key: 'asset', width: 25 },
      { header: 'Due Date', key: 'dueDate', width: 15 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Submission Status', key: 'submissionStatus', width: 15 },
      { header: 'Completion Rate', key: 'completionRate', width: 15 },
      { header: 'Submitted At', key: 'submittedAt', width: 20 },
      { header: 'Reviewed By', key: 'reviewedBy', width: 20 },
      { header: 'Priority', key: 'priority', width: 10 }
    ];

    assignments.forEach(a => {
      worksheet.addRow({
        formName: a.checklist?.name,
        assignedTo: a.primaryMember?.name || a.customerName,
        asset: a.assetName,
        dueDate: a.dueDate?.toISOString().split('T')[0],
        status: a.status,
        submissionStatus: a.submissionStatus || '-',
        completionRate: `${a.completionRate}%`,
        submittedAt: a.submittedAt?.toISOString().split('T')[0],
        reviewedBy: a.reviewedByName || '-',
        priority: a.priority
      });
    });

    return workbook;
  }

  // ==================== GET ANALYTICS ====================

  async getChecklistAnalytics(checklistId, userId, userRole, filters = {}) {
    let query = { checklist: checklistId };

    if (userRole === 'admin') {
      query.$or = [{ assignedBy: userId }, { assignedToAdmin: userId }];
    }

    const { dateRange = 30 } = filters;
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - dateRange);
    query.submittedAt = { $gte: fromDate };

    const assignments = await Assignment.find(query)
      .populate('primaryMember', 'name')
      .lean();

    const completed = assignments.filter(a => a.status === 'submitted' || a.status === 'approved');
    const total = assignments.length;
    const totalResponses = completed.length;

    // Calculate metrics
    const completionRate = total > 0 ? Math.round((totalResponses / total) * 100) : 0;
    const approved = completed.filter(a => a.submissionStatus === 'approved').length;
    const rejected = completed.filter(a => a.submissionStatus === 'rejected').length;
    const pendingReview = completed.filter(a => a.submissionStatus === 'pending_review').length;

    const approvalRate = totalResponses > 0 ? Math.round((approved / totalResponses) * 100) : 0;

    // Average completion time
    const completionTimes = completed
      .filter(a => a.submittedAt && a.createdAt)
      .map(a => (new Date(a.submittedAt) - new Date(a.createdAt)) / (1000 * 60));
    const avgCompletionTime = completionTimes.length > 0
      ? (completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length).toFixed(1)
      : 0;

    // Daily submission trend
    const trendMap = new Map();
    completed.forEach(a => {
      if (a.submittedAt) {
        const day = a.submittedAt.toISOString().split('T')[0];
        trendMap.set(day, (trendMap.get(day) || 0) + 1);
      }
    });

    const submissionTrend = Array.from(trendMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Top performers
    const performerMap = new Map();
    completed.forEach(a => {
      const memberId = a.primaryMember?._id?.toString();
      const memberName = a.primaryMember?.name || 'Unknown';
      if (!performerMap.has(memberId)) {
        performerMap.set(memberId, { name: memberName, submissions: 0, totalScore: 0 });
      }
      const perf = performerMap.get(memberId);
      perf.submissions += 1;
      perf.totalScore += a.completionRate || 0;
    });

    const topPerformers = Array.from(performerMap.values())
      .map(p => ({
        name: p.name,
        submissions: p.submissions,
        score: p.submissions > 0 ? Math.round(p.totalScore / p.submissions) : 0
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
        avgCompletionTime: parseFloat(avgCompletionTime)
      },
      submissionTrend,
      topPerformers,
      statusDistribution: [
        { label: 'Approved', value: approved, percentage: totalResponses > 0 ? Math.round((approved / totalResponses) * 100) : 0 },
        { label: 'Rejected', value: rejected, percentage: totalResponses > 0 ? Math.round((rejected / totalResponses) * 100) : 0 },
        { label: 'Pending Review', value: pendingReview, percentage: totalResponses > 0 ? Math.round((pendingReview / totalResponses) * 100) : 0 }
      ]
    };
  }

  // ==================== HELPER METHODS ====================

  validateResponses(responses, sections) {
    const errors = [];
    const requiredFields = [];

    sections.forEach(section => {
      section.fields.forEach(field => {
        if (field.isRequired) {
          requiredFields.push(field._id.toString());
        }
      });
    });

    const responseFieldIds = (responses || []).map(r => r.fieldId);

    requiredFields.forEach(fieldId => {
      if (!responseFieldIds.includes(fieldId)) {
        const field = sections.flatMap(s => s.fields).find(f => f._id.toString() === fieldId);
        errors.push(`Required field "${field?.label || fieldId}" is missing`);
      }
    });

    if (errors.length > 0) {
      throw new ValidationError(errors);
    }
  }

  processResponses(responses, sections) {
    const fieldMap = new Map();
    sections.forEach(section => {
      section.fields.forEach(field => {
        fieldMap.set(field._id.toString(), field);
      });
    });

    return (responses || []).map(r => {
      const field = fieldMap.get(r.fieldId);
      return {
        fieldId: r.fieldId,
        label: field?.label,
        fieldType: field?.fieldType,
        value: r.value,
        filePaths: r.filePaths || [],
        answeredAt: new Date()
      };
    });
  }

  async populateAssignment(assignment) {
    if (!assignment) return null;
    return await Assignment.findById(assignment._id)
      .populate('checklist', 'name type category totalFields sections status')
      .populate('assignedBy', 'name email role')
      .populate('assignedToAdmin', 'name email customerName')
      .populate('primaryMember', 'name email')
      .populate('secondaryMember', 'name email')
      .populate('customerId', 'name email customerName')
      .populate('assetId', 'assetName assetId tagNumber currentLocation')
      .populate('reviewedBy', 'name email');
  }

  checkAccess(assignment, userId, userRole) {
    if (userRole === 'super_admin') return true;
    if (userRole === 'admin') {
      return assignment.assignedBy?._id?.toString() === userId ||
        assignment.assignedToAdmin?._id?.toString() === userId ||
        assignment.customerId?._id?.toString() === userId;
    }
    if (userRole === 'team') {
      return assignment.primaryMember?._id?.toString() === userId ||
        assignment.secondaryMember?._id?.toString() === userId;
    }
    return false;
  }

  async getOverallStatistics(userId, userRole) {
    const query = this.buildAssignmentQuery(userId, userRole, {});

    const [
      total,
      pending,
      inProgress,
      completed,
      overdue,
      approved,
      rejected,
      averageRating
    ] = await Promise.all([
      Assignment.countDocuments(query),
      Assignment.countDocuments({ ...query, status: 'pending' }),
      Assignment.countDocuments({ ...query, status: 'in_progress' }),
      Assignment.countDocuments({ ...query, status: 'completed' }),
      Assignment.countDocuments({ ...query, status: 'overdue' }),
      Assignment.countDocuments({ ...query, submissionStatus: 'approved' }),
      Assignment.countDocuments({ ...query, submissionStatus: 'rejected' }),
      Assignment.aggregate([
        { $match: { ...query, overallRating: { $ne: null } } },
        { $group: { _id: null, avg: { $avg: '$overallRating' } } }
      ])
    ]);

    return {
      total,
      pending,
      inProgress,
      completed,
      overdue,
      approved,
      rejected,
      completionRate: total > 0 ? ((completed / total) * 100).toFixed(2) : 0,
      averageRating: averageRating[0]?.avg?.toFixed(2) || 0
    };
  }
}

export default new AssignmentService();