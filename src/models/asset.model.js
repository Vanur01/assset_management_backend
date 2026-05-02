// models/asset.model.js (Updated to handle optional fields)
import mongoose from 'mongoose';

// Helper schema for addresses
const AddressSchema = new mongoose.Schema({
  streetAddress: { type: String, trim: true },
  city: { type: String, trim: true },
  stateProvince: { type: String, trim: true },
  postalCode: { type: String, trim: true },
  country: { type: String, trim: true }
}, { _id: false });

// Helper schema for assigned users
const AssignedUserSchema = new mongoose.Schema({
  primaryUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, default: null },
  secondaryUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  custodian: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { _id: false });

// Helper schema for asset images - Make url NOT required during creation
const AssetImageSchema = new mongoose.Schema({
  name: { type: String, trim: true },
  url: { type: String },  // Remove required: true
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, refPath: 'uploadedByModel' },
  uploadedByModel: { type: String, enum: ['Client', 'Team'] },
  uploadedAt: { type: Date, default: Date.now },
  isPrimary: { type: Boolean, default: false }
}, { _id: true });

// Helper schema for inspection tracking
const InspectionTrackerSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  schedule: { type: String, enum: ['Weekly', 'Monthly', 'Quarterly', 'Half Yearly', 'Yearly'] },
  lastInspectionDate: { type: Date },
  nextDueDate: { type: Date },
  inspectionHistory: [{
    inspectionDate: { type: Date, default: Date.now },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['Completed', 'Partial', 'Failed', 'Rescheduled'] },
    remarks: { type: String, trim: true },
    attachmentUrl: { type: String }
  }]
}, { _id: false });

