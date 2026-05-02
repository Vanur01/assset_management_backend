import mongoose from 'mongoose';

const checklistRequestSchema = new mongoose.Schema({
  checklistName: {
    type: String,
    required: true,
    trim: true,
  },
  category: {
    type: String,
    required: true,
    trim: true,
  },
  detailedDescription: {
    type: String,
    required: true,
    trim: true,
  },
  businessJustification: {
    type: String,
    required: true,
    trim: true,
  },
  urgencyLevel: {
    type: String,
    enum: ["low", "medium", "high", "critical"],
    default: "medium",
  },
  expectedUsageFrequency: {
    type: String,
    enum: ["daily", "weekly", "monthly", "quarterly", "yearly", "as_needed"],
    default: "monthly",
  },
  numberOfTeamMembers: {
    type: Number,
    min: 1,
    default: 1,
  },
  additionalNotes: {
    type: String,
    trim: true,
  },

  // Requestor info
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  requestedByName: {
    type: String,
    trim: true,
  },
  requestedByRole: {
    type: String,
    enum: ["admin", "super_admin"],
  },

  // Status
  status: {
    type: String,
    enum: ["pending", "approved", "rejected", "under_review", "in_progress"],
    default: "pending",
    index: true,
  },

  // Review info
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  reviewedByName: {
    type: String,
    trim: true,
  },
  reviewedAt: {
    type: Date,
    default: null,
  },
  rejectionReason: {
    type: String,
    trim: true,
  },
  reviewComments: {
    type: String,
    trim: true,
  },

  // Result
  createdChecklistId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Checklist",
    default: null,
  },
  createdChecklistName: {
    type: String,
    trim: true,
  },

  requestDate: {
    type: Date,
    default: Date.now,
  },
  timeToReview: {
    type: Number, // in hours
    default: null,
  },

}, { timestamps: true });

// Pre-save middleware
checklistRequestSchema.pre('save', async function(next) {
  if (this.isModified('requestedBy') && this.requestedBy) {
    const User = mongoose.model('User');
    const user = await User.findById(this.requestedBy).lean();
    if (user) {
      this.requestedByName = user.name || user.email;
      this.requestedByRole = user.role;
    }
  }

  if (this.isModified('reviewedBy') && this.reviewedBy) {
    const User = mongoose.model('User');
    const user = await User.findById(this.reviewedBy).lean();
    if (user) {
      this.reviewedByName = user.name || user.email;
    }
  }

  if (this.isModified('status') && this.status !== 'pending' && !this.reviewedAt) {
    this.reviewedAt = new Date();
    if (this.requestDate) {
      this.timeToReview = Math.round((this.reviewedAt - this.requestDate) / (1000 * 60 * 60));
    }
  }

  next();
});

// Indexes
checklistRequestSchema.index({ requestedBy: 1, status: 1 });
checklistRequestSchema.index({ status: 1, createdAt: -1 });
checklistRequestSchema.index({ urgencyLevel: 1, status: 1 });
checklistRequestSchema.index({ createdAt: -1 });

const ChecklistRequest = mongoose.models.ChecklistRequest || mongoose.model("ChecklistRequest", checklistRequestSchema);
export default ChecklistRequest;