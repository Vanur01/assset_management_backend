import Assignment from '../models/AssignedChecklist.model.js';
import Checklist from '../models/checklist.model.js';
import User from '../models/user.model.js';
import Asset from '../models/asset.model.js';
import ExcelJS from 'exceljs';
import mongoose from 'mongoose';
import {
  NotFoundError,
  AuthorizationError,
  ValidationError,
  BadRequestError,
  ConflictError,
} from '../errors/customError.js';

class AssignmentService {

  // ═══════════════════════════════════════════════════════════════
  //  CREATE ASSIGNMENTS
  // ═══════════════════════════════════════════════════════════════

  async assignChecklistToAdmin(assignedByUserId, assignedByRole, data) {
    const { checklistId, adminId, dueDate, priority, notes } = data;

    if (!checklistId || !adminId || !dueDate) {
      throw new BadRequestError('checklistId, adminId and dueDate are required');
    }

    // Fetch complete checklist data
    const checklist = await Checklist.findById(checklistId).populate('createdBy', 'name email');
    if (!checklist) throw new NotFoundError('Checklist not found');

    const admin = await User.findById(adminId);
    if (!admin || admin.role !== 'admin') throw new NotFoundError('Admin not found');

    // Check for existing active assignment to the same admin
    const existingAssignment = await Assignment.findOne({
      checklist: checklistId,
      assignedToAdmin: adminId,
      status: { $in: ['pending', 'in_progress', 'submitted'] }
    });

    if (existingAssignment) {
      throw new ConflictError(
        `This checklist has already been assigned to admin "${admin.customerName || admin.name || admin.email}". 
        Please complete or cancel the existing assignment before creating a new one.`,
        {
          existingAssignmentId: existingAssignment._id,
          existingStatus: existingAssignment.status,
          assignedAt: existingAssignment.createdAt
        }
      );
    }

    // Check if admin already has a completed assignment for this checklist
    const completedAssignment = await Assignment.findOne({
      checklist: checklistId,
      assignedToAdmin: adminId,
      status: { $in: ['completed', 'approved'] }
    });

    if (completedAssignment) {
      throw new ConflictError(
        `Admin "${admin.customerName || admin.name || admin.email}" has already completed this checklist. 
        Please use the clone functionality to create a new assignment.`,
        {
          completedAssignmentId: completedAssignment._id,
          completedAt: completedAssignment.completedAt
        }
      );
    }

    // Store complete checklist data for later display
    const checklistData = {
      _id: checklist._id,
      name: checklist.name,
      version: checklist.version,
      type: checklist.type,
      category: checklist.category,
      sections: checklist.sections,
      totalFields: checklist.sections?.reduce((sum, s) => sum + (s.fields?.length || 0), 0) || 0,
    };

    const assignment = await Assignment.create({
      checklist: checklistId,
      checklistName: checklist.name,
      checklistVersion: checklist.version,
      checklistData: checklistData,
      assignedBy: assignedByUserId,
      assignedByRole,
      assignedToAdmin: adminId,
      assignedToAdminName: admin.customerName || admin.name || admin.email,
      customerId: adminId,
      customerName: admin.customerName || admin.name || admin.email,
      customerEmail: admin.email,
      assets: [],
      assetData: null,
      dueDate: new Date(dueDate),
      priority: priority || 'medium',
      notes: notes || '',
      status: 'pending',
    });

    // Populate and return the created assignment
    return await this._populateAssignment(assignment);
  }

