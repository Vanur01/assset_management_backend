import mongoose from 'mongoose';

// ─── Field Sub-Schema ────────────────────────────────────────────────────────

const FIELD_TYPES = [
  'text_input', 'text_area', 'dropdown', 'checkbox',
  'rating', 'image_upload', 'signature', 'date_picker',
  'heading', 'divider', 'file_upload', 'number_input',
  'email_input', 'phone_input', 'url_input', 'time_picker',
  'datetime_picker', 'switch', 'slider', 'multi_select',
];

const fieldSchema = new mongoose.Schema(
  {
    label:        { type: String, required: true, trim: true },
    fieldType:    { type: String, required: true, enum: FIELD_TYPES },
    isRequired:   { type: Boolean, default: false },
    placeholder:  { type: String, default: '' },
    defaultValue: { type: mongoose.Schema.Types.Mixed, default: null },

    // Option-based fields
    options:       [{ type: String }],   // dropdown, multi_select
    checkboxItems: [{ type: String }],   // checkbox groups

    // Rating
    ratingMax:  { type: Number, default: 5, min: 1, max: 10 },
    ratingIcon: { type: String, default: 'star', enum: ['star', 'heart', 'thumbs'] },

    // Number / Slider
    minValue:  { type: Number, default: null },
    maxValue:  { type: Number, default: null },
    stepValue: { type: Number, default: 1 },
    sliderMin: { type: Number, default: 0 },
    sliderMax: { type: Number, default: 100 },

    // Layout
    order:       { type: Number, default: 0 },
    columnWidth: { type: Number, default: 12, min: 1, max: 12 },
    helpText:    { type: String, default: '' },

    // Validation
    validationRules: {
      minLength:    { type: Number, default: null },
      maxLength:    { type: Number, default: null },
      pattern:      { type: String, default: null },
      minValue:     { type: Number, default: null },
      maxValue:     { type: Number, default: null },
      customRegex:  { type: String, default: null },
      errorMessage: { type: String, default: '' },
    },

    // Conditional logic
    conditionalLogic: {
      enabled:        { type: Boolean, default: false },
      dependsOnField: { type: String,  default: null },
      condition: {
        type:    String,
        enum:    ['equals', 'not_equals', 'contains', 'greater_than', 'less_than', 'checked'],
        default: 'equals',
      },
      value: { type: mongoose.Schema.Types.Mixed, default: null },
    },

    // Styling
    styling: {
      cssClass:     { type: String, default: '' },
      inlineStyles: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
  },
  { _id: true }
);

// ─── Section Sub-Schema ──────────────────────────────────────────────────────

const sectionSchema = new mongoose.Schema(
  {
    sectionTitle:       { type: String, required: true, trim: true },
    sectionDescription: { type: String, default: '' },
    fields:             [fieldSchema],
    order:              { type: Number, default: 0 },
    collapsible:        { type: Boolean, default: false },
    collapsed:          { type: Boolean, default: false },
    sectionIcon:        { type: String, default: '' },
  },
  { _id: true }
);

// ─── Main Checklist Schema ───────────────────────────────────────────────────

const checklistSchema = new mongoose.Schema(
  {
    name: {
      type:      String,
      required:  [true, 'Checklist name is required'],
      trim:      true,
      minlength: [3,   'Checklist name must be at least 3 characters'],
      maxlength: [100, 'Checklist name cannot exceed 100 characters'],
    },
    description: {
      type:      String,
      trim:      true,
      default:   '',
      maxlength: [2000, 'Description cannot exceed 2000 characters'],
    },

    type: {
      type:     String,
      enum:     ['global', 'custom', 'clone', 'template'],
      required: true,
      default:  'custom',
    },

    category:    { type: String, trim: true, default: 'General', index: true },
    subcategory: { type: String, trim: true, default: '' },
    tags:        [{ type: String, trim: true }],

    // Form settings
    settings: {
      showProgressBar:     { type: Boolean, default: true },
      showSectionNumbers:  { type: Boolean, default: false },
      allowSaveDraft:      { type: Boolean, default: true },
      autoSave:            { type: Boolean, default: false },
      autoSaveInterval:    { type: Number,  default: 30_000 },
      confirmationMessage: { type: String,  default: 'Thank you for completing the inspection!' },
      redirectUrl:         { type: String,  default: '' },
      emailNotifications:  { type: Boolean, default: false },
      notificationEmails:  [{ type: String }],
    },

    // Ownership
    createdBy: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
      index:    true,
    },
    createdByRole: {
      type:     String,
      enum:     ['super_admin', 'admin', 'user'],
      required: true,
    },

    clonedFrom: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'Checklist',
      default: null,
    },

    sections:      [sectionSchema],
    totalFields:   { type: Number, default: 0 },
    totalSections: { type: Number, default: 0 },

    version: { type: String, default: 'v1.0' },

    status: {
      type:    String,
      enum:    ['active', 'inactive', 'draft', 'archived', 'deleted'],
      default: 'active',
      index:   true,
    },

    // Excel import
    importedFromExcel: { type: Boolean, default: false },
    excelFileName:     { type: String,  default: null },

    // Approval
    isApproved:  { type: Boolean, default: false },
    approvedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt:  { type: Date, default: null },

    // Template usage
    usageCount: { type: Number, default: 0 },
    lastUsedAt: { type: Date,   default: null },

    // Version control
    isLatestVersion:   { type: Boolean, default: true },
    previousVersionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Checklist', default: null },
  },
  {
    timestamps: true,
    toJSON:     { virtuals: true },
    toObject:   { virtuals: true },
  }
);

// ─── Virtuals ────────────────────────────────────────────────────────────────

checklistSchema.virtual('requestCount', {
  ref:        'ChecklistRequest',
  localField: '_id',
  foreignField: 'checklistId',
  count:      true,
});

checklistSchema.virtual('submissionCount', {
  ref:        'ChecklistSubmission',
  localField: '_id',
  foreignField: 'checklistId',
  count:      true,
});

// ─── Pre-save Hooks ───────────────────────────────────────────────────────────

// Auto-compute totals
checklistSchema.pre('save', function (next) {
  this.totalSections = this.sections?.length ?? 0;
  this.totalFields   = this.sections?.reduce((sum, s) => sum + (s.fields?.length ?? 0), 0) ?? 0;
  next();
});

// Validate section titles
checklistSchema.pre('save', function (next) {
  for (const section of this.sections ?? []) {
    if (!section.sectionTitle?.trim()) {
      return next(new Error('Each section must have a title'));
    }
  }
  next();
});

// ─── Indexes ─────────────────────────────────────────────────────────────────

checklistSchema.index({ name: 'text', description: 'text', category: 'text', tags: 'text' });
checklistSchema.index({ type: 1, status: 1 });
checklistSchema.index({ createdBy: 1, type: 1 });
checklistSchema.index({ createdByRole: 1 });
checklistSchema.index({ category: 1, subcategory: 1 });
checklistSchema.index({ isApproved: 1, status: 1 });
checklistSchema.index({ usageCount: -1 });

// ─── Export ───────────────────────────────────────────────────────────────────

export const CHECKLIST_FIELD_TYPES = FIELD_TYPES;

const Checklist = mongoose.models.Checklist || mongoose.model('Checklist', checklistSchema);
export default Checklist;