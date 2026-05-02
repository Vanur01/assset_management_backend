import { body, param, query } from "express-validator";

const VALID_STATUSES = ["pending", "in_progress", "submitted", "under_review", "approved", "rejected", "completed", "overdue"];
const VALID_PRIORITIES = ["low", "medium", "high", "critical"];

export const validateCreateAdminAssignment = [
  body("checklistId").isMongoId().withMessage("Invalid checklist ID"),
  body("adminId").isMongoId().withMessage("Invalid admin ID"),
  body("dueDate").isISO8601().withMessage("Valid due date required"),
  body("priority").optional().isIn(VALID_PRIORITIES),
  body("notes").optional().trim().isLength({ max: 1000 }),
  body("assetId").optional().isMongoId()
];

export const validateCreateTeamAssignment = [
  body("checklistId").isMongoId().withMessage("Invalid checklist ID"),
  body("primaryMemberId").isMongoId().withMessage("Valid team member ID required"),
  body("secondaryMemberId").optional().isMongoId(),
  body("dueDate").isISO8601().withMessage("Valid due date required"),
  body("priority").optional().isIn(VALID_PRIORITIES),
  body("notes").optional().trim().isLength({ max: 1000 }),
  body("assetId").optional().isMongoId()
];

export const validateGetAssignments = [
  query("page").optional().isInt({ min: 1 }).toInt(),
  query("limit").optional().isInt({ min: 1, max: 100 }).toInt(),
  query("sortBy").optional().trim(),
  query("sortOrder").optional().isIn(["asc", "desc"]),
  query("status").optional().isIn(VALID_STATUSES),
  query("priority").optional().isIn(VALID_PRIORITIES),
  query("checklistId").optional().isMongoId(),
  query("search").optional().trim(),
  query("dateFrom").optional().isISO8601(),
  query("dateTo").optional().isISO8601()
];

export const validateAssignmentId = [
  param("id").isMongoId().withMessage("Invalid assignment ID")
];

export const validateUpdateAssignment = [
  body("dueDate").optional().isISO8601(),
  body("priority").optional().isIn(VALID_PRIORITIES),
  body("adminNotes").optional().trim().isLength({ max: 2000 }),
  body("tags").optional().isArray()
];

export const validateSubmitResponse = [
  body("responses").optional().isArray(),
  body("overallRating").optional().isInt({ min: 1, max: 5 }),
  body("inspectorNotes").optional().trim().isLength({ max: 5000 }),
  body("additionalNotes").optional().trim().isLength({ max: 5000 })
];

export const validateReviewAssignment = [
  body("action").isIn(["approve", "reject"]).withMessage("Action must be approve or reject"),
  body("rejectionReason").custom((value, { req }) => {
    if (req.body.action === "reject" && (!value || value.trim() === "")) {
      throw new Error("Rejection reason is required for rejection");
    }
    return true;
  }),
  body("reviewComments").optional().trim().isLength({ max: 2000 })
];