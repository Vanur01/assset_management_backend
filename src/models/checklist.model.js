import mongoose from 'mongoose';

// Field Sub-Schema
const fieldSchema = new mongoose.Schema({
  label: { type: String, required: true, trim: true },
  fieldType: {
    type: String,
    required: true,
    enum: [
      "text_input", "text_area", "dropdown", "checkbox", 
      "rating", "image_upload", "signature", "date_picker"
    ],
  },
  isRequired: { type: Boolean, default: false },
  placeholder: { type: String, default: "" },
  options: [{ type: String }],
  ratingMax: { type: Number, default: 5, min: 1, max: 10 },
  checkboxItems: [{ type: String }],
  order: { type: Number, default: 0 },
  validationRules: {
    minLength: { type: Number, default: null },
    maxLength: { type: Number, default: null },
    pattern: { type: String, default: null }
  }
}, { _id: true });

// Section Sub-Schema
const sectionSchema = new mongoose.Schema({
  sectionTitle: { type: String, required: true, trim: true },
  sectionDescription: { type: String, default: "" },
  fields: [fieldSchema],
  order: { type: Number, default: 0 }
}, { _id: true });

// Main Checklist Schema
const checklistSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Checklist name is required"],
    trim: true,
    minlength: [3, "Checklist name must be at least 3 characters"],
    maxlength: [100, "Checklist name cannot exceed 100 characters"],
  },
  description: { 
    type: String, 
    trim: true, 
    default: "",
    maxlength: [1000, "Description cannot exceed 1000 characters"],
  },
  type: {
    type: String,
    enum: ["global", "custom", "clone"],
    required: true,
  },
  category: { 
    type: String, 
    trim: true, 
    default: "General",
    index: true,
  },
  tags: [{ type: String, trim: true }],

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  createdByRole: {
    type: String,
    enum: ["super_admin", "admin"],
    required: true,
  },

  clonedFrom: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Checklist",
    default: null,
  },

  sections: [sectionSchema],

  totalFields: { type: Number, default: 0 },

  version: { type: String, default: "v1.0" },

  status: {
    type: String,
    default: "active",
    index: true,
  },

  importedFromExcel: { type: Boolean, default: false },
  excelFileName: { type: String, default: null },
  isApproved: { type: Boolean, default: false },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  approvedAt: { type: Date, default: null },

}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Virtual for request count
checklistSchema.virtual('requestCount', {
  ref: 'ChecklistRequest',
  localField: '_id',
  foreignField: 'checklistId',
  count: true,
});

// Auto-compute totalFields before save
checklistSchema.pre("save", function (next) {
  this.totalFields = this.sections.reduce(
    (sum, sec) => sum + (sec.fields?.length || 0), 0
  );
  next();
});

// Validate sections structure
checklistSchema.pre("save", function (next) {
  if (this.sections && this.sections.length > 0) {
    for (const section of this.sections) {
      if (!section.sectionTitle || section.sectionTitle.trim() === "") {
        next(new Error("Each section must have a title"));
        return;
      }
    }
  }
  next();
});

// Indexes
checklistSchema.index({ name: 'text', category: 'text', tags: 'text' });
checklistSchema.index({ type: 1, status: 1 });
checklistSchema.index({ createdBy: 1, type: 1 });
checklistSchema.index({ createdByRole: 1 });

// ✅ FIX: Check if model exists before creating
const Checklist = mongoose.models.Checklist || mongoose.model("Checklist", checklistSchema);
export default Checklist;