import mongoose from 'mongoose';

const fieldSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        'text_input',
        'text_area',
        'dropdown',
        'checkbox',
        'rating',
        'image_upload',
        'signature',
        'date',
        'file_upload',
      ],
      required: true,
    },
    label: {
      type: String,
      required: true,
    },
    placeholder: String,
    required: {
      type: Boolean,
      default: false,
    },
    options: [String],
    validation: {
      min: Number,
      max: Number,
      pattern: String,
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  { _id: true }
);

const checklistSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Checklist name is required'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },

    // ── Type & scope ──────────────────────────────────────────────────────────
    checklistType: {
      type: String,
      enum: ['custom', 'global', 'import'],
      default: 'custom',
    },
    isGlobal: {
      type: Boolean,
      default: false,
    },

    // ── Fields & settings ────────────────────────────────────────────────────
    fields: [fieldSchema],
    settings: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // ── Metadata ─────────────────────────────────────────────────────────────
    category: {
      type: String,
      default: 'general',
      trim: true,
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'published',
    },
    version: {
      type: Number,
      default: 1,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    createdByRole: {
      type: String,
      enum: ['super_admin', 'admin'],
      required: true,
    },
    clonedFrom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Checklist',
    },
    clonedAt: Date,
    isTemplate: {
      type: Boolean,
      default: false,
    },

    // ── Import tracking ───────────────────────────────────────────────────────
    importSource: {
      fileName: String,
      importedAt: Date,
      importedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      rowNumber: Number,
    },

    // ── Soft delete ───────────────────────────────────────────────────────────
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
checklistSchema.index({ isDeleted: 1, createdAt: -1 });
checklistSchema.index({ name: 1 });
checklistSchema.index({ category: 1 });
checklistSchema.index({ tags: 1 });
checklistSchema.index({ status: 1 });
checklistSchema.index({ createdBy: 1 });
checklistSchema.index({ createdByRole: 1 });
checklistSchema.index({ isTemplate: 1 });
checklistSchema.index({ clonedFrom: 1 });
checklistSchema.index({ checklistType: 1 });
checklistSchema.index({ isGlobal: 1 });
checklistSchema.index({ 'importSource.importedAt': -1 });

// ── Virtual ───────────────────────────────────────────────────────────────────
checklistSchema.virtual('typeDisplay').get(function () {
  if (this.isGlobal) return '🌍 Global Checklist';
  if (this.checklistType === 'import') return '📥 Imported Checklist';
  return '📝 Custom Checklist';
});

const Checklist = mongoose.model('Checklist', checklistSchema);
export default Checklist;