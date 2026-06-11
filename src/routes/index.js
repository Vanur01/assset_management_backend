import express from "express";
import assetRouter from './asset.routes.js';
import ChecklistRouter from "./checklist.routes.js";
import dashboardRouter from "./dashboard.routes.js";
import AssignmentRouters from './Assignment.routes.js';
import requestChecklistRouter from "./ChecklistRequest.routes.js";
import super_adminReportRouter from "./report.routes.js";
import authRouter from "./auth.routes.js";
import clientRouter from "./client.routes.js";
import teamRouter from "./team.routes.js";
import contactRouter from "./contact.routes.js";
import notificationRouter from "./notification.routes.js";
import auditLogs from "./auditLog.routes.js"
import roleRouter from "./role.routes.js"
import departmentRouter from './department.routes.js'
import locationRouter from './location.routes.js'
import assetCategoryRouter from "./assetCategory.routes.js"
import assetRequestRouter from './assetRequest.routes.js'

const apiV1Router = express.Router();


apiV1Router.use('/assets', assetRouter);
apiV1Router.use('/checklists', ChecklistRouter);
apiV1Router.use('/dashboard', dashboardRouter);
apiV1Router.use('/assignments', AssignmentRouters);
apiV1Router.use('/checklist-requests', requestChecklistRouter);
apiV1Router.use('/reports', super_adminReportRouter);
apiV1Router.use("/auth", authRouter);
apiV1Router.use("/clients", clientRouter);
apiV1Router.use("/team", teamRouter);
apiV1Router.use("/contact", contactRouter);
apiV1Router.use("/notifications", notificationRouter);
apiV1Router.use("/audit-logs", auditLogs);
apiV1Router.use("/role", roleRouter);
apiV1Router.use("/department", departmentRouter);
apiV1Router.use("/location", locationRouter);
apiV1Router.use("/asset-category", assetCategoryRouter);
apiV1Router.use("/asset-requests", assetRequestRouter);



export default apiV1Router;