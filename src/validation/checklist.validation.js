import { body, param, query } from "express-validator";

// ==================== PAGINATION ====================
export const validatePagination = [
  query("page").optional().isInt({ min: 1 }).toInt(),
  query("limit").optional().isInt({ min: 1, max: 100 }).toInt(),
  query("status").optional().isString(),
  query("search").optional().isString().trim(),
  query("category").optional().isString(),
  query("type").optional().isIn(["global", "custom", "clone"]),
];

// ==================== CHECKLIST VALIDATIONS ====================
export const validateCreateChecklist = [
  body("name").notEmpty().withMessage("Name is required").isLength({ max: 200 }),
  body("description").optional().isLength({ max: 2000 }),
  body("category").optional().isString(),
  body("type").isIn(["global", "custom"]).withMessage("Type must be global or custom"),
  body("sections").isArray({ min: 1 }).withMessage("At least one section required"),
  body("sections.*.sectionTitle").notEmpty().withMessage("Section title required"),
  body("sections.*.fields").optional().isArray(),
  body("sections.*.fields.*.label").notEmpty().withMessage("Field label required"),
  body("sections.*.fields.*.fieldType").isIn([
    "text_input", "text_area", "dropdown", "checkbox",
    "rating", "image_upload", "signature", "date_picker"
  ]),
];

export const validateUpdateChecklist = [
  param("id").isMongoId(),
  body("name").optional().isLength({ max: 200 }),
  body("description").optional().isLength({ max: 2000 }),
  body("status").optional().isIn(["active", "inactive", "draft"]),
  body("category").optional().isString(),
  body("sections").optional().isArray(),
];

export const validateChecklistId = [
  param("id").isMongoId().withMessage("Invalid checklist ID"),
];

// ==================== REQUEST VALIDATIONS ====================
export const validateSubmitRequest = [
  body("checklistName").notEmpty().withMessage("Checklist name required").isLength({ max: 200 }),
  body("category").notEmpty().withMessage("Category required"),
  body("detailedDescription").notEmpty().withMessage("Detailed description required").isLength({ max: 5000 }),
  body("businessJustification").notEmpty().withMessage("Business justification required").isLength({ max: 2000 }),
  body("urgencyLevel").isIn(["low", "medium", "high", "critical"]),
  body("expectedUsageFrequency").optional().isIn(["daily", "weekly", "monthly", "quarterly", "yearly", "as_needed"]),
  body("numberOfTeamMembers").optional().isInt({ min: 1 }),
  body("additionalNotes").optional().isLength({ max: 2000 }),
];

export const validateReviewRequest = [
  param("id").isMongoId(),
  body("action").isIn(["approved", "rejected", "under_review", "in_progress"]),
  body("rejectionReason").custom((value, { req }) => {
    if (req.body.action === "rejected" && !value) {
      throw new Error("Rejection reason required for rejection");
    }
    return true;
  }),
  body("reviewComments").optional().isLength({ max: 2000 }),
  body("createdChecklistId").optional().isMongoId(),
];

export const validateRequestId = [
  param("id").isMongoId().withMessage("Invalid request ID"),
];

// ==================== CLONE VALIDATIONS ====================
export const validateCloneChecklist = [
  param("id").isMongoId(),
  body("newName").optional().isLength({ max: 200 }),
  body("newDescription").optional().isLength({ max: 2000 }),
];

// ==================== IMPORT VALIDATIONS ====================
export const validateImportChecklist = [
  body("name").notEmpty().withMessage("Checklist name required"),
  body("category").optional().isString(),
  body("type").isIn(["global", "custom"]).withMessage("Type must be global or custom"),
];