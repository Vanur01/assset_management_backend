import Checklist from '../models/checklist.model.js';
import {
  AppError,
  NotFoundError,
  ForbiddenError,
  ValidationError,
  BadRequestError
} from '../errors/customError.js';
import AuditLog from '../models/auditLog.model.js';
import ChecklistSubmission from '../models/checklistSubmission.model.js';
import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import fs from 'fs';

class ChecklistService {
  /**
   * Helper to create audit logs
   */
  async createAuditLog({ action, resource, resourceId, actor, actorRole, description, status = 'success', changes = {}, metadata = {}, req = null }) {
    try {
      await AuditLog.create({
        action,
        resource,
        resourceId,
        actor,
        actorRole,
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
   * Build role-based query for fetching checklists
   * - super_admin: sees all non-deleted checklists
   * - admin: sees all non-deleted checklists (full access)
   */
  buildRoleBasedQuery(user, baseQuery = {}) {
    if (user.role === 'super_admin' || user.role === 'admin') {
      return { ...baseQuery, isDeleted: false };
    }

    // Invalid role
    throw new ForbiddenError('Invalid user role');
  }

  /**
   * Returns true when the user is allowed to mutate (update/delete) a checklist.
   * Both admin and super_admin have full access.
   */
  async hasModifyPermission(checklistId, user) {
    if (user.role === 'super_admin' || user.role === 'admin') {
      return true;
    }
    return false;
  }

  /**
   * Validate the shape of every field in a checklist definition.
   */
  validateFields(fields) {
    if (!Array.isArray(fields)) {
      throw new ValidationError('Fields must be an array');
    }

    const validTypes = [
      'text_input',
      'text_area',
      'dropdown',
      'checkbox',
      'rating',
      'image_upload',
      'signature',
      'date',
      'file_upload',
    ];

    for (const field of fields) {
      if (!field.type || !validTypes.includes(field.type)) {
        throw new ValidationError(`Invalid field type: ${field.type}`);
      }
      if (!field.label) {
        throw new ValidationError('All fields must have a label');
      }
      if (
        (field.type === 'dropdown' || field.type === 'checkbox') &&
        (!field.options || !field.options.length)
      ) {
        throw new ValidationError(`Field "${field.label}" must have options`);
      }
      if (
        field.type === 'rating' &&
        (!field.validation?.min || !field.validation?.max)
      ) {
        throw new ValidationError(
          `Rating field "${field.label}" must have min and max values`
        );
      }
    }
  }

  /**
   * Assign stable _ids and normalize ordering.
   */
  normalizeFields(fields) {
    return fields.map((field, index) => ({
      ...field,
      _id: field._id || new mongoose.Types.ObjectId(),
      order: field.order !== undefined ? field.order : index,
    }));
  }

  /**
   * Fully populate a checklist document.
   */
  async populateChecklist(checklist) {
    return Checklist.findById(checklist._id)
      .populate('createdBy', 'firstName lastName email profileImage role')
      .populate('deletedBy', 'firstName lastName email')
      .populate('clonedFrom', 'name')
      .populate('importSource.importedBy', 'firstName lastName email')
      .lean();
  }

  /**
   * Shared helper that attaches submission stats + permission flags.
   */
  attachMeta(checklist, submissionCount, user) {
    // Both admin and super_admin can edit and delete any checklist
    const canEdit = user.role === 'super_admin' || user.role === 'admin';
    const canDelete = user.role === 'super_admin' || user.role === 'admin';

    return {
      ...checklist,
      submissionCount: submissionCount ?? 0,
      totalFields: checklist.fields?.length ?? 0,
      canEdit,
      canDelete,
      typeDisplay: this.getTypeDisplay(checklist.checklistType, checklist.isGlobal),
    };
  }

  getTypeDisplay(checklistType, isGlobal) {
    if (isGlobal) return '🌍 Global Checklist';
    if (checklistType === 'import') return '📥 Imported Checklist';
    return '📝 Custom Checklist';
  }

  // ============================================================
  // 1. CREATE CHECKLIST
  // ============================================================
  async createChecklist(data, user, req = null) {
    const {
      name,
      description,
      fields,
      settings,
      category,
      tags,
      checklistType = 'custom',
      isGlobal = false,
    } = data;

    if (!name || !fields?.length) {
      throw new BadRequestError('Name and at least one field are required');
    }

    try {
      this.validateFields(fields);

      const checklist = await Checklist.create({
        name,
        description,
        fields: this.normalizeFields(fields),
        settings: settings || {},
        category: category || 'general',
        tags: tags || [],
        checklistType,
        isGlobal: checklistType === 'global' ? true : isGlobal,
        createdBy: user._id,
        createdByRole: user.role,
        version: 1,
      });

      const populatedChecklist = await this.populateChecklist(checklist);

      // Create audit log
      await this.createAuditLog({
        action: 'CREATE',
        resource: 'checklist',
        resourceId: checklist._id,
        actor: user._id,
        actorRole: user.role,
        description: `Checklist "${name}" created successfully`,
        status: 'success',
        changes: {
          new: {
            name,
            description,
            checklistType,
            isGlobal: checklistType === 'global' ? true : isGlobal,
            category,
            tags,
            fieldsCount: fields.length
          }
        },
        metadata: {
          checklistType,
          isGlobal: checklistType === 'global' ? true : isGlobal,
          fieldsCount: fields.length
        },
        req
      });

      return populatedChecklist;
    } catch (error) {
      // Create audit log for failure
      await this.createAuditLog({
        action: 'CREATE',
        resource: 'checklist',
        actor: user._id,
        actorRole: user.role,
        description: `Failed to create checklist "${name || 'unnamed'}": ${error.message}`,
        status: 'failure',
        metadata: {
          error: error.message,
          checklistType,
          isGlobal
        },
        req
      });
      throw error;
    }
  }

  // ============================================================
  // 2. GET ALL CHECKLISTS
  // ============================================================
  async getChecklists(filters, user, req = null) {
    const {
      page = 1,
      limit = 10,
      search,
      category,
      status,
      tag,
      checklistType,
      isGlobal,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = filters;

    const query = this.buildRoleBasedQuery(user);

    // Search across name + description
    if (search) {
      const searchCondition = {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
        ],
      };
      query.$and = [...(query.$and || []), searchCondition];
    }

    if (category && category !== 'all') query.category = category;
    if (status) query.status = status;
    if (tag) query.tags = tag;
    if (checklistType && checklistType !== 'all') query.checklistType = checklistType;
    if (isGlobal !== undefined && isGlobal !== 'all') {
      query.isGlobal = isGlobal === 'true' || isGlobal === true;
    }

    const sortOptions = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const [checklists, total] = await Promise.all([
      Checklist.find(query)
        .populate('createdBy', 'firstName lastName email profileImage role')
        .populate('deletedBy', 'firstName lastName email')
        .populate('clonedFrom', 'name')
        .sort(sortOptions)
        .limit(Number(limit))
        .skip((Number(page) - 1) * Number(limit))
        .lean(),
      Checklist.countDocuments(query),
    ]);

    // Fetch submission counts
    const checklistIds = checklists.map((c) => c._id);
    const submissionCounts = await ChecklistSubmission.aggregate([
      { $match: { checklist: { $in: checklistIds } } },
      { $group: { _id: '$checklist', count: { $sum: 1 } } },
    ]);
    const submissionMap = Object.fromEntries(
      submissionCounts.map((s) => [s._id.toString(), s.count])
    );

    // Create audit log for view action (optional, can be skipped for performance)
    if (page === 1 && !search) { // Only log first page without search to avoid excessive logs
      await this.createAuditLog({
        action: 'VIEW',
        resource: 'checklist',
        actor: user._id,
        actorRole: user.role,
        description: `Retrieved checklists list - page ${page}, total ${total} records`,
        status: 'success',
        metadata: {
          page,
          limit,
          total,
          filters: { search, category, checklistType, isGlobal }
        },
        req
      });
    }

    return {
      checklists: checklists.map((c) =>
        this.attachMeta(c, submissionMap[c._id.toString()], user)
      ),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
      userRole: user.role,
      filters: { checklistType, isGlobal },
    };
  }

  // ============================================================
  // 3. GET CHECKLIST BY ID
  // ============================================================
  async getChecklistById(id, user, req = null) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequestError('Invalid checklist ID');
    }

    const query = this.buildRoleBasedQuery(user, { _id: id });

    const checklist = await Checklist.findOne(query)
      .populate('createdBy', 'firstName lastName email profileImage role')
      .populate('deletedBy', 'firstName lastName email')
      .populate('clonedFrom', 'name')
      .populate('importSource.importedBy', 'firstName lastName email')
      .lean();

    if (!checklist) {
      // Log failed view attempt
      await this.createAuditLog({
        action: 'VIEW',
        resource: 'checklist',
        resourceId: id,
        actor: user._id,
        actorRole: user.role,
        description: `Failed to view checklist - checklist not found`,
        status: 'failure',
        metadata: { checklistId: id },
        req
      });
      throw new NotFoundError('Checklist');
    }

    const submissions = await ChecklistSubmission.find({
      checklist: id,
    }).lean();

    // Create audit log
    await this.createAuditLog({
      action: 'VIEW',
      resource: 'checklist',
      resourceId: id,
      actor: user._id,
      actorRole: user.role,
      description: `Viewed checklist "${checklist.name}" details`,
      status: 'success',
      metadata: {
        checklistName: checklist.name,
        checklistType: checklist.checklistType,
        isGlobal: checklist.isGlobal,
        submissionsCount: submissions.length
      },
      req
    });

    return {
      ...this.attachMeta(checklist, submissions.length, user),
      recentSubmissions: submissions.slice(-5).map((s) => ({
        id: s._id,
        submittedAt: s.metadata?.submittedAt,
        submittedBy: s.submittedBy,
      })),
    };
  }

  // ============================================================
  // 4. UPDATE CHECKLIST (Add this method if missing)
  // ============================================================
  async updateChecklist(id, updateData, user, req = null) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequestError('Invalid checklist ID');
    }

    const hasPermission = await this.hasModifyPermission(id, user);
    if (!hasPermission) {
      await this.createAuditLog({
        action: 'UPDATE',
        resource: 'checklist',
        resourceId: id,
        actor: user._id,
        actorRole: user.role,
        description: `Failed to update checklist - permission denied`,
        status: 'failure',
        metadata: { checklistId: id },
        req
      });
      throw new ForbiddenError('You do not have permission to update this checklist');
    }

    const originalChecklist = await Checklist.findOne({ _id: id, isDeleted: false });
    if (!originalChecklist) {
      throw new NotFoundError('Checklist');
    }

    // Validate fields if being updated
    if (updateData.fields) {
      this.validateFields(updateData.fields);
      updateData.fields = this.normalizeFields(updateData.fields);
    }

    const updatedChecklist = await Checklist.findOneAndUpdate(
      { _id: id, isDeleted: false },
      {
        $set: {
          ...updateData,
          updatedAt: new Date()
        }
      },
      { new: true }
    )
      .populate('createdBy', 'firstName lastName email profileImage role')
      .lean();

    if (!updatedChecklist) {
      throw new NotFoundError('Checklist');
    }

    // Create audit log
    await this.createAuditLog({
      action: 'UPDATE',
      resource: 'checklist',
      resourceId: id,
      actor: user._id,
      actorRole: user.role,
      description: `Updated checklist "${originalChecklist.name}"`,
      status: 'success',
      changes: {
        old: {
          name: originalChecklist.name,
          description: originalChecklist.description,
          category: originalChecklist.category,
          tags: originalChecklist.tags,
          fieldsCount: originalChecklist.fields?.length
        },
        new: {
          name: updatedChecklist.name,
          description: updatedChecklist.description,
          category: updatedChecklist.category,
          tags: updatedChecklist.tags,
          fieldsCount: updatedChecklist.fields?.length
        }
      },
      metadata: {
        updatedFields: Object.keys(updateData)
      },
      req
    });

    return updatedChecklist;
  }