  async assignChecklistToTeam(assignedByUserId, assignedByRole, data) {
    const { checklistId, teamMemberIds, assetId = null, dueDate, priority, notes } = data;

    if (!checklistId || !dueDate) {
      throw new BadRequestError('checklistId and dueDate are required');
    }

    const memberIdList = Array.isArray(teamMemberIds) ? teamMemberIds : [teamMemberIds];
    if (!memberIdList.length || memberIdList.some(id => !id)) {
      throw new BadRequestError('At least one valid teamMemberId is required');
    }

    // Fetch checklist with populated fields
    const checklist = await Checklist.findById(checklistId)
      .populate('createdBy', 'name email customerName customerEmail role');

    if (!checklist) throw new NotFoundError('Checklist not found');

    const checklistData = {
      _id: checklist._id,
      name: checklist.name,
      version: checklist.version,
      type: checklist.type,
      category: checklist.category,
      sections: checklist.sections,
      totalFields: checklist.sections?.reduce((sum, s) => sum + (s.fields?.length || 0), 0) || 0,
    };

    // Fetch and validate team members
    const teamMembers = [];

    for (const memberId of memberIdList) {
      const member = await User.findById(memberId).populate('adminId', 'name email customerName customerEmail');
      if (!member || member.role !== 'team') {
        throw new NotFoundError(`Team member not found or invalid role: ${memberId}`);
      }

      // Check for existing active assignment for this team member
      const existingAssignment = await Assignment.findOne({
        checklist: checklistId,
        'assignedToTeamMembers.userId': memberId,
        status: { $in: ['pending', 'in_progress', 'submitted'] }
      });

      if (existingAssignment) {
        throw new ConflictError(
          `Team member "${member.name || member.email}" already has an active assignment for checklist "${checklist.name}". 
          Please complete or cancel the existing assignment before creating a new one.`,
          {
            memberId: memberId,
            memberName: member.name || member.email,
            existingAssignmentId: existingAssignment._id,
            existingStatus: existingAssignment.status
          }
        );
      }

      // Check if team member has already completed this checklist
      const completedAssignment = await Assignment.findOne({
        checklist: checklistId,
        'assignedToTeamMembers.userId': memberId,
        status: { $in: ['completed', 'approved'] }
      });

      if (completedAssignment) {
        throw new ConflictError(
          `Team member "${member.name || member.email}" has already completed this checklist. 
          Please use the clone functionality to create a new assignment.`,
          {
            memberId: memberId,
            memberName: member.name || member.email,
            completedAssignmentId: completedAssignment._id,
            completedAt: completedAssignment.completedAt
          }
        );
      }

      teamMembers.push({
        userId: member._id,
        name: member.name || member.email,
        email: member.email,
        status: 'pending',
        assignedAt: new Date(),
      });
    }

    // Fetch single asset - FIXED: Removed assignedTo population
    let asset = null;
    let assets = [];
    let customerId = null;
    let customerName = null;
    let customerEmail = null;

    if (assetId) {
      asset = await Asset.findById(assetId)
        .populate('adminId', 'name email customerName customerEmail role');
      // Removed .populate('assignedTo', 'name email')

      if (!asset) {
        throw new NotFoundError(`Asset not found with ID: ${assetId}`);
      }

      // Store single asset in assets array for compatibility
      assets = [{
        assetId: asset._id,
        assetName: asset.name || asset.assetName,
        assetTagNumber: asset.tagNumber || asset.assetTagNumber,
        assetLocation: asset.location || asset.assetLocation,
        assetCategory: asset.category || asset.assetCategory,
        assetStatus: asset.status,
        adminId: asset.adminId?._id,
        adminName: asset.adminId?.name,
        adminEmail: asset.adminId?.email,
      }];

      // Extract customer information from asset's adminId
      if (asset.adminId) {
        customerId = asset.adminId._id;
        customerName = asset.adminId.customerName || asset.adminId.name;
        customerEmail = asset.adminId.customerEmail || asset.adminId.email;
      }
    }

    // If no customer found from asset, try to get from checklist's createdBy
    if (!customerId && checklist.createdBy) {
      customerId = checklist.createdBy._id;
      customerName = checklist.createdBy.customerName || checklist.createdBy.name;
      customerEmail = checklist.createdBy.customerEmail || checklist.createdBy.email;
    }

    // If still no customer, try to get from the first team member's admin
    if (!customerId && teamMembers.length > 0) {
      for (const member of teamMembers) {
        const memberUser = await User.findById(member.userId).populate('adminId', 'name email customerName customerEmail');
        if (memberUser && memberUser.adminId) {
          customerId = memberUser.adminId._id;
          customerName = memberUser.adminId.customerName || memberUser.adminId.name;
          customerEmail = memberUser.adminId.customerEmail || memberUser.adminId.email;
          if (customerName) break;
        }
      }
    }

    const assetData = assets.length > 0 ? {
      _id: assets[0].assetId,
      name: assets[0].assetName,
      tagNumber: assets[0].assetTagNumber,
      location: assets[0].assetLocation,
      category: assets[0].assetCategory,
    } : null;

    // Create the assignment
    const assignment = await Assignment.create({
      checklist: checklistId,
      checklistName: checklist.name,
      checklistVersion: checklist.version,
      checklistData: checklistData,
      assignedBy: assignedByUserId,
      assignedByRole,
      assignedToTeamMembers: teamMembers,
      customerId,
      customerName,
      customerEmail,
      assets: assets,
      assetData: assetData,
      dueDate: new Date(dueDate),
      priority: priority || 'medium',
      notes: notes || '',
      status: 'pending',
    });

    // Populate and return the created assignment
    return await this._populateAssignment(assignment);
  }

