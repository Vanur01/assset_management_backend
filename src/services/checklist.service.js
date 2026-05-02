import Checklist from '../models/checklist.model.js';
import ChecklistRequest from '../models/Checklistrequest.model.js';
import {
  ValidationError,
  NotFoundError,
  AuthorizationError,
  BadRequestError
} from '../errors/customError.js';
import XLSX from 'xlsx';
import fs from 'fs';

class ChecklistService {
  
  // ==================== HELPER METHODS ====================
  
  validateField(field) {
    const errors = [];
    if (!field.label || field.label.trim().length < 1) {
      errors.push('Field label is required');
    }
    if (field.fieldType === 'dropdown' && (!field.options || field.options.length === 0)) {
      errors.push('Dropdown fields must have at least one option');
    }
    if (field.fieldType === 'checkbox' && (!field.checkboxItems || field.checkboxItems.length === 0)) {
      errors.push('Checkbox fields must have at least one item');
    }
    if (field.fieldType === 'rating' && (field.ratingMax < 1 || field.ratingMax > 10)) {
      errors.push('Rating max must be between 1 and 10');
    }
    return errors;
  }

  validateSections(sections) {
    const errors = [];
    if (!sections || sections.length === 0) {
      errors.push('At least one section is required');
    }
    sections.forEach((section, idx) => {
      if (!section.sectionTitle || section.sectionTitle.trim() === '') {
        errors.push(`Section ${idx + 1} must have a title`);
      }
      if (section.fields && section.fields.length === 0) {
        errors.push(`Section "${section.sectionTitle}" must have at least one field`);
      }
      section.fields?.forEach((field, fieldIdx) => {
        const fieldErrors = this.validateField(field);
        if (fieldErrors.length > 0) {
          errors.push(`Section "${section.sectionTitle}", Field ${fieldIdx + 1}: ${fieldErrors.join(', ')}`);
        }
      });
    });
    if (errors.length > 0) {
      throw new ValidationError(errors);
    }
  }

  buildChecklistQuery(userId, userRole, filters = {}) {
    const query = { status: { $ne: 'deleted' } };
    
    if (userRole === 'admin') {
      // Admin sees only their own created checklists
      query.createdBy = userId;
    }
    // Super Admin sees all checklists (no filter)
    
    if (filters.type) query.type = filters.type;
    if (filters.status) query.status = filters.status;
    if (filters.category) query.category = filters.category;
    if (filters.search) {
      query.$text = { $search: filters.search };
    }
    
    return query;
  }

  buildRequestQuery(userId, userRole, filters = {}) {
    const query = {};
    
    if (userRole === 'admin') {
      // Admin sees only their own requests
      query.requestedBy = userId;
    }
    // Super Admin sees all requests
    
    if (filters.status) query.status = filters.status;
    if (filters.urgencyLevel) query.urgencyLevel = filters.urgencyLevel;
    if (filters.search) {
      query.$or = [
        { checklistName: { $regex: filters.search, $options: 'i' } },
        { requestedByName: { $regex: filters.search, $options: 'i' } }
      ];
    }
    
    return query;
  }

  // ==================== CREATE CHECKLIST ====================
  
  async createChecklist(userId, userRole, data) {
    const { name, description, category, tags, sections, type, status = 'active' } = data;
    
    this.validateSections(sections);
    
    const checklist = await Checklist.create({
      name,
      description: description || '',
      category: category || 'General',
      tags: tags || [],
      sections,
      type,
      createdBy: userId,
      createdByRole: userRole,
      status,
      isApproved: type === 'global' ? true : false,
      approvedBy: type === 'global' ? userId : null,
      approvedAt: type === 'global' ? new Date() : null,
    });
    
    return await checklist.populate('createdBy', 'name email role');
  }

  // ==================== GET CHECKLISTS (Role-based) ====================
  
