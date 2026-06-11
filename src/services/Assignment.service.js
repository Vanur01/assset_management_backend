// Assignment.service.js

import Assignment from '../models/AssignedChecklist.model.js';
import Checklist from '../models/checklist.model.js';
import User from '../models/user.model.js';
import Asset from '../models/asset.model.js';
import {
  NotFoundError,
  AuthorizationError,
  ValidationError,
  BadRequestError,
  ConflictError,
} from '../errors/customError.js';

// ─── Shared helpers ───────────────────────────────────────────────────────────

const POPULATE_ASSIGNMENT = [
  { path: 'checklistIds' },
  { path: 'assignedBy' },
  { path: 'assignedToAdmin' },
  { path: 'assignedToTeamMembers.userId' },
  { path: 'assetIds' },
  { path: 'deletedBy' },
  { path: 'reassignedBy' },
  { path: 'submissions.submittedBy' },
  { path: 'submissions.reviewedBy' },
];

/**
 * Re-fetch and populate an assignment by its _id.
 */
async function populateAssignment(assignment) {
  if (!assignment) return null;
  return Assignment.findById(assignment._id)
    .populate(POPULATE_ASSIGNMENT)
    .lean();
}

/**
 * Build a paginated result object.
 */
function paginate(page, limit, total) {
  const totalPages = Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

/**
 * Parse safe pagination params from query.
 */
function parsePagination(query) {
  const page = Math.max(parseInt(query.page) || 1, 1);
  const limit = Math.min(parseInt(query.limit) || 20, 100);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

/**
 * Build checklist snapshot array from Mongoose Checklist documents.
 */
function buildChecklistData(checklists) {
  return checklists.map(cl => ({
    checklistId: cl._id,
    name: cl.name,
    version: cl.version,
    type: cl.type,
    category: cl.category,
    responses: [],
    totalFieldsSnapshot:
      cl.sections?.reduce((sum, s) => sum + (s.fields?.length || 0), 0) || 0,
    completionRate: 0,
  }));
}

// ─── Service class ────────────────────────────────────────────────────────────

class AssignmentService {

  // ═══════════════════════════════════════════════════════════════
  //  1. ASSIGN — super_admin → admin
  // ═══════════════════════════════════════════════════════════════

  async assignToAdmin(assignedByUserId, assignedByRole, data) {
    if (assignedByRole !== 'super_admin') {
      throw new AuthorizationError('Only super admin can assign checklists to admins');
    }

    const { checklistIds, adminId, dueDate, priority, notes } = data;
    if (!checklistIds || !adminId || !dueDate) {
      throw new ValidationError('checklistIds, adminId and dueDate are required');
    }

    const checklistIdArray = [checklistIds].flat();

    const [checklists, admin] = await Promise.all([
      Checklist.find({ _id: { $in: checklistIdArray } }),
      User.findById(adminId),
    ]);

    if (checklists.length !== checklistIdArray.length) {
      throw new NotFoundError('One or more checklists not found');
    }
    if (!admin || admin.role !== 'admin') {
      throw new NotFoundError('Admin not found or invalid role');
    }

    // Conflict check
    for (const checklistId of checklistIdArray) {
      const { exists } = await Assignment.checkExistingAssignment([checklistId], adminId, 'admin');
      if (exists) {
        throw new ConflictError(`Checklist is already actively assigned to this admin`);
      }
    }

    const assignment = await Assignment.create({
      checklistIds: checklistIdArray,
      checklistData: buildChecklistData(checklists),
      assignedBy: assignedByUserId,
      assignedByRole,
      assignedToAdmin: adminId,
      assignedToAdminName: admin.customerName || admin.name || admin.email,
      customerId: adminId,
      customerName: admin.customerName || admin.name || admin.email,
      customerEmail: admin.email,
      dueDate: new Date(dueDate),
      priority: priority || 'medium',
      notes: notes || '',
      status: 'pending',
      isDeleted: false,
    });

    return populateAssignment(assignment);
  }

  // ═══════════════════════════════════════════════════════════════
  //  2. ASSIGN — admin → team
  // ═══════════════════════════════════════════════════════════════

  async assignToTeam(assignedByUserId, assignedByRole, data) {
    if (assignedByRole !== 'admin') {
      throw new AuthorizationError('Only admin can assign checklists to team members');
    }

    const {
      checklistIds, teamMemberIds, assetIds = [],
      dueDate, priority, notes,
    } = data;

    if (!checklistIds || !teamMemberIds || !dueDate) {
      throw new ValidationError('checklistIds, teamMemberIds and dueDate are required');
    }

    const checklistIdArray = [checklistIds].flat();
    const teamMemberIdArray = [teamMemberIds].flat();
    const assetIdArray = [assetIds].flat().filter(Boolean);

    // Fetch checklists
    const checklists = await Checklist.find({ _id: { $in: checklistIdArray } });
    if (checklists.length !== checklistIdArray.length) {
      throw new NotFoundError('One or more checklists not found');
    }

    // Validate team members belong to this admin
    const teamMembers = [];
    for (const memberId of teamMemberIdArray) {
      const member = await User.findOne({ _id: memberId, role: 'team', createdBy: assignedByUserId });
      if (!member) {
        throw new NotFoundError(`Team member ${memberId} not found or not under your admin`);
      }

      for (const checklistId of checklistIdArray) {
        const { exists } = await Assignment.checkExistingAssignment([checklistId], memberId, 'team');
        if (exists) {
          throw new ConflictError(
            `Team member "${member.name || member.email}" already has an active assignment for one of the selected checklists`
          );
        }
      }

      teamMembers.push({
        userId: member._id,
        name: member.name || member.email,
        email: member.email,
        status: 'pending',
        assignedAt: new Date(),
      });
    }

    // Validate & collect assets
    const assets = [];
    if (assetIdArray.length > 0) {
      const fetchedAssets = await Asset.find({ _id: { $in: assetIdArray }, adminId: assignedByUserId });
      if (fetchedAssets.length !== assetIdArray.length) {
        throw new NotFoundError('One or more assets not found or not under your admin');
      }
      fetchedAssets.forEach(a => assets.push({
        assetId: a._id,
        assetName: a.name || a.assetName,
        assetTagNumber: a.tagNumber || a.assetTagNumber,
        assetLocation: a.location || a.assetLocation,
        assetCategory: a.category || a.assetCategory,
        assetStatus: a.status,
      }));
    }

    const admin = await User.findById(assignedByUserId).select('name customerName email');

    const assignment = await Assignment.create({
      checklistIds: checklistIdArray,
      checklistData: buildChecklistData(checklists),
      assignedBy: assignedByUserId,
      assignedByRole,
      assignedToTeamMembers: teamMembers,
      assetIds: assetIdArray,
      assets,
      customerId: assignedByUserId,
      customerName: admin?.customerName || admin?.name,
      customerEmail: admin?.email,
      dueDate: new Date(dueDate),
      priority: priority || 'medium',
      notes: notes || '',
      status: 'pending',
      isDeleted: false,
    });

    return populateAssignment(assignment);
  }

  // ═══════════════════════════════════════════════════════════════
  //  3. REASSIGN — super_admin → admin
  // ═══════════════════════════════════════════════════════════════

  async reassignToAdmin(assignmentId, newAdminId, reassignedByUserId, reassignedByRole, data = {}) {
    if (reassignedByRole !== 'super_admin') {
      throw new AuthorizationError('Only super admin can reassign checklists to admins');
    }

    const { newChecklistIds, dueDate, priority, notes, reason } = data;

    const existingAssignment = await Assignment.findById(assignmentId);
    if (!existingAssignment) throw new NotFoundError('Assignment not found');
    if (existingAssignment.isDeleted) throw new BadRequestError('Cannot reassign a deleted assignment');
    if (['completed', 'approved'].includes(existingAssignment.status)) {
      throw new BadRequestError(`Cannot reassign a ${existingAssignment.status} assignment`);
    }

    const newAdmin = await User.findById(newAdminId);
    if (!newAdmin || newAdmin.role !== 'admin') throw new NotFoundError('Admin not found or invalid role');

    const checklistIdArray = newChecklistIds?.length
      ? [newChecklistIds].flat()
      : existingAssignment.checklistIds;

    const checklists = await Checklist.find({ _id: { $in: checklistIdArray } });
    if (checklists.length !== checklistIdArray.length) {
      throw new NotFoundError('One or more checklists not found');
    }

    for (const checklistId of checklistIdArray) {
      const { exists, assignment } = await Assignment.checkExistingAssignment([checklistId], newAdminId, 'admin');
      if (exists && assignment._id.toString() !== assignmentId) {
        throw new ConflictError('Checklist is already assigned to this admin');
      }
    }

    existingAssignment.reassignmentHistory.push({
      fromType: 'admin',
      fromId: existingAssignment.assignedToAdmin,
      toType: 'admin',
      toIds: [newAdminId],
      reassignedBy: reassignedByUserId,
      reassignedAt: new Date(),
      reason: reason || notes || 'Reassigned to new admin',
      oldChecklistIds: existingAssignment.checklistIds,
      newChecklistIds: checklistIdArray,
      oldAssetIds: existingAssignment.assetIds,
      newAssetIds: existingAssignment.assetIds,
    });
    existingAssignment.isReassigned = true;
    await existingAssignment.save();

    const newAssignment = await Assignment.create({
      checklistIds: checklistIdArray,
      checklistData: buildChecklistData(checklists),
      assignedBy: reassignedByUserId,
      assignedByRole: reassignedByRole,
      assignedToAdmin: newAdminId,
      assignedToAdminName: newAdmin.customerName || newAdmin.name || newAdmin.email,
      customerId: newAdminId,
      customerName: newAdmin.customerName || newAdmin.name || newAdmin.email,
      customerEmail: newAdmin.email,
      assetIds: existingAssignment.assetIds,
      assets: existingAssignment.assets,
      dueDate: dueDate ? new Date(dueDate) : existingAssignment.dueDate,
      priority: priority || existingAssignment.priority,
      notes: notes || existingAssignment.notes,
      status: 'pending',
      isDeleted: false,
      originalAssignmentId: assignmentId,
      reassignedAt: new Date(),
      reassignedBy: reassignedByUserId,
      reassignmentReason: reason || notes || 'Reassigned to new admin',
      reassignmentHistory: existingAssignment.reassignmentHistory,
    });

    return populateAssignment(newAssignment);
  }

  // ═══════════════════════════════════════════════════════════════
  //  4. REASSIGN — admin → team
  // ═══════════════════════════════════════════════════════════════

  async reassignToTeam(assignmentId, newTeamMemberIds, reassignedByUserId, reassignedByRole, data = {}) {
    if (reassignedByRole !== 'admin') {
      throw new AuthorizationError('Only admin can reassign checklists to team members');
    }

    const { newChecklistIds, newAssetIds, dueDate, priority, notes, reason } = data;

    const existingAssignment = await Assignment.findById(assignmentId);
    if (!existingAssignment) throw new NotFoundError('Assignment not found');
    if (existingAssignment.assignedBy.toString() !== reassignedByUserId.toString()) {
      throw new AuthorizationError('You can only reassign assignments you created');
    }
    if (existingAssignment.isDeleted) throw new BadRequestError('Cannot reassign a deleted assignment');
    if (['completed', 'approved'].includes(existingAssignment.status)) {
      throw new BadRequestError(`Cannot reassign a ${existingAssignment.status} assignment`);
    }

    const teamMemberIdArray = [newTeamMemberIds].flat();
    if (!teamMemberIdArray.length) throw new BadRequestError('At least one team member is required');

    const checklistIdArray = newChecklistIds?.length
      ? [newChecklistIds].flat()
      : existingAssignment.checklistIds;

    const assetIdArray = newAssetIds?.length
      ? [newAssetIds].flat()
      : existingAssignment.assetIds;

    const checklists = await Checklist.find({ _id: { $in: checklistIdArray } });
    if (checklists.length !== checklistIdArray.length) {
      throw new NotFoundError('One or more checklists not found');
    }

    const teamMembers = [];
    for (const memberId of teamMemberIdArray) {
      const member = await User.findOne({ _id: memberId, role: 'team', createdBy: reassignedByUserId });
      if (!member) throw new NotFoundError(`Team member ${memberId} not found or not under your admin`);

      for (const checklistId of checklistIdArray) {
        const { exists, assignment } = await Assignment.checkExistingAssignment([checklistId], memberId, 'team');
        if (exists && assignment._id.toString() !== assignmentId) {
          throw new ConflictError(`Team member already has an active assignment for one of the selected checklists`);
        }
      }

      teamMembers.push({
        userId: member._id,
        name: member.name || member.email,
        email: member.email,
        status: 'pending',
        assignedAt: new Date(),
      });
    }

    const assets = [];
    if (assetIdArray.length > 0) {
      const fetchedAssets = await Asset.find({ _id: { $in: assetIdArray }, adminId: reassignedByUserId });
      if (fetchedAssets.length !== assetIdArray.length) {
        throw new NotFoundError('One or more assets not found or not under your admin');
      }
      fetchedAssets.forEach(a => assets.push({
        assetId: a._id,
        assetName: a.name || a.assetName,
        assetTagNumber: a.tagNumber || a.assetTagNumber,
        assetLocation: a.location || a.assetLocation,
        assetCategory: a.category || a.assetCategory,
        assetStatus: a.status,
      }));
    }

    existingAssignment.reassignmentHistory.push({
      fromType: 'admin',
      fromId: existingAssignment.assignedToAdmin,
      toType: 'team',
      toIds: teamMemberIdArray,
      reassignedBy: reassignedByUserId,
      reassignedAt: new Date(),
      reason: reason || notes || 'Reassigned to team',
      oldChecklistIds: existingAssignment.checklistIds,
      newChecklistIds: checklistIdArray,
      oldAssetIds: existingAssignment.assetIds,
      newAssetIds: assetIdArray,
    });
    existingAssignment.isReassigned = true;
    await existingAssignment.save();

    const admin = await User.findById(reassignedByUserId).select('name customerName email');

    const newAssignment = await Assignment.create({
      checklistIds: checklistIdArray,
      checklistData: buildChecklistData(checklists),
      assignedBy: reassignedByUserId,
      assignedByRole: reassignedByRole,
      assignedToTeamMembers: teamMembers,
      assetIds: assetIdArray,
      assets,
      customerId: reassignedByUserId,
      customerName: admin?.customerName || admin?.name,
      customerEmail: admin?.email,
      dueDate: dueDate ? new Date(dueDate) : existingAssignment.dueDate,
      priority: priority || existingAssignment.priority,
      notes: notes || existingAssignment.notes,
      status: 'pending',
      isDeleted: false,
      originalAssignmentId: assignmentId,
      reassignedAt: new Date(),
      reassignedBy: reassignedByUserId,
      reassignmentReason: reason || notes || 'Reassigned to team',
      reassignmentHistory: existingAssignment.reassignmentHistory,
    });

    return populateAssignment(newAssignment);
  }

  // ═══════════════════════════════════════════════════════════════
  //  5. GET ASSIGNMENTS (role-filtered list)
  // ═══════════════════════════════════════════════════════════════

  async getAssignments(userId, userRole, filters = {}) {
    const { includeDeleted = false, ...restFilters } = filters;
    const query = await this._buildQuery(userId, userRole, restFilters);
    if (!includeDeleted) query.isDeleted = false;

    const { page, limit, skip } = parsePagination(filters);
    const sortField = filters.sortBy || 'createdAt';
    const sortOrder = filters.sortOrder === 'asc' ? 1 : -1;

    const [assignments, total] = await Promise.all([
      Assignment.find(query)
        .populate('checklistIds')
        .populate('assignedBy')
        .populate('assignedToAdmin')
        .populate('assignedToTeamMembers.userId')
        .populate('assetIds')
        .sort({ [sortField]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean(),
      Assignment.countDocuments(query),
    ]);

    return {
      assignments: assignments.map(a => ({
        ...a,
        summary: {
          totalChecklists: a.checklistIds?.length || 0,
          totalAssets: a.assetIds?.length || 0,
          totalTeamMembers: a.assignedToTeamMembers?.length || 0,
          totalSubmissions: a.totalSubmissions || 0,
          avgScore: a.avgScore,
          isDeleted: a.isDeleted,
        },
      })),
      pagination: paginate(page, limit, total),
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  6. GET ASSIGNMENT BY ID
  // ═══════════════════════════════════════════════════════════════

  async getAssignmentById(assignmentId, userId, userRole) {
    const assignment = await Assignment.findById(assignmentId)
      .populate(POPULATE_ASSIGNMENT)
      .lean();

    if (!assignment) throw new NotFoundError('Assignment not found');
    if (assignment.isDeleted) throw new BadRequestError('This assignment has been deleted');

    const hasAccess = await this._checkAccess(assignment, userId, userRole);
    if (!hasAccess) throw new AuthorizationError('You do not have permission to view this assignment');

    return assignment;
  }

  // ═══════════════════════════════════════════════════════════════
  //  7. GET DELETED ASSIGNMENTS
  // ═══════════════════════════════════════════════════════════════

  async getDeletedAssignments(userId, userRole, filters = {}) {
    if (userRole === 'team') throw new AuthorizationError('Team members cannot view deleted assignments');

    const query = { isDeleted: true };

    if (userRole === 'super_admin') {
      if (filters.customerId) query.customerId = filters.customerId;
    } else {
      // admin sees only their deleted assignments
      query.$or = [
        { assignedBy: userId },
        { assignedToAdmin: userId },
        { customerId: userId },
      ];
    }

    if (filters.status) query.status = filters.status;
    if (filters.deletedFrom || filters.deletedTo) {
      query.deletedAt = {};
      if (filters.deletedFrom) query.deletedAt.$gte = new Date(filters.deletedFrom);
      if (filters.deletedTo) query.deletedAt.$lte = new Date(filters.deletedTo);
    }

    const { page, limit, skip } = parsePagination(filters);

    const [assignments, total] = await Promise.all([
      Assignment.find(query)
        .populate('deletedBy', 'name email')
        .populate('assignedBy', 'name email')
        .sort({ deletedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Assignment.countDocuments(query),
    ]);

    return { assignments, pagination: paginate(page, limit, total) };
  }

  // ═══════════════════════════════════════════════════════════════
  //  8. SUBMIT ASSIGNMENT (team member, with file uploads)
  // ═══════════════════════════════════════════════════════════════

  async submitAssignment(assignmentId, teamMemberId, body, files = []) {
    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) throw new NotFoundError('Assignment not found');
    if (assignment.isDeleted) throw new BadRequestError('Cannot submit a deleted assignment');

    // Verify this team member is assigned
    const memberEntry = assignment.assignedToTeamMembers.find(
      tm => tm.userId.toString() === teamMemberId.toString()
    );
    if (!memberEntry) {
      throw new AuthorizationError('You are not assigned to this checklist');
    }

    if (memberEntry.status === 'completed') {
      throw new BadRequestError('You have already completed this assignment');
    }

    const member = await User.findById(teamMemberId).select('name email');

    // Parse responses (can arrive as JSON string from multipart)
    let responses = body.responses;
    if (typeof responses === 'string') {
      try { responses = JSON.parse(responses); } catch { responses = []; }
    }
    if (!Array.isArray(responses)) responses = [];

    // Build checklist responses grouped by checklistId
    const checklistResponses = assignment.checklistIds.map(clId => {
      const clData = assignment.checklistData.find(
        cd => cd.checklistId.toString() === clId.toString()
      );
      const clResponses = responses.filter(r => r.checklistId === clId.toString());
      const answered = clResponses.filter(r => {
        const v = r.value;
        return v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && !v.length);
      }).length;
      const total = clData?.totalFieldsSnapshot || clResponses.length || 1;
      const rate = Math.min(100, Math.round((answered / total) * 100));

      return {
        checklistId: clId,
        checklistName: clData?.name || '',
        responses: clResponses,
        completionRate: rate,
        totalFieldsSnapshot: total,
      };
    });

    const overallRate = checklistResponses.length
      ? Math.round(
        checklistResponses.reduce((s, c) => s + c.completionRate, 0) / checklistResponses.length
      )
      : 0;

    // Map uploaded files → attachments
    const attachments = (files || []).map(f => ({
      filePath: f.path,
      originalName: f.originalname,
      mimetype: f.mimetype,
      size: f.size,
      uploadedAt: new Date(),
    }));

    // Auto-generate inspection ID
    const inspectionId = `INS-${new Date().getFullYear()}-${String(assignment.totalSubmissions + 1).padStart(4, '0')}`;

    const submissionData = {
      submittedBy: teamMemberId,
      submittedByName: member?.name || '',
      submittedByEmail: member?.email || '',
      submittedAt: new Date(),
      checklistResponses,
      overallCompletionRate: overallRate,
      notes: body.notes || '',
      overallCondition: body.overallCondition || '',
      inspectorName: body.inspectorName || member?.name || '',
      attachments,
      reviewStatus: 'pending_review',
      inspectionId,
      itemsPassed: parseInt(body.itemsPassed) || 0,
      itemsFailed: parseInt(body.itemsFailed) || 0,
      itemsNA: parseInt(body.itemsNA) || 0,
      performanceRating: body.performanceRating ? parseFloat(body.performanceRating) : null,
    };

    // addSubmission is an instance method on the Assignment model
    await assignment.addSubmission(submissionData);

    // Update team member status
    await assignment.updateTeamMemberStatus(teamMemberId, 'completed');

    return populateAssignment(assignment);
  }

  // ═══════════════════════════════════════════════════════════════
  //  9. GET SUBMISSIONS BY ASSIGNMENT (admin / super_admin)
  // ═══════════════════════════════════════════════════════════════

  async getSubmissionsByAssignment(assignmentId, userId, userRole, filters = {}) {
    const assignment = await Assignment.findById(assignmentId)
      .populate('submissions.submittedBy', 'name email role')
      .populate('submissions.reviewedBy', 'name email')
      .lean();

    if (!assignment) throw new NotFoundError('Assignment not found');

    const hasAccess = await this._checkAccess(assignment, userId, userRole);
    if (!hasAccess) throw new AuthorizationError('You do not have permission to view this assignment');

    let submissions = assignment.submissions || [];

    // Optional filters
    if (filters.reviewStatus) {
      submissions = submissions.filter(s => s.reviewStatus === filters.reviewStatus);
    }
    if (filters.submittedBy) {
      submissions = submissions.filter(
        s => s.submittedBy?._id?.toString() === filters.submittedBy ||
          s.submittedBy?.toString() === filters.submittedBy
      );
    }

    // Sort: newest first
    submissions = submissions.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

    return {
      assignmentId: assignment._id,
      assignmentStatus: assignment.status,
      totalSubmissions: submissions.length,
      submissions: submissions.map(s => ({
        _id: s._id,
        inspectionId: s.inspectionId,
        submittedBy: s.submittedBy,
        submittedByName: s.submittedByName,
        submittedAt: s.submittedAt,
        reviewStatus: s.reviewStatus,
        reviewedBy: s.reviewedBy,
        reviewedAt: s.reviewedAt,
        overallCompletionRate: s.overallCompletionRate,
        score: s.score,
        overallCondition: s.overallCondition,
        itemsPassed: s.itemsPassed,
        itemsFailed: s.itemsFailed,
        itemsNA: s.itemsNA,
        performanceRating: s.performanceRating,
        attachmentCount: s.attachments?.length || 0,
      })),
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  10. GET SUBMISSION DETAIL (admin / super_admin)
  // ═══════════════════════════════════════════════════════════════

  async getSubmissionDetail(assignmentId, submissionId, userId, userRole) {
    const assignment = await Assignment.findById(assignmentId)
      .populate('checklistIds', 'name type sections')
      .populate('assetIds', 'name tagNumber location')
      .populate('submissions.submittedBy', 'name email role')
      .populate('submissions.reviewedBy', 'name email')
      .lean();

    if (!assignment) throw new NotFoundError('Assignment not found');

    const hasAccess = await this._checkAccess(assignment, userId, userRole);
    if (!hasAccess) throw new AuthorizationError('You do not have permission to view this submission');

    const submission = assignment.submissions.find(
      s => s._id.toString() === submissionId
    );
    if (!submission) throw new NotFoundError('Submission not found');

    return {
      assignment: {
        _id: assignment._id,
        status: assignment.status,
        priority: assignment.priority,
        dueDate: assignment.dueDate,
        checklists: assignment.checklistIds,
        assets: assignment.assets,
      },
      submission,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  11. REVIEW SUBMISSION (admin / super_admin)
  // ═══════════════════════════════════════════════════════════════

  async reviewSubmission(assignmentId, submissionId, reviewerId, reviewerRole, reviewData) {
    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) throw new NotFoundError('Assignment not found');

    const hasAccess = await this._checkAccess(assignment, reviewerId, reviewerRole);
    if (!hasAccess) throw new AuthorizationError('You do not have permission to review this submission');

    const { reviewStatus, reviewComments, rejectionReason, score } = reviewData;
    const validStatuses = ['approved', 'rejected', 'needs_revision'];
    if (!validStatuses.includes(reviewStatus)) {
      throw new ValidationError(`reviewStatus must be one of: ${validStatuses.join(', ')}`);
    }

    const reviewer = await User.findById(reviewerId).select('name email');

    await assignment.reviewSubmission(submissionId, {
      reviewStatus,
      reviewedBy: reviewerId,
      reviewedByName: reviewer?.name || reviewer?.email || '',
      reviewComments: reviewComments || '',
      rejectionReason: rejectionReason || '',
      score: score != null ? parseFloat(score) : null,
    });

    return populateAssignment(assignment);
  }

  // ═══════════════════════════════════════════════════════════════
  //  12. RECENT SUBMISSIONS (admin / super_admin dashboard)
  // ═══════════════════════════════════════════════════════════════

  async getRecentSubmissions(userId, userRole, filters = {}) {
    const query = await this._buildQuery(userId, userRole, {});
    query.isDeleted = false;
    query.totalSubmissions = { $gt: 0 };

    const { page, limit, skip } = parsePagination(filters);

    const assignments = await Assignment.find(query)
      .populate('assignedBy', 'name email')
      .populate('assignedToAdmin', 'name email customerName')
      .populate('submissions.submittedBy', 'name email role')
      .sort({ 'submissions.submittedAt': -1 })
      .lean();

    // Flatten all submissions with their parent assignment context
    const allSubmissions = [];
    for (const a of assignments) {
      for (const sub of (a.submissions || [])) {
        allSubmissions.push({
          submissionId: sub._id,
          inspectionId: sub.inspectionId,
          assignmentId: a._id,
          assignmentStatus: a.status,
          priority: a.priority,
          dueDate: a.dueDate,
          checklistNames: a.checklistData?.map(c => c.name) || [],
          assetCount: a.assetIds?.length || 0,
          submittedBy: sub.submittedBy,
          submittedByName: sub.submittedByName,
          submittedAt: sub.submittedAt,
          reviewStatus: sub.reviewStatus,
          overallCompletionRate: sub.overallCompletionRate,
          score: sub.score,
          overallCondition: sub.overallCondition,
          attachmentCount: sub.attachments?.length || 0,
          itemsPassed: sub.itemsPassed,
          itemsFailed: sub.itemsFailed,
        });
      }
    }

    // Sort newest first then paginate in memory
    allSubmissions.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

    const total = allSubmissions.length;
    const sliced = allSubmissions.slice(skip, skip + limit);

    return { submissions: sliced, pagination: paginate(page, limit, total) };
  }

  // ═══════════════════════════════════════════════════════════════
  //  13. MY TASKS — team member list
  // ═══════════════════════════════════════════════════════════════

  async getMyTasks(teamMemberId, filters = {}) {
    const query = {
      'assignedToTeamMembers.userId': teamMemberId,
      isDeleted: false,
    };

    if (filters.status && filters.status !== 'all') query.status = filters.status;
    if (filters.priority) query.priority = filters.priority;
    if (filters.dateFrom || filters.dateTo) {
      query.dueDate = {};
      if (filters.dateFrom) query.dueDate.$gte = new Date(filters.dateFrom);
      if (filters.dateTo) query.dueDate.$lte = new Date(filters.dateTo);
    }

    const { page, limit, skip } = parsePagination(filters);
    const sortField = filters.sortBy || 'dueDate';
    const sortOrder = filters.sortOrder === 'desc' ? -1 : 1;

    const [assignments, total] = await Promise.all([
      Assignment.find(query)
        .populate('checklistIds')
        .populate('assignedBy')
        .populate('assetIds')
        .sort({ [sortField]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean(),
      Assignment.countDocuments(query),
    ]);

    const tasks = assignments.map(a => {
      const myEntry = a.assignedToTeamMembers.find(
        tm => tm.userId.toString() === teamMemberId.toString()
      );
      const mySubmission = (a.submissions || []).find(
        s => s.submittedBy?.toString() === teamMemberId.toString()
      );

      return {
        _id: a._id,
        status: a.status,
        priority: a.priority,
        dueDate: a.dueDate,
        daysRemaining: a.dueDate
          ? Math.max(0, Math.ceil((new Date(a.dueDate) - new Date()) / 86400000))
          : null,
        isOverdue: a.dueDate && new Date(a.dueDate) < new Date() &&
          !['completed', 'approved'].includes(a.status),
        notes: a.notes,
        checklists: a.checklistIds,
        assets: a.assetIds,
        assignedBy: a.assignedBy,
        myStatus: myEntry?.status || 'pending',
        assignedAt: myEntry?.assignedAt,
        submission: mySubmission ? {
          _id: mySubmission._id,
          inspectionId: mySubmission.inspectionId,
          submittedAt: mySubmission.submittedAt,
          reviewStatus: mySubmission.reviewStatus,
          score: mySubmission.score,
          overallCompletionRate: mySubmission.overallCompletionRate,
        } : null,
      };
    });

    return { tasks, pagination: paginate(page, limit, total) };
  }

  // ═══════════════════════════════════════════════════════════════
  //  14. MY TASK BY ID — team member single task with full fields
  // ═══════════════════════════════════════════════════════════════

  async getMyTaskById(assignmentId, teamMemberId) {
    const assignment = await Assignment.findById(assignmentId)
      .populate({
        path: 'checklistIds',
      })
      .populate('assignedBy')
      .populate('assetIds')
      .lean();

    if (!assignment) throw new NotFoundError('Assignment not found');
    if (assignment.isDeleted) throw new BadRequestError('This assignment has been deleted');

    const myEntry = assignment.assignedToTeamMembers.find(
      tm => tm.userId.toString() === teamMemberId.toString()
    );
    if (!myEntry) throw new AuthorizationError('You are not assigned to this task');

    const mySubmission = (assignment.submissions || []).find(
      s => s.submittedBy?.toString() === teamMemberId.toString()
    );

    return {
      ...assignment,
      myStatus: myEntry.status,
      assignedAt: myEntry.assignedAt,
      completedAt: myEntry.completedAt,
      mySubmission: mySubmission || null,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  15. MY INSPECTIONS — team member submission history
  // ═══════════════════════════════════════════════════════════════

  async getMyInspections(teamMemberId, filters = {}) {
    const query = {
      'submissions.submittedBy': teamMemberId,
      isDeleted: false,
    };

    if (filters.reviewStatus) {
      query['submissions.reviewStatus'] = filters.reviewStatus;
    }
    if (filters.dateFrom || filters.dateTo) {
      query['submissions.submittedAt'] = {};
      if (filters.dateFrom) query['submissions.submittedAt'].$gte = new Date(filters.dateFrom);
      if (filters.dateTo) query['submissions.submittedAt'].$lte = new Date(filters.dateTo);
    }

    const { page, limit, skip } = parsePagination(filters);

    const assignments = await Assignment.find(query)
      .populate('checklistIds')
      .populate('assetIds')
      .populate('submissions.reviewedBy')
      .sort({ 'submissions.submittedAt': -1 })
      .lean();

    // Extract only this team member's submissions
    const inspections = [];
    for (const a of assignments) {
      const mySubs = (a.submissions || []).filter(
        s => s.submittedBy?.toString() === teamMemberId.toString()
      );
      for (const sub of mySubs) {
        inspections.push({
          _id: sub._id,
          inspectionId: sub.inspectionId,
          assignmentId: a._id,
          checklists: a.checklistIds,
          assets: a.assetIds,
          priority: a.priority,
          submittedAt: sub.submittedAt,
          reviewStatus: sub.reviewStatus,
          reviewedBy: sub.reviewedBy,
          reviewedAt: sub.reviewedAt,
          reviewComments: sub.reviewComments,
          rejectionReason: sub.rejectionReason,
          score: sub.score,
          overallCompletionRate: sub.overallCompletionRate,
          overallCondition: sub.overallCondition,
          itemsPassed: sub.itemsPassed,
          itemsFailed: sub.itemsFailed,
          itemsNA: sub.itemsNA,
          performanceRating: sub.performanceRating,
          attachmentCount: sub.attachments?.length || 0,
          notes: sub.notes,
        });
      }
    }

    inspections.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    const total = inspections.length;
    const sliced = inspections.slice(skip, skip + limit);

    return { inspections: sliced, pagination: paginate(page, limit, total) };
  }

  // ═══════════════════════════════════════════════════════════════
  //  16. MY INSPECTION BY ID — team member single submission detail
  // ═══════════════════════════════════════════════════════════════

  async getMyInspectionById(submissionId, teamMemberId) {
    const assignment = await Assignment.findOne({
      'submissions._id': submissionId,
      'submissions.submittedBy': teamMemberId,
    })
      .populate('checklistIds', 'name type category sections')
      .populate('assetIds', 'name tagNumber location category status')
      .populate('submissions.reviewedBy', 'name email')
      .lean();

    if (!assignment) throw new NotFoundError('Inspection not found');

    const submission = assignment.submissions.find(
      s => s._id.toString() === submissionId.toString()
    );
    if (!submission) throw new NotFoundError('Inspection not found');
    if (submission.submittedBy?.toString() !== teamMemberId.toString()) {
      throw new AuthorizationError('You do not have permission to view this inspection');
    }

    return {
      assignment: {
        _id: assignment._id,
        status: assignment.status,
        priority: assignment.priority,
        dueDate: assignment.dueDate,
        checklists: assignment.checklistIds,
        assets: assignment.assetIds,
      },
      inspection: submission,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  17. ANALYTICS (admin / super_admin)
  // ═══════════════════════════════════════════════════════════════

  async getAnalytics(userId, userRole, filters = {}) {
    const query = await this._buildQuery(userId, userRole, filters);
    query.isDeleted = false;

    const now = new Date();

    const [
      statusBreakdown,
      priorityBreakdown,
      submissionTrend,
      topPerformers,
      overdueDetails,
      completionRates,
    ] = await Promise.all([
      // Status distribution
      Assignment.aggregate([
        { $match: query },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),

      // Priority distribution
      Assignment.aggregate([
        { $match: query },
        { $group: { _id: '$priority', count: { $sum: 1 } } },
      ]),

      // Daily submission trend — last 30 days
      Assignment.aggregate([
        { $match: { ...query, 'submissions.0': { $exists: true } } },
        { $unwind: '$submissions' },
        {
          $match: {
            'submissions.submittedAt': {
              $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
            },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$submissions.submittedAt' },
            },
            count: { $sum: 1 },
            avgScore: { $avg: '$submissions.score' },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // Top performers (team members with most approved submissions)
      Assignment.aggregate([
        { $match: query },
        { $unwind: '$submissions' },
        { $match: { 'submissions.reviewStatus': 'approved' } },
        {
          $group: {
            _id: '$submissions.submittedBy',
            name: { $first: '$submissions.submittedByName' },
            approvedCount: { $sum: 1 },
            avgScore: { $avg: '$submissions.score' },
            avgCompletion: { $avg: '$submissions.overallCompletionRate' },
          },
        },
        { $sort: { approvedCount: -1 } },
        { $limit: 10 },
      ]),

      // Overdue assignments
      Assignment.find({
        ...query,
        dueDate: { $lt: now },
        status: { $nin: ['completed', 'approved', 'rejected'] },
      })
        .populate('assignedToTeamMembers.userId', 'name email')
        .populate('assignedToAdmin', 'name email')
        .select('checklistData dueDate status priority assignedToAdmin assignedToAdminName assignedToTeamMembers')
        .lean(),

      // Average completion rates per checklist
      Assignment.aggregate([
        { $match: query },
        { $unwind: '$checklistData' },
        {
          $group: {
            _id: '$checklistData.checklistId',
            name: { $first: '$checklistData.name' },
            avgCompletion: { $avg: '$checklistData.completionRate' },
            totalAssigned: { $sum: 1 },
          },
        },
        { $sort: { avgCompletion: -1 } },
        { $limit: 10 },
      ]),
    ]);

    const statusMap = Object.fromEntries(statusBreakdown.map(s => [s._id, s.count]));
    const priorityMap = Object.fromEntries(priorityBreakdown.map(p => [p._id, p.count]));

    const totalAssignments = Object.values(statusMap).reduce((a, b) => a + b, 0);

    return {
      overview: {
        total: totalAssignments,
        pending: statusMap.pending || 0,
        in_progress: statusMap.in_progress || 0,
        submitted: statusMap.submitted || 0,
        approved: statusMap.approved || 0,
        rejected: statusMap.rejected || 0,
        completed: statusMap.completed || 0,
        overdue: overdueDetails.length,
      },
      byPriority: {
        low: priorityMap.low || 0,
        medium: priorityMap.medium || 0,
        high: priorityMap.high || 0,
        critical: priorityMap.critical || 0,
      },
      submissionTrend: submissionTrend.map(d => ({
        date: d._id,
        count: d.count,
        avgScore: d.avgScore ? Math.round(d.avgScore * 10) / 10 : null,
      })),
      topPerformers: topPerformers.map(p => ({
        userId: p._id,
        name: p.name,
        approvedCount: p.approvedCount,
        avgScore: p.avgScore ? Math.round(p.avgScore * 10) / 10 : null,
        avgCompletion: p.avgCompletion ? Math.round(p.avgCompletion) : null,
      })),
      overdueAssignments: overdueDetails.map(a => ({
        _id: a._id,
        dueDate: a.dueDate,
        daysOverdue: Math.ceil((now - new Date(a.dueDate)) / 86400000),
        status: a.status,
        priority: a.priority,
        assignedTo: a.assignedToAdmin
          ? { type: 'admin', name: a.assignedToAdminName }
          : { type: 'team', count: a.assignedToTeamMembers?.length || 0 },
        checklists: a.checklistData?.map(c => c.name) || [],
      })),
      checklistPerformance: completionRates,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  18. ASSIGNMENT STATS (summary for dashboard cards)
  // ═══════════════════════════════════════════════════════════════

  async getAssignmentStats(userId, userRole, filters = {}) {
    const query = await this._buildQuery(userId, userRole, filters);
    query.isDeleted = false;

    const [stats] = await Assignment.aggregate([
      { $match: query },
      {
        $facet: {
          total: [{ $count: 'count' }],
          byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
          byPriority: [{ $group: { _id: '$priority', count: { $sum: 1 } } }],
          byType: [{
            $group: {
              _id: { $cond: [{ $ifNull: ['$assignedToAdmin', false] }, 'admin', 'team'] },
              count: { $sum: 1 },
            },
          }],
          overdue: [{
            $match: {
              dueDate: { $lt: new Date() },
              status: { $nin: ['completed', 'approved', 'rejected'] },
            },
          }, { $count: 'count' }],
          completionStats: [{
            $group: {
              _id: null,
              avgCompletion: { $avg: '$completionRate' },
              totalChecklists: { $sum: { $size: '$checklistData' } },
              totalSubmissions: { $sum: '$totalSubmissions' },
              approvedSubmissions: { $sum: '$approvedSubmissions' },
            },
          }],
        },
      },
    ]);

    const statusMap = Object.fromEntries((stats.byStatus || []).map(s => [s._id, s.count]));
    const priorityMap = Object.fromEntries((stats.byPriority || []).map(p => [p._id, p.count]));
    const typeMap = Object.fromEntries((stats.byType || []).map(t => [t._id, t.count]));
    const cs = stats.completionStats?.[0] || {};

    return {
      total: stats.total?.[0]?.count || 0,
      byStatus: {
        pending: statusMap.pending || 0,
        in_progress: statusMap.in_progress || 0,
        submitted: statusMap.submitted || 0,
        completed: statusMap.completed || 0,
        approved: statusMap.approved || 0,
        rejected: statusMap.rejected || 0,
        overdue: stats.overdue?.[0]?.count || 0,
      },
      byPriority: {
        low: priorityMap.low || 0,
        medium: priorityMap.medium || 0,
        high: priorityMap.high || 0,
        critical: priorityMap.critical || 0,
      },
      byType: {
        toAdmin: typeMap.admin || 0,
        toTeam: typeMap.team || 0,
      },
      submissions: {
        total: cs.totalSubmissions || 0,
        approved: cs.approvedSubmissions || 0,
      },
      completion: {
        avgRate: Math.round((cs.avgCompletion || 0) * 100) / 100,
        totalChecklists: cs.totalChecklists || 0,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  19. SOFT DELETE
  // ═══════════════════════════════════════════════════════════════

  async softDeleteAssignment(assignmentId, userId, userRole) {
    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) throw new NotFoundError('Assignment not found');
    if (assignment.isDeleted) throw new BadRequestError('Assignment is already deleted');

    const canDelete =
      userRole === 'super_admin' ||
      (userRole === 'admin' && assignment.assignedBy?.toString() === userId.toString());

    if (!canDelete) throw new AuthorizationError('You do not have permission to delete this assignment');

    assignment.isDeleted = true;
    assignment.deletedAt = new Date();
    assignment.deletedBy = userId;
    await assignment.save();

    return { message: 'Assignment soft deleted successfully', assignment: await populateAssignment(assignment) };
  }

  // ═══════════════════════════════════════════════════════════════
  //  20. PERMANENT DELETE
  // ═══════════════════════════════════════════════════════════════

  async permanentDeleteAssignment(assignmentId, userId, userRole) {
    if (userRole !== 'super_admin') {
      throw new AuthorizationError('Only super admin can permanently delete assignments');
    }

    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) throw new NotFoundError('Assignment not found');

    const deletedInfo = {
      id: assignment._id,
      checklists: assignment.checklistData.map(c => c.name),
      assignedTo: assignment.assignedToAdmin
        ? `Admin: ${assignment.assignedToAdminName}`
        : `Team: ${assignment.assignedToTeamMembers.length} member(s)`,
      deletedAt: new Date(),
    };

    await assignment.permanentDelete();
    return { message: 'Assignment permanently deleted successfully', deletedInfo };
  }

  // ═══════════════════════════════════════════════════════════════
  //  21. RESTORE
  // ═══════════════════════════════════════════════════════════════

  async restoreAssignment(assignmentId, userId, userRole) {
    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) throw new NotFoundError('Assignment not found');
    if (!assignment.isDeleted) throw new BadRequestError('Assignment is not deleted');

    const canRestore =
      userRole === 'super_admin' ||
      (userRole === 'admin' && assignment.assignedBy?.toString() === userId.toString());

    if (!canRestore) throw new AuthorizationError('You do not have permission to restore this assignment');

    await assignment.restore();
    return { message: 'Assignment restored successfully', assignment: await populateAssignment(assignment) };
  }

  // ═══════════════════════════════════════════════════════════════
  //  PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════

  async _buildQuery(userId, userRole, filters = {}) {
    const query = {};
    const { status, priority, checklistId, assetId, customerId, dateFrom, dateTo } = filters;

    if (userRole === 'super_admin') {
      if (customerId) query.customerId = customerId;
    } else if (userRole === 'admin') {
      // Admin sees: assignments they created, assigned to them, or involving their team
      const teamMembers = await User.find({ role: 'team', createdBy: userId }).select('_id');
      const teamIds = teamMembers.map(tm => tm._id);

      query.$or = [
        { assignedBy: userId },
        { assignedToAdmin: userId },
        { customerId: userId },
        { 'assignedToTeamMembers.userId': { $in: teamIds } },
      ];
    } else if (userRole === 'team') {
      query['assignedToTeamMembers.userId'] = userId;
    }

    if (status && status !== 'all') query.status = status;
    if (priority) query.priority = priority;
    if (checklistId) query.checklistIds = checklistId;
    if (assetId) query.assetIds = assetId;

    if (dateFrom || dateTo) {
      query.dueDate = {};
      if (dateFrom) query.dueDate.$gte = new Date(dateFrom);
      if (dateTo) query.dueDate.$lte = new Date(dateTo);
    }

    return query;
  }

  async _checkAccess(assignment, userId, userRole) {
    if (userRole === 'super_admin') return true;

    if (userRole === 'admin') {
      const uid = userId.toString();
      if (assignment.assignedBy?.toString() === uid) return true;
      if (assignment.assignedToAdmin?.toString() === uid) return true;
      if (assignment.customerId?.toString() === uid) return true;

      if (assignment.assignedToTeamMembers?.length) {
        const teamMembers = await User.find({ role: 'team', createdBy: userId }).select('_id');
        const teamIds = new Set(teamMembers.map(t => t._id.toString()));
        if (assignment.assignedToTeamMembers.some(tm => teamIds.has(tm.userId?.toString()))) {
          return true;
        }
      }
      return false;
    }

    if (userRole === 'team') {
      return assignment.assignedToTeamMembers?.some(
        tm => tm.userId?.toString() === userId.toString()
      ) || false;
    }

    return false;
  }
}

export default new AssignmentService();