  // ═══════════════════════════════════════════════════════════════
  //  RE-ASSIGNMENT FUNCTIONS
  // ═══════════════════════════════════════════════════════════════

  async reassignToAdmin(assignmentId, newAdminId, reassignedByUserId, reassignedByRole, data = {}) {
    const { dueDate, priority, notes } = data;

    // Find existing assignment
    const existingAssignment = await Assignment.findById(assignmentId);
    if (!existingAssignment) throw new NotFoundError('Assignment not found');

    // Check if assignment can be reassigned
    if (['completed', 'approved'].includes(existingAssignment.status)) {
      throw new BadRequestError(
        `Cannot reassign a ${existingAssignment.status} assignment. Please create a new assignment instead.`
      );
    }

    // Fetch new admin
    const newAdmin = await User.findById(newAdminId);
    if (!newAdmin || newAdmin.role !== 'admin') throw new NotFoundError('Admin not found');

    // Check if new admin already has an active assignment for this checklist
    const existingAdminAssignment = await Assignment.findOne({
      checklist: existingAssignment.checklist,
      assignedToAdmin: newAdminId,
      status: { $in: ['pending', 'in_progress', 'submitted'] },
      _id: { $ne: assignmentId }
    });

    if (existingAdminAssignment) {
      throw new ConflictError(
        `Admin "${newAdmin.customerName || newAdmin.name || newAdmin.email}" already has an active assignment for this checklist.`
      );
    }

    // Update the assignment
    existingAssignment.assignedToAdmin = newAdminId;
    existingAssignment.assignedToAdminName = newAdmin.customerName || newAdmin.name || newAdmin.email;
    existingAssignment.customerId = newAdminId;
    existingAssignment.customerName = newAdmin.customerName || newAdmin.name || newAdmin.email;
    existingAssignment.customerEmail = newAdmin.email;
    existingAssignment.assignedToTeamMembers = [];
    existingAssignment.assets = [];
    existingAssignment.assetData = null;

    if (dueDate) existingAssignment.dueDate = new Date(dueDate);
    if (priority) existingAssignment.priority = priority;
    if (notes) existingAssignment.notes = notes;

    existingAssignment.reassignedBy = reassignedByUserId;
    existingAssignment.reassignedByRole = reassignedByRole;
    existingAssignment.reassignedAt = new Date();
    existingAssignment.reassignmentHistory = existingAssignment.reassignmentHistory || [];
    existingAssignment.reassignmentHistory.push({
      fromType: 'team',
      fromId: existingAssignment.assignedToTeamMembers?.[0]?.userId || null,
      toType: 'admin',
      toId: newAdminId,
      reassignedBy: reassignedByUserId,
      reassignedAt: new Date(),
      reason: notes || 'Reassigned to admin'
    });

    await existingAssignment.save();
    return await this._populateAssignment(existingAssignment);
  }