  async getChecklists(userId, userRole, filters = {}) {
    const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = filters;
    const query = this.buildChecklistQuery(userId, userRole, filters);
    
    const skip = (page - 1) * limit;
    const sortOptions = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
    
    const [checklists, total] = await Promise.all([
      Checklist.find(query)
        .populate('createdBy', 'name email role')
        .populate('clonedFrom', 'name')
        .sort(sortOptions)
        .skip(skip)
        .limit(limit)
        .lean(),
      Checklist.countDocuments(query)
    ]);
    
    return {
      checklists,
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

  async getChecklistById(checklistId) {
    const checklist = await Checklist.findById(checklistId)
      .populate('createdBy', 'name email role')
      .populate('clonedFrom', 'name');
    
    if (!checklist) {
      throw new NotFoundError('Checklist not found');
    }
    
    const requestCount = await ChecklistRequest.countDocuments({ 
      createdChecklistId: checklistId 
    });
    
    return {
      ...checklist.toObject(),
      requestCount
    };
  }

  async updateChecklist(checklistId, userId, userRole, updateData) {
    const checklist = await Checklist.findById(checklistId);
    if (!checklist) {
      throw new NotFoundError('Checklist not found');
    }
    
    // Check permission
    if (userRole === 'admin' && checklist.createdBy.toString() !== userId) {
      throw new AuthorizationError('You can only update your own checklists');
    }
    
    if (updateData.sections) {
      this.validateSections(updateData.sections);
    }
    
    const updated = await Checklist.findByIdAndUpdate(
      checklistId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).populate('createdBy', 'name email role');
    
    return updated;
  }

  async deleteChecklist(checklistId, userId, userRole) {
    const checklist = await Checklist.findById(checklistId);
    if (!checklist) {
      throw new NotFoundError('Checklist not found');
    }
    
    // Check permission
    if (userRole === 'admin' && checklist.createdBy.toString() !== userId) {
      throw new AuthorizationError('You can only delete your own checklists');
    }
    
    await Checklist.findByIdAndDelete(checklistId);
    return { deleted: true, id: checklistId };
  }

  // ==================== CLONE CHECKLIST ====================
  
  async getCloneList(userId, userRole, filters = {}) {
    const { page = 1, limit = 20, search } = filters;
    const query = { status: 'active' };
    
    if (userRole === 'admin') {
      // Admin can clone their own checklists AND global checklists
      query.$or = [
        { createdBy: userId, type: { $in: ['custom', 'clone'] } },
        { type: 'global' }
      ];
    }
    // Super Admin can clone all checklists
    
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }
    
    const skip = (page - 1) * limit;
    
    const [checklists, total] = await Promise.all([
      Checklist.find(query)
        .populate('createdBy', 'name email role')
        .sort('-createdAt')
        .skip(skip)
        .limit(limit)
        .lean(),
      Checklist.countDocuments(query)
    ]);
    
    return {
      checklists,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async cloneChecklist(userId, userRole, checklistId, newName) {
    const original = await Checklist.findById(checklistId);
    if (!original) {
      throw new NotFoundError('Checklist not found');
    }
    
    // Check clone permission
    if (userRole === 'admin') {
      const canClone = original.createdBy.toString() === userId || original.type === 'global';
      if (!canClone) {
        throw new AuthorizationError('You can only clone your own checklists or global checklists');
      }
    }
    
    const cloned = await Checklist.create({
      name: newName || `${original.name} (Clone)`,
      description: original.description,
      category: original.category,
      tags: original.tags,
      sections: JSON.parse(JSON.stringify(original.sections)),
      type: 'clone',
      clonedFrom: original._id,
      createdBy: userId,
      createdByRole: userRole,
      status: 'draft',
      isApproved: false,
    });
    
    return await cloned;
  }

  // ==================== IMPORT FROM EXCEL ====================
  
  async importFromExcel(userId, userRole, filePath, options = {}) {
    const { name, description, type = 'custom', category = 'Imported' } = options;
    
    try {
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet);
      
      if (!data || data.length === 0) {
        throw new ValidationError(['Excel file is empty']);
      }
      
      const sections = this.parseExcelToSections(data);
      
      const checklist = await Checklist.create({
        name: name || `Imported: ${Date.now()}`,
        description: description || 'Imported from Excel',
        category,
        type,
        createdBy: userId,
        createdByRole: userRole,
        sections,
        importedFromExcel: true,
        excelFileName: filePath.split('/').pop(),
        status: 'draft',
        isApproved: false,
      });
      
      return checklist;
      
    } finally {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  }

  parseExcelToSections(data) {
    const sectionsMap = new Map();
    
    data.forEach((row) => {
      const fieldFull = this.clean(row['Section - Field Name']);
      if (!fieldFull) return;
      
      let sectionName = 'General';
      let fieldName = fieldFull;
      
      if (fieldFull.includes(' - ')) {
        const parts = fieldFull.split(' - ');
        sectionName = parts[0].trim();
        fieldName = parts[1].trim();
      }
      
      if (!sectionsMap.has(sectionName)) {
        sectionsMap.set(sectionName, []);
      }
      
      let options = [];
      if (row['Options']) {
        options = row['Options'].toString().split(',').map(opt => opt.trim());
      }
      
      const validTypes = ['text_input', 'dropdown', 'rating', 'checkbox', 'signature', 'date_picker', 'text_area'];
      let fieldType = this.clean(row['Field Type']) || 'text_input';
      if (!validTypes.includes(fieldType)) {
        fieldType = 'text_input';
      }
      
      sectionsMap.get(sectionName).push({
        label: fieldName,
        fieldType,
        isRequired: String(row['Required']).toLowerCase() === 'yes',
        options,
        placeholder: this.clean(row['Placeholder']) || '',
        order: sectionsMap.get(sectionName).length,
      });
    });
    
    const sections = [];
    let sectionOrder = 0;
    
    for (const [title, fields] of sectionsMap) {
      sections.push({
        sectionTitle: title,
        fields,
        order: sectionOrder++,
      });
    }
    
    return sections;
  }

  clean(value) {
    if (!value) return '';
    return String(value).trim();
  }

  // ==================== REQUEST MANAGEMENT ====================
  
  async submitRequest(userId, userRole, requestData) {
    const request = await ChecklistRequest.create({
      ...requestData,
      requestedBy: userId,
      requestedByRole: userRole,
      status: 'pending',
      requestDate: new Date(),
    });
    
    return await request.populate('requestedBy', 'name email role');
  }

  async getRequests(userId, userRole, filters = {}) {
    console.log("userId", userId , userRole)
    const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = filters;
    const query = this.buildRequestQuery(userId, userRole, filters);
    
    const skip = (page - 1) * limit;
    const sortOptions = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
    
    const [requests, total] = await Promise.all([
      ChecklistRequest.find(query)
        .sort(sortOptions)
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
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1
      }
    };
  }

  async getRequestById(requestId) {
    const request = await ChecklistRequest.findById(requestId)
      .populate('requestedBy', 'name email role')
      .populate('reviewedBy', 'name email')
      .populate('createdChecklistId', 'name type status');
    
    if (!request) {
      throw new NotFoundError('Request not found');
    }
    
    return request;
  }

  async getRequestStats(userId, userRole) {
    const query = this.buildRequestQuery(userId, userRole, {});
    
    const stats = await ChecklistRequest.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);
    
    const counts = {
      pending: 0,
      approved: 0,
      rejected: 0,
      under_review: 0,
      in_progress: 0,
      total: 0
    };
    
    stats.forEach(stat => {
      counts[stat._id] = stat.count;
      counts.total += stat.count;
    });
    
    // Get recent requests
    const recentRequests = await ChecklistRequest.find(query)
      .populate('requestedBy', 'name email')
      .sort('-createdAt')
      .limit(5)
      .lean();
    
    return { counts, recentRequests };
  }

  async reviewRequest(requestId, userId, userRole, reviewData) {
    const { action, rejectionReason, reviewComments, createdChecklistId } = reviewData;
    
    // Only Super Admin can review requests
    if (userRole !== 'super_admin') {
      throw new AuthorizationError('Only Super Admin can review checklist requests');
    }
    
    const request = await ChecklistRequest.findById(requestId);
    if (!request) {
      throw new NotFoundError('Request not found');
    }
    
    if (request.status !== 'pending') {
      throw new BadRequestError(`Request is already ${request.status}`);
    }
    
    request.status = action;
    request.reviewedBy = userId;
    request.reviewedAt = new Date();
    request.reviewComments = reviewComments || '';
    
    if (action === 'rejected') {
      request.rejectionReason = rejectionReason || '';
    }
    
    if (action === 'approved' && createdChecklistId) {
      request.createdChecklistId = createdChecklistId;
      const checklist = await Checklist.findById(createdChecklistId);
      if (checklist) {
        request.createdChecklistName = checklist.name;
      }
    }
    
    await request.save();
    
    return await request.populate('requestedBy', 'name email')
      .populate('reviewedBy', 'name email')
      .populate('createdChecklistId', 'name');
  }
}

export default new ChecklistService();