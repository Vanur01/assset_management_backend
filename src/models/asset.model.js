import mongoose from 'mongoose';

// Address Sub-Schema
const AddressSchema = new mongoose.Schema({
  streetAddress: { type: String, trim: true, default: '' },
  city: { type: String, trim: true, default: '' },
  stateProvince: { type: String, trim: true, default: '' },
  postalCode: { type: String, trim: true, default: '' },
  country: { type: String, trim: true, default: '' }
}, { _id: false });

// Assigned Users Sub-Schema
const AssignedUserSchema = new mongoose.Schema({
  primaryUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  secondaryUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  custodian: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { _id: false });

// Asset Images Sub-Schema
const AssetImageSchema = new mongoose.Schema({
  name: { type: String, trim: true, required: true },
  url: { type: String, required: true },
  fileSize: { type: Number, default: 0 },
  mimeType: { type: String, default: 'image/jpeg' },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, refPath: 'uploadedByModel' },
  uploadedByModel: { type: String, enum: ['Client', 'Team'] },
  uploadedAt: { type: Date, default: Date.now },
  isPrimary: { type: Boolean, default: false }
}, { _id: true });

// Inspection System Sub-Schema
const InspectionSystemSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  schedule: { 
    type: String, 
  },
  lastInspectionDate: { type: Date },
  nextDueDate: { type: Date },
  status: { 
    type: String, 
    enum: ['Pending', 'Completed', 'Overdue', 'Scheduled'],
    default: 'Pending'
  }
}, { _id: false });

// Status History Sub-Schema
const StatusHistorySchema = new mongoose.Schema({
  status: { type: String },
  changedAt: { type: Date, default: Date.now },
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reason: { type: String, trim: true }
}, { _id: false });

