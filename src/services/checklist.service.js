import Checklist, { CHECKLIST_FIELD_TYPES } from '../models/checklist.model.js';
import ChecklistRequest    from '../models/Checklistrequest.model.js';
import ChecklistSubmission from '../models/checklistSubmission.model.js';
import {
  ValidationError,
  NotFoundError,
  AuthorizationError,
  BadRequestError,
} from '../errors/customError.js';
import XLSX from 'xlsx';
import fs   from 'fs';

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_IMPORT_TYPES = [
  'text_input', 'text_area', 'dropdown', 'checkbox',
  'rating', 'signature', 'date_picker', 'image_upload',
  'file_upload', 'number_input', 'email_input', 'phone_input',
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[\+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{4,9}$/;

// ─── ChecklistService ─────────────────────────────────────────────────────────

class ChecklistService {

  // ==================== VALIDATION HELPERS ====================

  /**
   * Validate a single field's configuration.
   * Returns an array of error strings (empty = valid).
   */
  validateField(field) {
    const errors = [];

    if (!field.label?.trim()) {
      errors.push('Field label is required');
    }

    switch (field.fieldType) {
      case 'dropdown':
      case 'multi_select':
        if (!field.options?.length) {
          errors.push(`${field.fieldType} fields must have at least one option`);
        }
        break;

      case 'checkbox':
        if (!field.checkboxItems?.length) {
          errors.push('Checkbox fields must have at least one item');
        }
        break;

      case 'rating':
        if (field.ratingMax < 1 || field.ratingMax > 10) {
          errors.push('Rating max must be between 1 and 10');
        }
        break;

      case 'number_input':
      case 'slider':
        if (
          field.minValue !== null &&
          field.maxValue !== null &&
          field.minValue >= field.maxValue
        ) {
          errors.push('Min value must be less than max value');
        }
        break;

      case 'text_input':
      case 'text_area': {
        const { minLength, maxLength } = field.validationRules ?? {};
        if (minLength != null && minLength < 0) {
          errors.push('Min length cannot be negative');
        }
        if (maxLength != null && maxLength < 0) {
          errors.push('Max length cannot be negative');
        }
        if (minLength != null && maxLength != null && minLength > maxLength) {
          errors.push('Min length cannot exceed max length');
        }
        break;
      }
    }

    return errors;
  }

  /**
   * Validate all sections & fields.
   * Throws ValidationError on failure.
   */
  validateSections(sections) {
    const errors = [];

    if (!sections?.length) {
      errors.push('At least one section is required');
    }

    sections?.forEach((section, idx) => {
      if (!section.sectionTitle?.trim()) {
        errors.push(`Section ${idx + 1} must have a title`);
      }

      if (!section.fields?.length) {
        errors.push(`Section "${section.sectionTitle || idx + 1}" must have at least one field`);
      }

      section.fields?.forEach((field, fIdx) => {
        const fieldErrors = this.validateField(field);
        if (fieldErrors.length) {
          errors.push(
            `Section "${section.sectionTitle}", Field ${fIdx + 1} (${field.label}): ${fieldErrors.join(', ')}`
          );
        }
      });
    });

    if (errors.length) throw new ValidationError(errors);
  }

  // ==================== QUERY BUILDERS ====================

  buildChecklistQuery(userId, userRole, filters = {}) {
    const query = { status: { $ne: 'deleted' } };

    if (userRole === 'admin') {
      query.createdBy = userId;
    }

    if (filters.type)        query.type     = filters.type;
    if (filters.status)      query.status   = filters.status;
    if (filters.category)    query.category = filters.category;
    if (filters.subcategory) query.subcategory = filters.subcategory;
    if (filters.search)      query.$text    = { $search: filters.search };
    if (filters.isApproved !== undefined) {
      query.isApproved = filters.isApproved === 'true' || filters.isApproved === true;
    }

    return query;
  }

  buildRequestQuery(userId, userRole, filters = {}) {
    const query = {};

    if (userRole === 'admin') {
      query.requestedBy = userId;
    }

    if (filters.status)      query.status      = filters.status;
    if (filters.urgencyLevel) query.urgencyLevel = filters.urgencyLevel;
    if (filters.search) {
      query.$or = [
        { checklistName:    { $regex: filters.search, $options: 'i' } },
        { requestedByName:  { $regex: filters.search, $options: 'i' } },
      ];
    }

    return query;
  }

  // ==================== PAGINATION HELPER ====================

  buildPagination(page, limit, total) {
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

  // ==================== CHECKLIST CRUD ====================

  async createChecklist(userId, userRole, data) {
    const { name, description, category, subcategory, tags, type, sections, settings } = data;

    if (sections?.length) {
      this.validateSections(sections);
    }

    const isGlobal = type === 'global';

    const checklist = await Checklist.create({
      name,
      description:   description   || '',
      category:      category      || 'General',
      subcategory:   subcategory   || '',
      tags:          tags          || [],
      type:          type          || 'custom',
      sections:      sections      || [],
      settings:      settings      || {},
      createdBy:     userId,
      createdByRole: userRole,
      status:        'active',
      isApproved:    true,
      approvedBy:    isGlobal ? userId    : null,
      approvedAt:    isGlobal ? new Date() : null,
    });
    console.log("data....", checklist)

    return checklist._doc;
  }

  async getChecklists(userId, userRole, filters = {}) {
    const {
      page     = 1,
      limit    = 20,
      sortBy   = 'createdAt',
      sortOrder = 'desc',
    } = filters;

    const query       = this.buildChecklistQuery(userId, userRole, filters);
    const skip        = (page - 1) * limit;
    const sortOptions = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const [checklists, total] = await Promise.all([
      Checklist.find(query)
        .populate('createdBy', 'name email role')
        .populate('clonedFrom', 'name')
        .sort(sortOptions)
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Checklist.countDocuments(query),
    ]);

    return { checklists, pagination: this.buildPagination(Number(page), Number(limit), total) };
  }

  async getChecklistById(checklistId) {
    const checklist = await Checklist.findById(checklistId)
      .populate('createdBy',  'name email role')
      .populate('clonedFrom', 'name')
      .populate('approvedBy', 'name email');

    if (!checklist) throw new NotFoundError('Checklist not found');

    const [requestCount, submissionCount] = await Promise.all([
      ChecklistRequest.countDocuments({ createdChecklistId: checklistId }),
      ChecklistSubmission.countDocuments({ checklistId }),
    ]);

    return { ...checklist.toObject(), requestCount, submissionCount };
  }

  async deleteChecklist(checklistId, userId, userRole) {
    const checklist = await Checklist.findById(checklistId);
    if (!checklist) throw new NotFoundError('Checklist not found');

    if (userRole === 'admin' && checklist.createdBy.toString() !== userId.toString()) {
      throw new AuthorizationError('You can only delete your own checklists');
    }

    await Checklist.findByIdAndUpdate(checklistId, { status: 'deleted' });
    return { deleted: true, id: checklistId };
  }

  // ==================== CLONE ====================

  async getCloneList(userId, userRole, filters = {}) {
    const { page = 1, limit = 20, search } = filters;
    const query = { status: 'active', isApproved: true };

    if (userRole === 'admin') {
      query.$or = [
        { createdBy: userId, type: { $in: ['custom', 'clone'] } },
        { type: 'global' },
      ];
    }

    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

    const skip = (page - 1) * limit;

    const [checklists, total] = await Promise.all([
      Checklist.find(query)
        .populate('createdBy', 'name email role')
        .sort('-createdAt')
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Checklist.countDocuments(query),
    ]);

    return { checklists, pagination: this.buildPagination(Number(page), Number(limit), total) };
  }

  async cloneChecklist(userId, userRole, checklistId, newName, options = {}) {
    const original = await Checklist.findById(checklistId);
    if (!original) throw new NotFoundError('Checklist not found');

    if (userRole === 'admin') {
      const canClone =
        original.createdBy.toString() === userId.toString() ||
        original.type === 'global';
      if (!canClone) {
        throw new AuthorizationError(
          'You can only clone your own checklists or global checklists'
        );
      }
    }

    // Bump version: "v1.0" → "v1.1"
    const currentVersion = parseFloat(original.version?.replace('v', '') ?? '1.0');
    const nextVersion    = `v${(currentVersion + 0.1).toFixed(1)}`;

    const [cloned] = await Promise.all([
      Checklist.create({
        name:          newName || `${original.name} (Clone)`,
        description:   original.description,
        category:      original.category,
        subcategory:   original.subcategory,
        tags:          [...original.tags],
        sections:      JSON.parse(JSON.stringify(original.sections)),
        settings:      original.settings,
        type:          'clone',
        clonedFrom:    original._id,
        createdBy:     userId,
        createdByRole: userRole,
        status:        'active',
        isApproved:    false,
        version:       nextVersion,
      }),
      Checklist.findByIdAndUpdate(checklistId, {
        $inc: { usageCount: 1 },
        lastUsedAt: new Date(),
      }),
    ]);

    return cloned.populate('createdBy', 'name email role');
  }

  // ==================== EXCEL IMPORT ====================

  async importFromExcel(userId, userRole, filePath, options = {}) {
    const { name, description, type = 'custom', category = 'Imported' } = options;

    try {
      const workbook  = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const data      = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

      if (!data?.length) throw new ValidationError(['Excel file is empty or has no data rows']);

      const sections = this.parseExcelToSections(data);

      const checklist = await Checklist.create({
        name:              name || `Imported: ${Date.now()}`,
        description:       description || 'Imported from Excel',
        category,
        type,
        createdBy:         userId,
        createdByRole:     userRole,
        sections,
        importedFromExcel: true,
        excelFileName:     filePath.split('/').pop(),
        status:            'active',
        isApproved:        true,
      });

      return checklist;
    } finally {
      // Always clean up temp file
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch {
        // non-fatal
      }
    }
  }

  parseExcelToSections(data) {
    const sectionsMap = new Map();

    data.forEach((row) => {
      const fieldFull = this._clean(row['Section - Field Name']);
      if (!fieldFull) return;

      let sectionName = 'General';
      let fieldName   = fieldFull;

      if (fieldFull.includes(' - ')) {
        const [sec, ...rest] = fieldFull.split(' - ');
        sectionName = sec.trim();
        fieldName   = rest.join(' - ').trim();
      }

      if (!sectionsMap.has(sectionName)) sectionsMap.set(sectionName, []);

      const options = row['Options']
        ? String(row['Options']).split(',').map(o => o.trim()).filter(Boolean)
        : [];

      const checkboxItems = row['Checkbox Items']
        ? String(row['Checkbox Items']).split(',').map(i => i.trim()).filter(Boolean)
        : [];

      let fieldType = this._clean(row['Field Type']) || 'text_input';
      if (!VALID_IMPORT_TYPES.includes(fieldType)) fieldType = 'text_input';

      const fields = sectionsMap.get(sectionName);
      fields.push({
        label:       fieldName,
        fieldType,
        isRequired:  String(row['Required']).toLowerCase() === 'yes',
        options,
        checkboxItems,
        placeholder: this._clean(row['Placeholder']) || '',
        helpText:    this._clean(row['Help Text'])    || '',
        ratingMax:   row['Rating Max'] ? parseInt(row['Rating Max'], 10) : 5,
        order:       fields.length,
        validationRules: {
          minLength: row['Min Length'] ? parseInt(row['Min Length'], 10)   : null,
          maxLength: row['Max Length'] ? parseInt(row['Max Length'], 10)   : null,
          minValue:  row['Min Value']  ? parseFloat(row['Min Value'])      : null,
          maxValue:  row['Max Value']  ? parseFloat(row['Max Value'])      : null,
        },
      });
    });

    return [...sectionsMap.entries()].map(([sectionTitle, fields], order) => ({
      sectionTitle,
      fields,
      order,
    }));
  }

  _clean(value) {
    if (value == null) return '';
    return String(value).trim();
  }

  // ==================== SUBMISSIONS ====================

  /**
   * Validate a submitted field value against its schema definition.
   * Returns array of error strings.
   */
  validateFieldValue(field, value) {
    const errors = [];
    const isEmpty = value === null || value === undefined ||
      value === '' || (Array.isArray(value) && !value.length);

    if (field.isRequired && isEmpty) {
      errors.push(`${field.label} is required`);
      return errors;
    }

    if (isEmpty) return errors;

    switch (field.fieldType) {
      case 'text_input':
      case 'text_area': {
        const { minLength, maxLength, pattern } = field.validationRules ?? {};
        if (minLength && value.length < minLength) {
          errors.push(`${field.label} must be at least ${minLength} characters`);
        }
        if (maxLength && value.length > maxLength) {
          errors.push(`${field.label} must not exceed ${maxLength} characters`);
        }
        if (pattern && !new RegExp(pattern).test(value)) {
          errors.push(
            field.validationRules?.errorMessage || `${field.label} format is invalid`
          );
        }
        break;
      }

      case 'number_input':
      case 'slider': {
        const num = Number(value);
        if (isNaN(num)) {
          errors.push(`${field.label} must be a number`);
        } else {
          if (field.minValue !== null && num < field.minValue)
            errors.push(`${field.label} must be at least ${field.minValue}`);
          if (field.maxValue !== null && num > field.maxValue)
            errors.push(`${field.label} must not exceed ${field.maxValue}`);
        }
        break;
      }

      case 'email_input':
        if (!EMAIL_REGEX.test(value)) {
          errors.push(`${field.label} must be a valid email address`);
        }
        break;

      case 'phone_input':
        if (!PHONE_REGEX.test(value)) {
          errors.push(`${field.label} must be a valid phone number`);
        }
        break;

      case 'rating':
        if (value < 1 || value > (field.ratingMax || 5)) {
          errors.push(`${field.label} must be between 1 and ${field.ratingMax || 5}`);
        }
        break;
    }

    return errors;
  }

  /**
   * Submit a filled checklist response.
   */
  async submitResponse(checklistId, userId, userRole, data) {
    const { responses = [], completionTime, ipAddress, userAgent, offlineId } = data;

    const checklist = await Checklist.findById(checklistId);
    if (!checklist) throw new NotFoundError('Checklist not found');
    if (checklist.status !== 'active') {
      throw new BadRequestError('This checklist is not accepting submissions');
    }

    // Build a flat field map for validation
    const fieldMap = new Map();
    for (const section of checklist.sections) {
      for (const field of section.fields) {
        fieldMap.set(field._id.toString(), field);
      }
    }

    // Validate every response
    const validationErrors = [];
    for (const response of responses) {
      const field = fieldMap.get(response.fieldId?.toString());
      if (!field) continue; // skip unknown fields silently
      const errs = this.validateFieldValue(field, response.value);
      validationErrors.push(...errs);
    }
    if (validationErrors.length) throw new ValidationError(validationErrors);

    // Check all required fields are present
    for (const [fieldId, field] of fieldMap) {
      if (!field.isRequired) continue;
      const provided = responses.find(r => r.fieldId?.toString() === fieldId);
      if (!provided || provided.value === null || provided.value === undefined || provided.value === '') {
        validationErrors.push(`${field.label} is required`);
      }
    }
    if (validationErrors.length) throw new ValidationError(validationErrors);

    const submission = await ChecklistSubmission.create({
      checklistId,
      checklistName:    checklist.name,
      checklistVersion: checklist.version,
      responses,
      submittedBy:      userId,
      submittedByRole:  userRole,
      status:           'completed',
      completionTime:   completionTime ?? null,
      ipAddress:        ipAddress      ?? null,
      userAgent:        userAgent      ?? null,
      offlineId:        offlineId      ?? null,
    });

    return submission.populate('submittedBy', 'name email');
  }

  /**
   * Get all submissions for a checklist (super_admin sees all; admin sees own).
   */
  async getSubmissions(checklistId, userId, userRole, filters = {}) {
    const {
      page      = 1,
      limit     = 20,
      status,
      sortOrder = 'desc',
    } = filters;

    const checklist = await Checklist.findById(checklistId).lean();
    if (!checklist) throw new NotFoundError('Checklist not found');

    if (userRole === 'admin' && checklist.createdBy.toString() !== userId.toString()) {
      throw new AuthorizationError('You can only view submissions for your own checklists');
    }

    const query = { checklistId };
    if (status) query.status = status;

    const skip = (page - 1) * limit;

    const [submissions, total] = await Promise.all([
      ChecklistSubmission.find(query)
        .populate('submittedBy', 'name email')
        .populate('reviewedBy',  'name email')
        .sort({ submittedAt: sortOrder === 'desc' ? -1 : 1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      ChecklistSubmission.countDocuments(query),
    ]);

    return { submissions, pagination: this.buildPagination(Number(page), Number(limit), total) };
  }

  /**
   * Get a single submission by ID.
   */
  async getSubmissionById(submissionId, userId, userRole) {
    const submission = await ChecklistSubmission.findById(submissionId)
      .populate('submittedBy', 'name email role')
      .populate('reviewedBy',  'name email')
      .populate('checklistId', 'name category');

    if (!submission) throw new NotFoundError('Submission not found');

    // Admins can only read their own submissions
    if (
      userRole === 'admin' &&
      submission.submittedBy._id.toString() !== userId.toString()
    ) {
      throw new AuthorizationError('You do not have access to this submission');
    }

    return submission;
  }

  // ==================== REQUEST MANAGEMENT ====================

  async submitRequest(userId, userRole, requestData) {
    const request = await ChecklistRequest.create({
      ...requestData,
      requestedBy:     userId,
      requestedByRole: userRole,
      status:          'pending',
      requestDate:     new Date(),
    });

    return request.populate('requestedBy', 'name email role');
  }

  async getRequests(userId, userRole, filters = {}) {
    const {
      page      = 1,
      limit     = 20,
      sortBy    = 'createdAt',
      sortOrder = 'desc',
    } = filters;

    const query       = this.buildRequestQuery(userId, userRole, filters);
    const skip        = (page - 1) * limit;
    const sortOptions = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const [requests, total] = await Promise.all([
      ChecklistRequest.find(query)
        .populate('requestedBy', 'name email role')
        .sort(sortOptions)
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      ChecklistRequest.countDocuments(query),
    ]);

    return { requests, pagination: this.buildPagination(Number(page), Number(limit), total) };
  }

  async getRequestById(requestId) {
    const request = await ChecklistRequest.findById(requestId)
      .populate('requestedBy',      'name email role')
      .populate('reviewedBy',       'name email')
      .populate('createdChecklistId', 'name type status');

    if (!request) throw new NotFoundError('Request not found');
    return request;
  }

  async getRequestStats(userId, userRole) {
    const query = this.buildRequestQuery(userId, userRole, {});

    const [stats, recentRequests] = await Promise.all([
      ChecklistRequest.aggregate([
        { $match: query },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      ChecklistRequest.find(query)
        .populate('requestedBy', 'name email')
        .sort('-createdAt')
        .limit(5)
        .lean(),
    ]);

    const counts = {
      pending:     0,
      approved:    0,
      rejected:    0,
      under_review: 0,
      in_progress: 0,
      total:       0,
    };

    for (const { _id, count } of stats) {
      if (_id in counts) counts[_id] = count;
      counts.total += count;
    }

    return { counts, recentRequests };
  }

  async reviewRequest(requestId, userId, userRole, reviewData) {
    if (userRole !== 'super_admin') {
      throw new AuthorizationError('Only Super Admin can review checklist requests');
    }

    const { action, rejectionReason, comments } = reviewData;
    const VALID_ACTIONS = ['approved', 'rejected', 'under_review', 'in_progress'];
    if (!VALID_ACTIONS.includes(action)) {
      throw new BadRequestError(`Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}`);
    }

    const request = await ChecklistRequest.findById(requestId);
    if (!request) throw new NotFoundError('Request not found');

    request.status         = action;
    request.reviewedBy     = userId;
    request.reviewedAt     = new Date();
    request.reviewComments = comments || '';

    if (action === 'rejected') {
      if (!rejectionReason) throw new BadRequestError('Rejection reason is required');
      request.rejectionReason = rejectionReason;
    }

    if (action === 'approved' && request.createdChecklistId) {
      await Checklist.findByIdAndUpdate(request.createdChecklistId, {
        isApproved: true,
        approvedBy: userId,
        approvedAt: new Date(),
      });
    }

    await request.save();

    return ChecklistRequest.findById(request._id)
      .populate('requestedBy',      'name email')
      .populate('reviewedBy',       'name email')
      .populate('createdChecklistId', 'name');
  }
}

export default new ChecklistService();