  async reassignToTeam(assignmentId, newTeamMemberIds, reassignedByUserId, reassignedByRole, data = {}) {
    const { assetIds = [], dueDate, priority, notes } = data;

    // Find existing assignment
    const existingAssignment = await Assignment.findById(assignmentId);
    if (!existingAssignment) throw new NotFoundError('Assignment not found');

    // Check if assignment can be reassigned
    if (['completed', 'approved'].includes(existingAssignment.status)) {
      throw new BadRequestError(
        `Cannot reassign a ${existingAssignment.status} assignment. Please create a new assignment instead.`
      );
    }

    const memberIdList = Array.isArray(newTeamMemberIds) ? newTeamMemberIds : [newTeamMemberIds];
    if (!memberIdList.length) {
      throw new BadRequestError('At least one team member is required');
    }

    // Fetch and validate team members
    const teamMembers = [];
    for (const memberId of memberIdList) {
      const member = await User.findById(memberId);
      if (!member || member.role !== 'team') {
        throw new NotFoundError(`Team member not found or invalid role: ${memberId}`);
      }

      // Check if team member already has an active assignment for this checklist
      const existingTeamAssignment = await Assignment.findOne({
        checklist: existingAssignment.checklist,
        'assignedToTeamMembers.userId': memberId,
        status: { $in: ['pending', 'in_progress', 'submitted'] },
        _id: { $ne: assignmentId }
      });

      if (existingTeamAssignment) {
        throw new ConflictError(
          `Team member "${member.name || member.email}" already has an active assignment for this checklist.`
        );
      }

      teamMembers.push({
        userId: member._id,
        name: member.name || member.email,
        email: member.email,
        status: 'pending',
        assignedAt: new Date(),
      });
    }

    // Fetch assets - FIXED: Removed assignedTo population
    const assets = [];
    let customerId = null;
    let customerName = null;
    let customerEmail = null;

    if (assetIds && assetIds.length > 0) {
      for (const assetId of assetIds) {
        const asset = await Asset.findById(assetId).populate('adminId', 'name email customerName customerEmail');
        // Removed .populate('assignedTo', 'name email')
        
        if (asset) {
          assets.push({
            assetId: asset._id,
            assetName: asset.name || asset.assetName,
            assetTagNumber: asset.tagNumber || asset.assetTagNumber,
            assetLocation: asset.location || asset.assetLocation,
            assetCategory: asset.category || asset.assetCategory,
            assetStatus: asset.status,
            adminId: asset.adminId?._id,
            adminName: asset.adminId?.name,
            adminEmail: asset.adminId?.email,
          });

          if (asset.adminId && !customerId) {
            customerId = asset.adminId._id;
            customerName = asset.adminId.customerName || asset.adminId.name;
            customerEmail = asset.adminId.customerEmail || asset.adminId.email;
          }
        }
      }
    }

    // Update the assignment
    existingAssignment.assignedToTeamMembers = teamMembers;
    existingAssignment.assignedToAdmin = null;
    existingAssignment.assignedToAdminName = null;
    existingAssignment.assets = assets;
    existingAssignment.assetData = assets.map(asset => ({
      _id: asset.assetId,
      name: asset.assetName,
      tagNumber: asset.assetTagNumber,
      location: asset.assetLocation,
      category: asset.assetCategory,
    }));

    if (customerId) {
      existingAssignment.customerId = customerId;
      existingAssignment.customerName = customerName;
      existingAssignment.customerEmail = customerEmail;
    }

    if (dueDate) existingAssignment.dueDate = new Date(dueDate);
    if (priority) existingAssignment.priority = priority;
    if (notes) existingAssignment.notes = notes;

    existingAssignment.reassignedBy = reassignedByUserId;
    existingAssignment.reassignedByRole = reassignedByRole;
    existingAssignment.reassignedAt = new Date();
    existingAssignment.reassignmentHistory = existingAssignment.reassignmentHistory || [];
    existingAssignment.reassignmentHistory.push({
      fromType: 'admin',
      fromId: existingAssignment.assignedToAdmin,
      toType: 'team',
      toId: memberIdList,
      reassignedBy: reassignedByUserId,
      reassignedAt: new Date(),
      reason: notes || 'Reassigned to team'
    });

    await existingAssignment.save();
    return await this._populateAssignment(existingAssignment);
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
        .populate('checklist', 'name type category sections')
        .populate('assignedBy', 'name email role')
        .populate('assignedToAdmin', 'name email customerName')
        .populate('assignedToTeamMembers.userId', 'name email')
        .populate('assets.assetId', 'assetName tagNumber currentLocation assetCategory')
        .sort({ [sortField]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean(),
      Assignment.countDocuments(query),
    ]);

    const enhancedAssignments = assignments.map(assignment => ({
      ...assignment,
      displayData: {
        checklistInfo: {
          id: assignment.checklist?._id || assignment.checklist,
          name: assignment.checklistName,
          version: assignment.checklistVersion,
          type: assignment.checklist?.type,
          totalFields: assignment.checklistData?.totalFields ||
            assignment.checklist?.sections?.reduce((sum, s) => sum + (s.fields?.length || 0), 0) || 0,
        },
        assetInfo: (assignment.assets || []).map(asset => ({
          id: asset.assetId?._id || asset.assetId,
          name: asset.assetName,
          tagNumber: asset.assetTagNumber,
          location: asset.assetLocation,
          category: asset.assetCategory,
        })),
        customerInfo: {
          id: assignment.customerId,
          name: assignment.customerName,
          email: assignment.customerEmail,
        },
      }
    }));

    const stats = await this._getAssignmentStats(userId, userRole, filters);

    return {
      success: true,
      assignments: enhancedAssignments,
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

    const enhancedAssignment = {
      ...assignment.toObject(),
      displayData: {
        checklistInfo: {
          id: assignment.checklist?._id || assignment.checklist,
          name: assignment.checklistName,
          version: assignment.checklistVersion,
          type: assignment.checklist?.type,
          category: assignment.checklist?.category,
          sections: assignment.checklistData?.sections || assignment.checklist?.sections || [],
          totalFields: assignment.checklistData?.totalFields ||
            assignment.checklist?.sections?.reduce((sum, s) => sum + (s.fields?.length || 0), 0) || 0,
        },
        assetInfo: (assignment.assets || []).map(asset => ({
          id: asset.assetId?._id || asset.assetId,
          name: asset.assetName,
          tagNumber: asset.assetTagNumber,
          location: asset.assetLocation,
          category: asset.assetCategory,
        })),
        customerInfo: {
          id: assignment.customerId,
          name: assignment.customerName,
          email: assignment.customerEmail,
        },
      }
    };

    return enhancedAssignment;
  }

  // ═══════════════════════════════════════════════════════════════
  //  UTILITY FUNCTIONS - Check Existing Assignments
  // ═══════════════════════════════════════════════════════════════

  async checkExistingAssignment(checklistId, assigneeId, assigneeType) {
    const query = {
      checklist: checklistId,
      status: { $in: ['pending', 'in_progress', 'submitted'] }
    };

    if (assigneeType === 'admin') {
      query.assignedToAdmin = assigneeId;
    } else if (assigneeType === 'team') {
      query['assignedToTeamMembers.userId'] = assigneeId;
    }

    const existing = await Assignment.findOne(query);

    if (existing) {
      return {
        exists: true,
        assignment: existing,
        status: existing.status,
        message: `This checklist is already assigned to this ${assigneeType}`
      };
    }

    return { exists: false };
  }

  async getAssignmentHistory(checklistId, assigneeId, assigneeType) {
    const query = {
      checklist: checklistId,
      status: { $in: ['completed', 'approved', 'rejected'] }
    };

    if (assigneeType === 'admin') {
      query.assignedToAdmin = assigneeId;
    } else if (assigneeType === 'team') {
      query['assignedToTeamMembers.userId'] = assigneeId;
    }

    const history = await Assignment.find(query)
      .sort({ createdAt: -1 })
      .lean();

    return {
      hasHistory: history.length > 0,
      count: history.length,
      assignments: history
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  REMAINING METHODS
  // ═══════════════════════════════════════════════════════════════

  async getAssignmentDetails(assignmentId, userId, userRole) {
    const assignment = await this.getAssignmentById(assignmentId);

    let fullChecklist = assignment.checklistData;
    if (!fullChecklist || !fullChecklist.sections) {
      const checklist = await Checklist.findById(assignment.checklist._id)
        .populate('createdBy', 'name email');
      fullChecklist = {
        ...checklist.toObject(),
        totalFields: checklist.sections?.reduce((sum, s) => sum + (s.fields?.length || 0), 0) || 0,
      };
    }

    return {
      ...assignment,
      checklist: fullChecklist,
      assets: assignment.assetData || assignment.assets,
    };
  }

  async getSubmissionDetail(assignmentId, userId, userRole) {
    const assignment = await this.getAssignmentById(assignmentId);
    return assignment;
  }

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

    assignment.assignedToTeamMembers.forEach(tm => {
      tm.status = 'pending';
      tm.completedAt = null;
    });

    await assignment.save();
    return this._populateAssignment(assignment);
  }

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

  async deleteSubmission(assignmentId, userId, userRole) {
    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) throw new NotFoundError('Assignment not found');

    const isAuthorized = userRole === 'admin' || userRole === 'super_admin';
    if (!isAuthorized) {
      throw new AuthorizationError('Only administrators can delete submissions');
    }

    const submissionInfo = {
      id: assignment._id,
      checklistName: assignment.checklistName,
      assets: assignment.assets.map(a => a.assetName),
      submittedBy: assignment.assignedToTeamMembers[0]?.name || 'Unknown',
      submittedAt: assignment.submittedAt,
      status: assignment.submissionStatus,
    };

    await assignment.deleteOne();

    return {
      message: 'Submission deleted successfully',
      submission: submissionInfo,
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

    let checklist = assignment.checklistData;
    if (!checklist || !checklist.sections) {
      checklist = await Checklist.findById(assignment.checklist);
      if (!checklist) throw new NotFoundError('Checklist not found');
    }

    const totalFields = checklist.sections?.reduce(
      (sum, s) => sum + (s.fields?.length || 0), 0
    ) || 0;

    const processedResponses = this._processResponses(responses, checklist.sections || []);

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

    const memberEntry = assignment.assignedToTeamMembers.find(
      tm => tm.userId.toString() === userId.toString()
    );
    if (memberEntry && memberEntry.status === 'pending') {
      memberEntry.status = 'in_progress';
    }

    await assignment.save();
    return assignment;
  }

  async getInspectionHistory(userId, userRole, filters = {}) {
    try {
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

      const query = {};
      query.status = { $in: ['submitted', 'approved', 'rejected', 'completed'] };

      if (status && status !== 'all' && status !== 'undefined') {
        const submissionStatuses = ['pending_review', 'approved', 'rejected', 'needs_revision'];
        if (submissionStatuses.includes(status)) {
          query.submissionStatus = status;
        } else {
          query.status = status;
        }
      }

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

      if (dateFrom || dateTo) {
        query.submittedAt = {};
        if (dateFrom) query.submittedAt.$gte = new Date(dateFrom);
        if (dateTo) query.submittedAt.$lte = new Date(dateTo);
      }

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

      const page = Math.max(parseInt(rawPage, 10) || 1, 1);
      const limit = Math.min(parseInt(rawLimit, 10) || 20, 100);
      const skip = (page - 1) * limit;
      const sortDir = sortOrder === 'asc' ? 1 : -1;
      const sortField = sortBy === 'date' ? 'submittedAt' : sortBy;

      const [submissions, total] = await Promise.all([
        Assignment.find(query)
          .populate('checklist', 'name type category')
          .populate('assignedBy', 'name email')
          .populate('assignedToTeamMembers.userId', 'name email')
          .populate('assets.assetId', 'assetName assetId tagNumber currentLocation assetCategory')
          .populate('reviewedBy', 'name email')
          .sort({ [sortField]: sortDir, _id: sortDir })
          .skip(skip)
          .limit(limit)
          .lean(),
        Assignment.countDocuments(query),
      ]);

      const enhancedSubmissions = submissions.map(submission => ({
        ...submission,
        displaySummary: {
          checklistName: submission.checklistName,
          assetNames: (submission.assets || []).map(a => a.assetName).join(', '),
          assetCount: submission.assets?.length || 0,
          customerName: submission.customerName,
          submittedBy: submission.assignedToTeamMembers?.[0]?.name || 'Unknown',
        }
      }));

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
        submissions: enhancedSubmissions,
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
    query.dueDate = { ...(query.dueDate || {}), $ne: null };

    const assignments = await Assignment.find(query)
      .populate('checklist', 'name')
      .populate('assets.assetId', 'assetName assetId')
      .lean();

    const calendarMap = new Map();

    assignments.forEach(assignment => {
      if (!assignment.dueDate) return;

      const dateKey = new Date(assignment.dueDate).toISOString().split('T')[0];
      if (!calendarMap.has(dateKey)) calendarMap.set(dateKey, []);

      calendarMap.get(dateKey).push({
        id: assignment._id,
        title: assignment.checklistName || assignment.checklist?.name,
        checklistInfo: {
          id: assignment.checklist?._id || assignment.checklist,
          name: assignment.checklistName,
          type: assignment.checklist?.type,
        },
        assets: (assignment.assets || []).map(asset => ({
          id: asset.assetId?._id || asset.assetId,
          name: asset.assetName,
          tagNumber: asset.assetTagNumber,
          location: asset.assetLocation,
        })),
        assetCount: assignment.assets?.length || 0,
        priority: assignment.priority,
        status: assignment.status,
        dueDate: assignment.dueDate,
        completionRate: assignment.completionRate,
        customerName: assignment.customerName,
      });
    });

    return Array.from(calendarMap.entries())
      .map(([date, tasks]) => ({ date, tasks, count: tasks.length }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

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
      { header: 'Checklist Name', key: 'formName', width: 30 },
      { header: 'Assets', key: 'assets', width: 40 },
      { header: 'Customer', key: 'customer', width: 25 },
      { header: 'Due Date', key: 'dueDate', width: 15 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Submission Status', key: 'submissionStatus', width: 18 },
      { header: 'Completion Rate', key: 'completionRate', width: 15 },
      { header: 'Submitted At', key: 'submittedAt', width: 20 },
      { header: 'Priority', key: 'priority', width: 10 },
    ];

    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

    assignments.forEach(a => {
      const assetNames = (a.assets || [])
        .map(asset => asset.assetName || asset.assetId?.assetName || '')
        .filter(Boolean)
        .join(', ');

      worksheet.addRow({
        formName: a.checklistName || a.checklist?.name || '-',
        assets: assetNames || '-',
        customer: a.customerName || '-',
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

  _buildAssignmentQuery(userId, userRole, filters) {
    const query = {};
    const { status, priority, checklistId, search, dateFrom, dateTo, customerId, assetId } = filters;

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

  async _getAssignmentStats(userId, userRole, filters) {
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

  async _resolveAssets(assetIds) {
    if (!assetIds || !assetIds.length) return [];

    const assetIdList = Array.isArray(assetIds) ? assetIds : [assetIds];
    const assets = [];

    for (const assetId of assetIdList) {
      const asset = await Asset.findById(assetId)
        .populate('adminId', 'name email customerName customerEmail');
      // Removed .populate('assignedTo', 'name email')

      if (asset) {
        assets.push({
          assetId: asset._id,
          assetName: asset.name || asset.assetName,
          assetTagNumber: asset.tagNumber || asset.assetTagNumber,
          assetLocation: asset.location || asset.assetLocation,
          assetCategory: asset.category || asset.assetCategory,
          assetStatus: asset.status,
          adminId: asset.adminId?._id || asset.adminId,
          adminName: asset.adminId?.name || asset.adminId?.customerName,
          adminEmail: asset.adminId?.email || asset.adminId?.customerEmail,
        });
      }
    }

    return assets;
  }

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