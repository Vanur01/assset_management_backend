import mongoose from 'mongoose';

// ─── Field Response Sub-Schema ───────────────────────────────────────────────

const attachmentSchema = new mongoose.Schema(
  {
    fileName:   { type: String, required: true },
    fileUrl:    { type: String, required: true },
    fileType:   { type: String, required: true },
    fileSize:   { type: Number, required: true },
    uploadedAt: { type: Date,   default: Date.now },
  },
  { _id: false }
);

const fieldResponseSchema = new mongoose.Schema(
  {
    fieldId:    { type: mongoose.Schema.Types.ObjectId, required: true },
    fieldLabel: { type: String, required: true },
    fieldType:  { type: String, required: true },
    value:      { type: mongoose.Schema.Types.Mixed, default: null },
    attachments: [attachmentSchema],
  },
  { _id: false }  // no need for sub-doc IDs on responses
);

// ─── Submission Schema ────────────────────────────────────────────────────────

const submissionSchema = new mongoose.Schema(
  {
    checklistId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Checklist',
      required: true,
    },
    checklistName:    { type: String, required: true },
    checklistVersion: { type: String, default: 'v1.0' },

    responses: [fieldResponseSchema],

    submittedBy: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
    },
    submittedByRole: { type: String, required: true },
    submittedAt:     { type: Date, default: Date.now },

    status: {
      type:    String,
      enum:    ['draft', 'completed', 'reviewed', 'rejected'],
      default: 'draft',
      index:   true,
    },

    // Review info
    reviewedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt:     { type: Date,   default: null },
    reviewComments: { type: String, default: '' },

    // Meta
    completionTime: { type: Number, default: null }, // seconds
    ipAddress:      { type: String, default: null },
    userAgent:      { type: String, default: null },

    // Offline sync
    isSynced:  { type: Boolean, default: true },
    offlineId: { type: String,  default: null },
  },
  { timestamps: true }
);

// ─── Indexes ─────────────────────────────────────────────────────────────────

submissionSchema.index({ checklistId: 1, submittedBy: 1 });
submissionSchema.index({ submittedAt: -1 });
submissionSchema.index({ status: 1 });
submissionSchema.index({ checklistId: 1, status: 1 });

// ─── Export ───────────────────────────────────────────────────────────────────

const ChecklistSubmission =
  mongoose.models.ChecklistSubmission ||
  mongoose.model('ChecklistSubmission', submissionSchema);

export default ChecklistSubmission;