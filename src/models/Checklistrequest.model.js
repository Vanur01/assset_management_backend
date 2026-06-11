import mongoose from 'mongoose';

const checklistRequestSchema = new mongoose.Schema({
  // Form Fields (from UI)
  checklistName: {
    type: String,
    required: [true, 'Checklist name is required'],
    trim: true,
    maxlength: [200, 'Checklist name cannot exceed 200 characters']
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    trim: true,
    index: true
  },
  detailedDescription: {
    type: String,
    required: [true, 'Detailed description is required'],
    trim: true,
    maxlength: [5000, 'Description cannot exceed 5000 characters']
  },
  businessJustification: {
    type: String,
    required: [true, 'Business justification is required'],
    trim: true,
    maxlength: [2000, 'Business justification cannot exceed 2000 characters']
  },
  urgencyLevel: {
    type: String,
    enum: {
      values: ["low", "medium", "high", "critical"],
      message: '{VALUE} is not a valid urgency level'
    },
    required: [true, 'Urgency level is required'],
    default: "medium",
    index: true
  },
  expectedUsageFrequency: {
    type: String,
    enum: {
      values: ["daily", "weekly", "monthly", "quarterly", "yearly", "as_needed"],
      message: '{VALUE} is not a valid usage frequency'
    },
    required: [true, 'Expected usage frequency is required'],
    default: "monthly"
  },
  numberOfTeamMembers: {
    type: Number,
    min: [1, 'Number of team members must be at least 1'],
    max: [100, 'Number of team members cannot exceed 100'],
    required: [true, 'Number of team members is required'],
    default: 1
  },

  // File Uploads (from UI)
  referenceFiles: [{
    originalName: {
      type: String,
      required: true,
      trim: true
    },
    filePath: {
      type: String,
      required: true
    },
    mimeType: {
      type: String,
      required: true
    },
    sizeBytes: {
      type: Number,
      required: true,
      min: [0, 'File size cannot be negative']
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Additional Fields
  additionalNotes: {
    type: String,
    trim: true,
    maxlength: [1000, 'Additional notes cannot exceed 1000 characters']
  },
  message: {
    type: String,
    trim: true,
    maxlength: [500, 'Message cannot exceed 500 characters']
  },

  // Requestor Information
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: [true, 'Requested by user is required'],
    index: true
  },
  requestedByName: {
    type: String,
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  requestedByRole: {
    type: String,
    enum: {
      values: ["admin", "super_admin", "user"],
      message: '{VALUE} is not a valid role'
    },
    default: "user"
  },

  // Request Status
  status: {
    type: String,
    enum: {
      values: ["pending", "approved", "rejected", "under_review", "in_progress"],
      message: '{VALUE} is not a valid status'
    },
    default: "pending",
    index: true
  },

  // Review Information
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },
  reviewedByName: {
    type: String,
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  reviewedAt: {
    type: Date,
    default: null
  },
  rejectionReason: {
    type: String,
    trim: true,
    maxlength: [1000, 'Rejection reason cannot exceed 1000 characters']
  },
  reviewComments: {
    type: String,
    trim: true,
    maxlength: [1000, 'Review comments cannot exceed 1000 characters']
  },

  // Resulting Checklist Reference
  resultingChecklist: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Checklist",
    default: null
  },
  resultingChecklistName: {
    type: String,
    trim: true,
    maxlength: [200, 'Checklist name cannot exceed 200 characters']
  },

  // Deprecated field - maintained for backward compatibility
  createdChecklistId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Checklist",
    default: null
  },
  createdChecklistName: {
    type: String,
    trim: true,
    maxlength: [200, 'Checklist name cannot exceed 200 characters']
  },

  // ==================== SOFT DELETE FIELDS (ADD THESE) ====================
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  },
  deletedAt: {
    type: Date,
    default: null
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },
  deletedByName: {
    type: String,
    trim: true,
    default: null
  },
  permanentDeleteAt: {
    type: Date,
    default: null
  },

  // Timestamps
  requestDate: {
    type: Date,
    default: Date.now,
    index: true
  },
  timeToReview: {
    type: Number, // in hours
    min: [0, 'Time to review cannot be negative'],
    default: null
  }

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Pre-save middleware to populate user details
checklistRequestSchema.pre('save', async function (next) {
  try {
    // Only run if requestedBy exists and is modified or new document
    if ((this.isModified('requestedBy') || this.isNew) && this.requestedBy) {
      const User = mongoose.model('User');
      const user = await User.findById(this.requestedBy).lean();
      if (user) {
        this.requestedByName = user.name || user.email || 'Unknown User';
        this.requestedByRole = user.role || 'user';
      }
    }

    // Handle reviewer details
    if (this.isModified('reviewedBy') && this.reviewedBy) {
      const User = mongoose.model('User');
      const user = await User.findById(this.reviewedBy).lean();
      if (user) {
        this.reviewedByName = user.name || user.email || 'Unknown Reviewer';
      }
    }

    // Handle deletedBy user details
    if (this.isModified('deletedBy') && this.deletedBy) {
      const User = mongoose.model('User');
      const user = await User.findById(this.deletedBy).lean();
      if (user) {
        this.deletedByName = user.name || user.email || 'Unknown User';
      }
    }

    // Calculate review time when status changes from pending to a final state
    if (this.isModified('status') && this.status !== 'pending' && !this.reviewedAt) {
      this.reviewedAt = new Date();
      if (this.requestDate) {
        const reviewDuration = (this.reviewedAt - this.requestDate) / (1000 * 60 * 60);
        this.timeToReview = Math.max(0, Math.round(reviewDuration));
      }
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Pre-validate middleware for business logic
checklistRequestSchema.pre('validate', function (next) {
  // Ensure rejection reason is provided when status is rejected
  if (this.status === 'rejected' && !this.rejectionReason && !this.isNew) {
    next(new Error('Rejection reason is required when rejecting a request'));
  }
  next();
});

// Query middleware to exclude soft-deleted documents by default
checklistRequestSchema.pre(/^find/, function (next) {
  // Check if the query explicitly wants to include deleted documents
  if (this.getOptions().includeDeleted) {
    return next();
  }
  // Otherwise exclude soft-deleted documents
  this.where({ isDeleted: false });
  next();
});

// Compound indexes for better query performance
checklistRequestSchema.index({ requestedBy: 1, status: 1, createdAt: -1 });
checklistRequestSchema.index({ status: 1, urgencyLevel: 1, createdAt: -1 });
checklistRequestSchema.index({ category: 1, status: 1 });
checklistRequestSchema.index({ createdAt: -1, status: 1 });
checklistRequestSchema.index({ isDeleted: 1, deletedAt: -1 });

// Virtual for formatted request date
checklistRequestSchema.virtual('formattedRequestDate').get(function () {
  return this.requestDate ? this.requestDate.toLocaleDateString() : null;
});

// Virtual for formatted creation date
checklistRequestSchema.virtual('formattedCreatedAt').get(function () {
  return this.createdAt ? this.createdAt.toLocaleDateString() : null;
});

// Virtual for days pending
checklistRequestSchema.virtual('daysPending').get(function () {
  if (this.status !== 'pending') return null;
  const days = Math.floor((Date.now() - new Date(this.requestDate)) / (1000 * 60 * 60 * 24));
  return Math.max(0, days);
});

// Virtual for review duration in days
checklistRequestSchema.virtual('reviewDurationDays').get(function () {
  if (!this.timeToReview) return null;
  return (this.timeToReview / 24).toFixed(1);
});

// Virtual for file count
checklistRequestSchema.virtual('fileCount').get(function () {
  return this.referenceFiles?.length || 0;
});

// Virtual for total file size
checklistRequestSchema.virtual('totalFileSizeBytes').get(function () {
  return this.referenceFiles?.reduce((total, file) => total + (file.sizeBytes || 0), 0) || 0;
});

// Virtual to check if request is soft deleted
checklistRequestSchema.virtual('isSoftDeleted').get(function () {
  return this.isDeleted === true;
});

// ==================== METHODS ====================
// Method to check if request is editable
checklistRequestSchema.methods.isEditable = function () {
  return !this.isDeleted && ['pending', 'under_review'].includes(this.status);
};

// Method to check if request can be cancelled
checklistRequestSchema.methods.isCancellable = function () {
  return !this.isDeleted && ['pending', 'under_review', 'in_progress'].includes(this.status);
};

// Method to soft delete the request
checklistRequestSchema.methods.softDelete = async function (userId, deletedByName) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = userId;
  this.deletedByName = deletedByName;
  // Set auto-permanent deletion date (30 days from now)
  this.permanentDeleteAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await this.save();
  return this;
};

// Method to restore soft-deleted request
checklistRequestSchema.methods.restore = async function () {
  this.isDeleted = false;
  this.deletedAt = null;
  this.deletedBy = null;
  this.deletedByName = null;
  this.permanentDeleteAt = null;
  await this.save();
  return this;
};

// ==================== STATIC METHODS ====================
// Static method for bulk status updates
checklistRequestSchema.statics.bulkUpdateStatus = async function (requestIds, status, reviewerId) {
  if (!requestIds || !requestIds.length) {
    throw new Error('Request IDs are required');
  }

  return await this.updateMany(
    { _id: { $in: requestIds }, status: 'pending' },
    {
      $set: {
        status,
        reviewedBy: reviewerId,
        reviewedAt: new Date()
      }
    }
  );
};

// Static method for bulk soft delete
checklistRequestSchema.statics.bulkSoftDelete = async function (requestIds, deletedByUserId, deletedByName) {
  if (!requestIds || !requestIds.length) {
    throw new Error('Request IDs are required');
  }

  return await this.updateMany(
    { _id: { $in: requestIds }, isDeleted: false },
    {
      $set: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: deletedByUserId,
        deletedByName: deletedByName,
        permanentDeleteAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    }
  );
};

// Static method for bulk restore
checklistRequestSchema.statics.bulkRestore = async function (requestIds) {
  if (!requestIds || !requestIds.length) {
    throw new Error('Request IDs are required');
  }

  return await this.updateMany(
    { _id: { $in: requestIds }, isDeleted: true },
    {
      $set: {
        isDeleted: false,
        deletedAt: null,
        deletedBy: null,
        deletedByName: null,
        permanentDeleteAt: null
      }
    }
  );
};

// Static method to find deleted requests
checklistRequestSchema.statics.findDeleted = function (query = {}) {
  return this.find({ ...query, isDeleted: true }).setOptions({ includeDeleted: true });
};

// Static method to permanently delete expired soft-deleted requests
checklistRequestSchema.statics.permanentDeleteExpired = async function (daysOld = 30) {
  const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
  return await this.deleteMany({
    isDeleted: true,
    permanentDeleteAt: { $lte: cutoffDate }
  });
};

const ChecklistRequest = mongoose.models.ChecklistRequest || mongoose.model("ChecklistRequest", checklistRequestSchema);
export default ChecklistRequest;