  // ============================================================
  // 5. SOFT DELETE CHECKLIST
  // ============================================================
  async deleteChecklist(id, user, req = null) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequestError('Invalid checklist ID');
    }

    const hasPermission = await this.hasModifyPermission(id, user);
    if (!hasPermission) {
      await this.createAuditLog({
        action: 'DELETE',
        resource: 'checklist',
        resourceId: id,
        actor: user._id,
        actorRole: user.role,
        description: `Failed to delete checklist - permission denied`,
        status: 'failure',
        metadata: { checklistId: id },
        req
      });
      throw new ForbiddenError('You do not have permission to delete this checklist');
    }

    const submissionCount = await ChecklistSubmission.countDocuments({
      checklist: id,
    });

    const matchQuery = {
      _id: id,
      isDeleted: false,
    };

    const checklist = await Checklist.findOne(matchQuery);
    if (!checklist) {
      throw new NotFoundError('Checklist');
    }

    const deletedChecklist = await Checklist.findOneAndUpdate(
      matchQuery,
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy: user._id,
          status: 'archived',
        },
      },
      { new: true }
    );

    // Create audit log
    await this.createAuditLog({
      action: 'DELETE',
      resource: 'checklist',
      resourceId: id,
      actor: user._id,
      actorRole: user.role,
      description: `Soft deleted checklist "${checklist.name}"`,
      status: 'success',
      changes: {
        old: {
          name: checklist.name,
          status: checklist.status,
          isDeleted: false
        },
        new: {
          isDeleted: true,
          status: 'archived',
          deletedAt: new Date()
        }
      },
      metadata: {
        checklistName: checklist.name,
        submissionCount,
        checklistType: checklist.checklistType
      },
      req
    });

    return deletedChecklist;
  }

  // ============================================================
  // 6. RESTORE CHECKLIST
  // ============================================================
  async restoreChecklist(id, user, req = null) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequestError('Invalid checklist ID');
    }

    const matchQuery = { _id: id, isDeleted: true };

    const checklist = await Checklist.findOne(matchQuery);
    if (!checklist) {
      throw new NotFoundError('Deleted checklist');
    }

    const restoredChecklist = await Checklist.findOneAndUpdate(
      matchQuery,
      {
        $set: {
          isDeleted: false,
          deletedAt: null,
          deletedBy: null,
          status: 'published',
        },
      },
      { new: true }
    )
      .populate('createdBy', 'firstName lastName email')
      .lean();

    // Create audit log
    await this.createAuditLog({
      action: 'RESTORE',
      resource: 'checklist',
      resourceId: id,
      actor: user._id,
      actorRole: user.role,
      description: `Restored checklist "${checklist.name}" from deletion`,
      status: 'success',
      changes: {
        old: {
          isDeleted: true,
          status: 'archived',
          deletedAt: checklist.deletedAt
        },
        new: {
          isDeleted: false,
          status: 'published',
          deletedAt: null
        }
      },
      metadata: {
        checklistName: checklist.name,
        checklistType: checklist.checklistType
      },
      req
    });

    return restoredChecklist;
  }

  // ============================================================
  // 7. GET DELETED CHECKLISTS
  // ============================================================
  async getDeletedChecklists(filters, user, req = null) {
    const { page = 1, limit = 10, search } = filters;

    const query = { isDeleted: true };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const [checklists, total] = await Promise.all([
      Checklist.find(query)
        .populate('createdBy', 'firstName lastName email')
        .populate('deletedBy', 'firstName lastName email')
        .sort({ deletedAt: -1 })
        .limit(Number(limit))
        .skip((Number(page) - 1) * Number(limit))
        .lean(),
      Checklist.countDocuments(query),
    ]);

    // Create audit log
    if (page === 1) {
      await this.createAuditLog({
        action: 'VIEW_DELETED',
        resource: 'checklist',
        actor: user._id,
        actorRole: user.role,
        description: `Retrieved deleted checklists list - found ${total} deleted records`,
        status: 'success',
        metadata: {
          page,
          limit,
          total,
          hasSearch: !!search
        },
        req
      });
    }

    return {
      checklists,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    };
  }

  // ============================================================
  // 8. PERMANENT DELETE (both admin and super_admin)
  // ============================================================
  async permanentDeleteChecklist(id, user, req = null) {
    if (user.role !== 'super_admin' && user.role !== 'admin') {
      await this.createAuditLog({
        action: 'PERMANENT_DELETE',
        resource: 'checklist',
        resourceId: id,
        actor: user._id,
        actorRole: user.role,
        description: `Failed to permanently delete checklist - permission denied`,
        status: 'failure',
        metadata: { checklistId: id, requiredRole: 'admin or super_admin' },
        req
      });
      throw new ForbiddenError('Only admin and super admin can permanently delete checklists');
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequestError('Invalid checklist ID');
    }

    const checklist = await Checklist.findOne({ _id: id, isDeleted: true });
    if (!checklist) {
      throw new NotFoundError('Deleted checklist');
    }

    const submissionCount = await ChecklistSubmission.countDocuments({ checklist: id });
    if (submissionCount > 0) {
      await this.createAuditLog({
        action: 'PERMANENT_DELETE',
        resource: 'checklist',
        resourceId: id,
        actor: user._id,
        actorRole: user.role,
        description: `Failed to permanently delete checklist "${checklist.name}" - has ${submissionCount} submissions`,
        status: 'failure',
        metadata: {
          checklistName: checklist.name,
          submissionCount,
          error: 'Cannot delete checklist with existing submissions'
        },
        req
      });
      throw new BadRequestError(
        `Cannot permanently delete checklist with ${submissionCount} submissions. Delete submissions first.`
      );
    }

    await Checklist.findOneAndDelete({ _id: id, isDeleted: true });

    // Create audit log
    await this.createAuditLog({
      action: 'PERMANENT_DELETE',
      resource: 'checklist',
      resourceId: id,
      actor: user._id,
      actorRole: user.role,
      description: `Permanently deleted checklist "${checklist.name}"`,
      status: 'success',
      metadata: {
        checklistName: checklist.name,
        checklistType: checklist.checklistType,
        createdBy: checklist.createdBy,
        createdAt: checklist.createdAt,
        fieldsCount: checklist.fields?.length
      },
      req
    });

    return checklist;
  }

  // ============================================================
  // 9. CLONE CHECKLIST
  // ============================================================
  async cloneChecklist(id, cloneData, user, req = null) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequestError('Invalid checklist ID');
    }

    const { newName, includeSubmissions = false } = cloneData;

    const query = this.buildRoleBasedQuery(user, { _id: id });
    const originalChecklist = await Checklist.findOne(query);
    if (!originalChecklist) {
      await this.createAuditLog({
        action: 'CLONE',
        resource: 'checklist',
        resourceId: id,
        actor: user._id,
        actorRole: user.role,
        description: `Failed to clone checklist - original checklist not found`,
        status: 'failure',
        metadata: { originalChecklistId: id },
        req
      });
      throw new NotFoundError('Original checklist');
    }

    // Resolve a unique name
    let finalName = newName || `${originalChecklist.name} (Copy)`;
    const nameExists = await Checklist.findOne({
      name: finalName,
      isDeleted: false,
    });
    if (nameExists) finalName = `${finalName} - ${Date.now()}`;

    // Cloned checklist is always custom type, never global
    const clonedChecklist = await Checklist.create({
      name: finalName,
      description: originalChecklist.description,
      fields: originalChecklist.fields.map((f) => ({
        ...f.toObject(),
        _id: new mongoose.Types.ObjectId(),
      })),
      settings: originalChecklist.settings,
      category: originalChecklist.category,
      tags: [...originalChecklist.tags],
      createdBy: user._id,
      createdByRole: user.role,
      version: 1,
      status: 'draft',
      clonedFrom: originalChecklist._id,
      clonedAt: new Date(),
      checklistType: 'custom', // clones are always custom
      isGlobal: false,
    });

    let submissionsCloned = false;
    if (includeSubmissions) {
      const submissions = await ChecklistSubmission.find({
        checklist: id,
      });

      for (const submission of submissions) {
        await ChecklistSubmission.create({
          checklist: clonedChecklist._id,
          checklistName: clonedChecklist.name,
          responses: submission.responses,
          metadata: {
            ...submission.metadata,
            clonedFrom: submission._id,
            clonedAt: new Date(),
          },
          submittedBy: submission.submittedBy,
          status: submission.status,
        });
      }
      submissionsCloned = true;
    }

    // Create audit log
    await this.createAuditLog({
      action: 'CLONE',
      resource: 'checklist',
      resourceId: clonedChecklist._id,
      actor: user._id,
      actorRole: user.role,
      description: `Cloned checklist "${originalChecklist.name}" to "${finalName}"`,
      status: 'success',
      metadata: {
        originalChecklistId: id,
        originalChecklistName: originalChecklist.name,
        clonedChecklistName: finalName,
        includeSubmissions,
        submissionsCloned,
        submissionsCount: submissionsCloned ? await ChecklistSubmission.countDocuments({ checklist: id }) : 0
      },
      req
    });

    return {
      checklist: await this.populateChecklist(clonedChecklist),
      submissionsCloned,
    };
  }

  // ============================================================
  // 10. GET CLONEABLE CHECKLISTS
  // ============================================================
  async getCloneableChecklists(filters, user, req = null) {
    const { page = 1, limit = 10, search, category } = filters;

    const query = this.buildRoleBasedQuery(user, { status: 'published' });

    if (search) {
      query.$and = [
        ...(query.$and || []),
        {
          $or: [
            { name: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } },
          ],
        },
      ];
    }
    if (category && category !== 'all') query.category = category;

    const [checklists, total] = await Promise.all([
      Checklist.find(query)
        .populate('createdBy', 'firstName lastName email role')
        .sort({ createdAt: -1 })
        .limit(Number(limit))
        .skip((Number(page) - 1) * Number(limit))
        .lean(),
      Checklist.countDocuments(query),
    ]);

    // Create audit log (only for first page to avoid excessive logs)
    if (page === 1) {
      await this.createAuditLog({
        action: 'VIEW_CLONEABLE',
        resource: 'checklist',
        actor: user._id,
        actorRole: user.role,
        description: `Retrieved cloneable checklists - ${total} available for cloning`,
        status: 'success',
        metadata: {
          page,
          limit,
          total,
          filters: { search, category }
        },
        req
      });
    }

    return {
      checklists,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    };
  }

  // ============================================================
  // 11. CHECKLIST TYPES SUMMARY
  // ============================================================
  async getChecklistTypesSummary(user, req = null) {
    const baseMatch = { isDeleted: false };

    const [byType, recentImports] = await Promise.all([
      Checklist.aggregate([
        { $match: baseMatch },
        {
          $group: {
            _id: '$checklistType',
            count: { $sum: 1 },
            totalFields: { $sum: { $size: '$fields' } },
          },
        },
        {
          $project: {
            type: '$_id',
            count: 1,
            totalFields: 1,
            averageFieldsPerChecklist: {
              $round: [{ $divide: ['$totalFields', '$count'] }, 2],
            },
          },
        },
      ]),

      Checklist.aggregate([
        { $match: { ...baseMatch, checklistType: 'import' } },
        {
          $group: {
            _id: '$importSource.fileName',
            count: { $sum: 1 },
            lastImported: { $max: '$importSource.importedAt' },
          },
        },
        { $sort: { lastImported: -1 } },
        { $limit: 10 },
      ]),
    ]);

    const totalChecklists = byType.reduce((sum, item) => sum + item.count, 0);

    // Create audit log
    await this.createAuditLog({
      action: 'VIEW_SUMMARY',
      resource: 'checklist',
      actor: user._id,
      actorRole: user.role,
      description: `Retrieved checklist types summary - total ${totalChecklists} checklists`,
      status: 'success',
      metadata: {
        totalChecklists,
        byType: byType.map(t => ({ type: t.type, count: t.count })),
        recentImportsCount: recentImports.length
      },
      req
    });

    return {
      byType,
      recentImports,
      totalChecklists,
    };
  }

  // ============================================================
  // 12. IMPORT FROM EXCEL
  // ============================================================
  async importFromExcel(filePath, user, options = {}, req = null) {
    const {
      checklistType = 'import',
      isGlobal = false,
    } = options;

    const workbook = new ExcelJS.Workbook();

    try {
      await workbook.xlsx.readFile(filePath);
    } catch (error) {
      await this.createAuditLog({
        action: 'IMPORT',
        resource: 'checklist',
        actor: user._id,
        actorRole: user.role,
        description: `Failed to import checklists from Excel - file parsing error: ${error.message}`,
        status: 'failure',
        metadata: {
          fileName: options.fileName,
          checklistType,
          isGlobal,
          error: error.message
        },
        req
      });
      throw new BadRequestError(`Failed to parse Excel file: ${error.message}`);
    }

    const worksheet = workbook.worksheets[0];

    if (!worksheet) {
      throw new BadRequestError('Excel file has no worksheets');
    }

    const checklists = [];
    const errors = [];
    let headers = [];

    // Iterate through rows
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        headers = [];
        row.eachCell((cell, colNumber) => {
          headers[colNumber] = cell.value ? cell.value.toString() : `column_${colNumber}`;
        });
        return;
      }

      try {
        const record = {};

        row.eachCell((cell, colNumber) => {
          const header = headers[colNumber];
          if (header) {
            let value = cell.value;
            if (value && typeof value === 'object') {
              if (value.text) value = value.text;
              else if (value.result) value = value.result;
              else if (value.model) value = value.model;
            }
            record[header] = value;
          }
        });

        if (!record.name) return;

        let fields = [];
        if (record.fields) {
          try {
            fields = typeof record.fields === 'string'
              ? JSON.parse(record.fields)
              : record.fields;
          } catch (parseError) {
            throw new Error(`Invalid fields JSON: ${parseError.message}`);
          }
        }

        this.validateFields(fields);

        let tags = [];
        if (record.tags) {
          tags = typeof record.tags === 'string'
            ? record.tags.split(',').map((t) => t.trim())
            : (Array.isArray(record.tags) ? record.tags : []);
        }

        let settings = {};
        if (record.settings) {
          try {
            settings = typeof record.settings === 'string'
              ? JSON.parse(record.settings)
              : record.settings;
          } catch (parseError) {
            settings = {};
          }
        }

        checklists.push({
          name: record.name.toString(),
          description: record.description ? record.description.toString() : '',
          fields: this.normalizeFields(fields),
          settings: settings,
          category: record.category ? record.category.toString() : 'general',
          tags: tags,
          checklistType: checklistType === 'global' ? 'global' : 'import',
          isGlobal: checklistType === 'global' ? true : isGlobal,
          createdBy: user._id,
          createdByRole: user.role,
          importSource: {
            fileName: options.fileName || 'imported_file.xlsx',
            importedAt: new Date(),
            importedBy: user._id,
            rowNumber,
          },
        });
      } catch (err) {
        errors.push({ row: rowNumber, error: err.message });
      }
    });

    if (checklists.length === 0 && errors.length === 0) {
      throw new BadRequestError('No valid checklists found in the Excel file. Please ensure the file contains data.');
    }

    const created = [];
    for (const data of checklists) {
      try {
        const newChecklist = await Checklist.create(data);
        created.push(await this.populateChecklist(newChecklist));
      } catch (dbError) {
        errors.push({
          row: data.importSource?.rowNumber || 'unknown',
          error: `Database error: ${dbError.message}`
        });
      }
    }

    // Create audit log for successful import
    await this.createAuditLog({
      action: 'IMPORT',
      resource: 'checklist',
      actor: user._id,
      actorRole: user.role,
      description: `Imported ${created.length} checklist(s) from Excel file "${options.fileName}"`,
      status: created.length > 0 ? 'success' : 'failure',
      metadata: {
        fileName: options.fileName,
        importedCount: created.length,
        errorCount: errors.length,
        checklistType,
        isGlobal,
        importedChecklistNames: created.map(c => c.name),
        errors: errors.length > 0 ? errors : undefined
      },
      req
    });

    // Clean up temp file
    try {
      fs.unlinkSync(filePath);
    } catch (unlinkError) {
      console.error('Failed to delete temporary file:', unlinkError);
    }

    return {
      imported: created.length,
      errors,
      checklists: created,
      importSummary: {
        fileName: options.fileName || 'imported_file.xlsx',
        importedBy: user.email,
        importedAt: new Date(),
        checklistType,
        isGlobal: checklistType === 'global' ? true : isGlobal,
        totalRows: checklists.length + errors.length,
        successfulRows: created.length,
        failedRows: errors.length,
      },
    };
  }
}

export default new ChecklistService();