// Main Asset Schema
const AssetSchema = new mongoose.Schema({
  // ==================== ROLE BASED ACCESS ====================
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdByModel: { type: String, required: true, enum: ['Client', 'Team'] },
  
  // ==================== CLONE TRACKING ====================
  isClone: { type: Boolean, default: false, index: true },
  clonedFrom: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', index: true },
  cloneVersion: { type: Number, default: 1 },
  canBeCloned: { type: Boolean, default: true },
  
  // ==================== REQUEST TRACKING ====================
  isRequest: { type: Boolean, default: false, index: true },
  requestStatus: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected'], 
    default: 'pending',
    index: true
  },
  requestType: { type: String, enum: ['parent', 'child', null], default: null },
  parentRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset' },
  rejectionReason: { type: String, trim: true },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: { type: Date },
  
  // ==================== CORE IDENTIFICATION ====================
  assetId: { type: String, unique: true, sparse: true, trim: true, index: true },
  tagNumber: { type: String, unique: true, sparse: true, trim: true, index: true },
  assetName: { type: String, trim: true, required: [true, 'Asset name is required'] },
  description: { type: String, trim: true, default: '' },
  serialNumber: { type: String, unique: true, sparse: true, trim: true, index: true },
  
  assetCategory: {
    type: String,
    default: 'Other'
  },
  customAssetCategory: { type: String, trim: true, default: '' },
  assetImages: [AssetImageSchema],
  
  // ==================== PARENT-CHILD RELATIONSHIP ====================
  parentAsset: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', index: true },
  childAssets: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Asset' }],
  parentChildRelationship: { 
    type: String, 
    enum: ['parent', 'child', 'standalone'], 
    default: 'standalone' 
  },
  
  // ==================== LOCATION FIELDS ====================
  currentLocation: { 
    type: String, 
  },
  customPhysicalAddress: AddressSchema,
  
  // ==================== ASSIGNMENT ====================
  assignedUsers: AssignedUserSchema,
  
  // ==================== STATUS ====================
  status: {
    type: String,
    default: 'Active',
    index: true
  },
  statusHistory: [StatusHistorySchema],
  
  // ==================== ASSET CONDITION ====================
  assetCondition: { 
    type: String, 
    default: 'Normal' 
  },
  
  // ==================== ACQUISITION & FINANCIAL ====================
  acquisitionDate: { type: Date },
  invoiceDate: { type: Date },
  warrantyExpiry: { type: Date },
  leaseExpiry: { type: Date },
  warrantyLeaseExpiryWarning: {
    lessThan90Days: { type: Boolean, default: false },
    expired: { type: Boolean, default: false }
  },
  purchaseCost: { type: Number, min: 0, default: 0 },
  currentValue: { type: Number, min: 0, default: 0 },
  depreciationRate: { type: Number, min: 0, max: 100, default: 0 },
  commissioningDate: { type: Date },
  
  // ==================== MANUFACTURER DETAILS ====================
  manufacturer: { type: String, trim: true },
  model: { type: String, trim: true },
  type: { type: String, trim: true },
  powerSource: { type: String, trim: true },
  weightCapacity: { type: String, trim: true },
  dimensions: { type: String, trim: true },
  
  // ==================== INSPECTION SYSTEMS ====================
  inspectionSystems: {
    amcInspection: InspectionSystemSchema,
    camcInspection: InspectionSystemSchema
  },
  
  // ==================== MATERIAL HANDLING EQUIPMENT (MHE) ====================
  mhe: {
    utilizationStatus: { 
      type: String, 
      default: 'Not Applicable'
    },
    engineRuntimeHours: { type: Number, min: 0, default: 0 },
    safetyCertification: { type: String, trim: true },
    lastSafetyInspectionDate: { type: Date },
    nextSafetyInspectionDue: { type: Date },
    engineStatus: { type: String,  default: 'Stopped' }
  },
  
  // ==================== TRANSPORTATION FILTERS ====================
  transportation: {
    vehicleType: { 
      type: String, 
      default: 'Not Applicable'
    },
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    driverName: { type: String, trim: true },
    behaviorFlags: [{ type: String, trim: true }],
    loadStatus: { type: Number, min: 0, max: 100, default: 50 },
    lastMaintenanceDate: { type: Date },
    nextMaintenanceDue: { type: Date },
    fuelLevel: { type: Number, min: 0, max: 100, default: 50 },
    odometer: { type: Number, min: 0, default: 0 }
  },
  
  // ==================== ROTATING MACHINERY FILTERS ====================
  rotatingMachinery: {
    healthStatusIndex: { type: String, enum: ['Green', 'Yellow', 'Red'], default: 'Green' },
    vibrationAlert: { type: Boolean, default: false },
    temperatureAlert: { type: Boolean, default: false },
    vibrationLevel: { type: Number, min: 0, default: 0 },
    temperatureLevel: { type: Number, min: 0, default: 0 },
    faultType: [{ 
      type: String, 
    }],
    lastCalibrationDate: { type: Date },
    nextCalibrationDue: { type: Date },
    rpm: { type: Number, min: 0, default: 0 },
    operatingHours: { type: Number, min: 0, default: 0 }
  },
  
  // ==================== GARBAGE MANAGEMENT FILTERS ====================
  garbageManagement: {
    containerTypeSize: { 
      type: String, 
    },
    smartStatusIoTFillLevel: { type: Number, min: 0, max: 100, default: 50 },
    collectionStatus: { 
      type: String, 
      default: 'Not Scheduled'
    },
    lastCollectionDate: { type: Date },
    nextCollectionDue: { type: Date },
    wasteType: { type: String, trim: true },
    iotDeviceId: { type: String, trim: true },
    fillLevelAlert: { type: Boolean, default: false }
  },
  
  // ==================== IT ASSETS FILTERS ====================
  itAssets: {
    osPlatform: [{ 
      type: String, 
    }],
    softwareName: { type: String, trim: true },
    softwareVersion: { type: String, trim: true },
    licenseStatus: { 
      type: String, 
      default: 'Not Applicable'
    },
    licenseKey: { type: String, trim: true },
    usageHours: { type: Number, min: 0, default: 0 },
    lastSecurityPatchDate: { type: Date },
    nextSecurityPatchDue: { type: Date },
    ipAddress: { type: String, trim: true },
    macAddress: { type: String, trim: true }
  },
  
  // ==================== FACILITY MANAGEMENT FILTERS ====================
  facilityManagement: {
    pmStatus: { 
      type: String, 
      default: 'Not Scheduled'
    },
    safetyCompliance: { 
      type: String, 
      default: 'Not Applicable'
    },
    maintenancePriority: { 
      type: String, 
      default: 'Medium'
    },
    lastPMDate: { type: Date },
    nextPMDue: { type: Date },
    lastSafetyAudit: { type: Date },
    nextSafetyAuditDue: { type: Date },
    complianceCertificates: [{
      name: { type: String },
      url: { type: String },
      issueDate: { type: Date },
      expiryDate: { type: Date }
    }]
  },
  
  // ==================== SYSTEM FIELDS ====================
  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: { type: Date },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  // ==================== METADATA ====================
  metadata: {
    tags: [{ type: String, trim: true }],
    notes: { type: String, trim: true },
    attachments: [{
      name: { type: String, trim: true },
      url: { type: String },
      fileSize: { type: Number },
      mimeType: { type: String },
      uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      uploadedAt: { type: Date, default: Date.now }
    }]
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ==================== VIRTUALS ====================

// Warranty Status Virtual
AssetSchema.virtual('warrantyStatus').get(function() {
  if (!this.warrantyExpiry && !this.leaseExpiry) return 'No Warranty';
  const expiryDate = this.warrantyExpiry || this.leaseExpiry;
  const today = new Date();
  const expiry = new Date(expiryDate);
  
  if (expiry < today) return 'Expired';
  const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
  if (diffDays <= 90) return 'Expiring Soon';
  return 'Active';
});

// Days Until Next Inspection Virtual
AssetSchema.virtual('daysUntilNextInspection').get(function() {
  const nextDates = [];
  if (this.inspectionSystems?.amcInspection?.nextDueDate) {
    nextDates.push(new Date(this.inspectionSystems.amcInspection.nextDueDate));
  }
  if (this.inspectionSystems?.camcInspection?.nextDueDate) {
    nextDates.push(new Date(this.inspectionSystems.camcInspection.nextDueDate));
  }
  if (nextDates.length === 0) return null;
  
  const nearestDate = new Date(Math.min(...nextDates));
  const today = new Date();
  const diffTime = nearestDate - today;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Fill Level Percentage Virtual
AssetSchema.virtual('fillLevelPercentage').get(function() {
  return this.garbageManagement?.smartStatusIoTFillLevel || 0;
});

// Health Score Virtual
AssetSchema.virtual('healthScore').get(function() {
  let score = 100;
  
  if (this.status === 'In Maintenance') score -= 20;
  if (this.status === 'Retired') score -= 50;
  if (this.assetCondition === 'Critical') score -= 30;
  if (this.assetCondition === 'Poor') score -= 40;
  if (this.mhe?.utilizationStatus === 'Under Maintenance') score -= 15;
  if (this.rotatingMachinery?.healthStatusIndex === 'Yellow') score -= 20;
  if (this.rotatingMachinery?.healthStatusIndex === 'Red') score -= 40;
  if (this.warrantyLeaseExpiryWarning?.expired) score -= 10;
  
  return Math.max(0, Math.min(100, score));
});

// ==================== PRE-SAVE MIDDLEWARE ====================
AssetSchema.pre('save', function(next) {
  // Update warranty/lease expiry warnings
  const today = new Date();
  const warrantyExpiry = this.warrantyExpiry ? new Date(this.warrantyExpiry) : null;
  const leaseExpiry = this.leaseExpiry ? new Date(this.leaseExpiry) : null;
  
  let lessThan90Days = false;
  let expired = false;
  
  if (warrantyExpiry || leaseExpiry) {
    const expiryDate = warrantyExpiry || leaseExpiry;
    const diffDays = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
    lessThan90Days = diffDays <= 90 && diffDays > 0;
    expired = expiryDate < today;
  }
  
  this.warrantyLeaseExpiryWarning = { lessThan90Days, expired };
  
  // Add status to history if changed
  if (this.isModified('status')) {
    if (!this.statusHistory) this.statusHistory = [];
    this.statusHistory.push({
      status: this.status,
      changedAt: new Date(),
      reason: 'Status updated'
    });
  }
  
  next();
});

// ==================== INDEXES ====================
AssetSchema.index({ adminId: 1, isDeleted: 1 });
AssetSchema.index({ adminId: 1, isRequest: 1, requestStatus: 1 });
AssetSchema.index({ adminId: 1, status: 1 });
AssetSchema.index({ adminId: 1, assetCategory: 1 });
AssetSchema.index({ parentAsset: 1 });
AssetSchema.index({ clonedFrom: 1 });
AssetSchema.index({ 'assignedUsers.primaryUser': 1 });
AssetSchema.index({ 'assignedUsers.custodian': 1 });
AssetSchema.index({ currentLocation: 1 });
AssetSchema.index({ warrantyExpiry: 1 });
AssetSchema.index({ 'inspectionSystems.amcInspection.nextDueDate': 1 });
AssetSchema.index({ 'inspectionSystems.camcInspection.nextDueDate': 1 });
AssetSchema.index({ 'transportation.vehicleType': 1 });
AssetSchema.index({ 'mhe.utilizationStatus': 1 });
AssetSchema.index({ 'garbageManagement.containerTypeSize': 1 });
AssetSchema.index({ 'itAssets.licenseStatus': 1 });
AssetSchema.index({ 'facilityManagement.pmStatus': 1 });

// Text search index
AssetSchema.index({ 
  assetName: 'text', 
  assetId: 'text', 
  serialNumber: 'text', 
  tagNumber: 'text',
  description: 'text'
});

const Asset = mongoose.model('Asset', AssetSchema);
export default Asset;