// Asset Schema
const AssetSchema = new mongoose.Schema({
  // Role-Based Access Control
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdByModel: { type: String, required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, refPath: 'updatedByModel' },
  updatedByModel: { type: String },

  // Clone Tracking
  clonedFrom: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', index: true },
  cloneCount: { type: Number, default: 0 },
  originalAssetId: { type: String, trim: true, index: true },
  isClone: { type: Boolean, default: false, index: true },
  cloneVersion: { type: Number, default: 1 },

  // Core Identification
  assetId: { type: String, unique: true, sparse: true, trim: true, index: true },
  tagNumber: { type: String, unique: true, sparse: true, trim: true, index: true },
  assetName: { type: String, trim: true, required: [true, 'Asset name is required'] },
  description: { type: String, trim: true },
  serialNumber: { type: String, unique: true, sparse: true, trim: true },
  assetCategory: { 
    type: String, 
    enum: ['Equipment', 'Vehicle', 'Tool', 'Machinery', 'IT', 'Furniture', 'Electrical', 'Other'], 
    default: 'Other' 
  },
  customAssetCategory: { type: String, trim: true },

  // Asset Images
  assetImages: [AssetImageSchema],

  // Parent-Child Relationship
  parentAsset: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', index: true },
  childAssets: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Asset' }],
  parentChildRelationship: { type: String, enum: ['parent', 'child', 'standalone'], default: 'standalone' },
  relationshipMetadata: {
    inheritanceSettings: {
      inheritStatus: { type: Boolean, default: false },
      inheritLocation: { type: Boolean, default: false },
      inheritAssignment: { type: Boolean, default: false }
    },
    childIndex: { type: Number },
    parentHierarchyLevel: { type: Number, default: 0 }
  },

  // Location
  currentLocation: { type: String },
  customPhysicalAddress: AddressSchema,

  // Assignment
  assignedUsers: AssignedUserSchema,

  // Status
  status: { 
    type: String, 
    enum: ['Active', 'In Maintenance', 'Retired', 'In Transit', 'Reserved'], 
    default: 'Active', 
    index: true 
  },
  statusHistory: [{
    status: { type: String, enum: ['Active', 'In Maintenance', 'Retired', 'In Transit', 'Reserved'] },
    changedAt: { type: Date, default: Date.now },
    changedBy: { type: mongoose.Schema.Types.ObjectId, refPath: 'statusHistory.changedByModel' },
    changedByModel: { type: String, enum: ['Client', 'Team'] },
    reason: { type: String }
  }],

  // Asset Condition
  assetCondition: { type: String, enum: ['Critical', 'Normal', 'Excellent', 'Poor'], default: 'Normal' },
  commissioningDate: { type: Date },
  healthScore: { type: Number, min: 0, max: 100, default: 100 },

  // Acquisition & Financial
  acquisitionDate: { type: Date },
  warrantyExpiry: { type: Date },
  leaseExpiry: { type: Date },
  warrantyLeaseExpiryWarning: { 
    lessThan90Days: { type: Boolean, default: false }, 
    expired: { type: Boolean, default: false } 
  },
  purchaseCost: { type: Number, min: 0 },
  currentValue: { type: Number, min: 0 },
  depreciationRate: { type: Number, min: 0, max: 100 },

  // Inspection Systems
  inspectionSystems: {
    amcInspection: InspectionTrackerSchema,
    camcInspection: InspectionTrackerSchema
  },

  // Category-specific fields
  mhe: {
    utilizationStatus: { type: String, enum: ['Active', 'Under Maintenance', 'Idle', 'Decommissioned', 'Not Applicable'] },
    engineRuntimeHours: { type: Number, min: 0 },
    safetyCertification: { type: String, trim: true },
    lastSafetyInspectionDate: { type: Date },
    nextSafetyInspectionDue: { type: Date }
  },
  transportation: {
    vehicleType: { type: String, enum: ['Truck', 'Car', 'Heavy Duty', 'Van', 'Motorcycle', 'Not Applicable'] },
    driver: { type: String }, // Changed from ObjectId to String to accept any value
    loadStatus: { type: Number, min: 0, max: 100, default: 50 },
    lastMaintenanceDate: { type: Date },
    nextMaintenanceDue: { type: Date }
  },
  rotatingMachinery: {
    healthStatusIndex: { type: String, enum: ['Green', 'Yellow', 'Red'] },
    vibrationAlert: { type: Boolean, default: false },
    temperatureAlert: { type: Boolean, default: false },
    faultType: [{ type: String, enum: ['Mechanical', 'Electrical', 'Thermal', 'Hydraulic', 'Software'] }],
    lastCalibrationDate: { type: Date },
    nextCalibrationDue: { type: Date }
  },
  garbageManagement: {
    containerTypeSize: { type: String, enum: ['Small (120L)', 'Medium (240L)', 'Large (660L)', 'Industrial (1100L)'] },
    smartStatusIoTFillLevel: { type: Number, min: 0, max: 100, default: 50 },
    collectionStatus: { type: String, trim: true },
    lastCollectionDate: { type: Date },
    nextCollectionDue: { type: Date }
  },
  itAssets: {
    osPlatform: [{ type: String, enum: ['Windows', 'Linux', 'Android', 'macOS', 'iOS', 'Other'] }],
    softwareName: { type: String, trim: true },
    licenseStatus: { type: String, enum: ['active', 'expired', 'pending'], trim: true },
    lastSecurityPatchDate: { type: Date },
    nextSecurityPatchDue: { type: Date }
  },
  facilityManagement: {
    pmStatus: { type: String, enum: ['Up to Date', 'Overdue', 'Due Soon', 'Not Scheduled'] },
    maintenancePriority: { type: String, enum: ['High', 'Medium', 'Low'] },
    lastPMDate: { type: Date },
    nextPMDue: { type: Date }
  },

  // System Fields
  isActive: { type: Boolean, default: true, index: true },
  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: { type: Date },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, refPath: 'deletedByModel' },
  deletedByModel: { type: String, enum: ['Client', 'Team'] },

  // Metadata
  metadata: {
    tags: [String],
    notes: String,
    attachments: [{
      name: String,
      url: String,
      uploadedBy: { type: mongoose.Schema.Types.ObjectId, refPath: 'metadata.attachments.uploadedByModel' },
      uploadedByModel: { type: String, enum: ['Client', 'Team'] },
      uploadedAt: { type: Date, default: Date.now }
    }]
  }
}, { 
  timestamps: true,
  // Allow mixed types for better flexibility
  strict: false 
});

// Indexes
AssetSchema.index({ adminId: 1, isActive: 1 });
AssetSchema.index({ adminId: 1, isClone: 1, clonedFrom: 1 });
AssetSchema.index({ clonedFrom: 1, createdAt: -1 });
AssetSchema.index({ assetId: 'text', assetName: 'text', serialNumber: 'text', tagNumber: 'text' });
AssetSchema.index({ parentAsset: 1 });
AssetSchema.index({ status: 1, isActive: 1 });
AssetSchema.index({ isDeleted: 1, deletedAt: 1 });

const Asset = mongoose.model('Asset', AssetSchema);
export default Asset;