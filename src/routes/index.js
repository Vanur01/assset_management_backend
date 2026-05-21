import express from "express";
import userRouter from "./user.routes.js";
import assetRouter from './asset.routes.js';
import ChecklistRouter from "./checklist.routes.js";
import dashboardRouter from "./dashboard.routes.js";
import AssignmentRouters from './Assignment.routes.js';
import requestChecklistRouter from "./ChecklistRequest.routes.js";
import super_adminReportRouter from "./report.routes.js";
import settingRouter from "./settings.routes.js";

const apiV1Router = express.Router();

apiV1Router.use("/user", userRouter);
apiV1Router.use('/asset', assetRouter);
apiV1Router.use('/checklist', ChecklistRouter);
apiV1Router.use('/dashboard', dashboardRouter);
apiV1Router.use('/assignments', AssignmentRouters);
apiV1Router.use('/checklist-requests', requestChecklistRouter);
apiV1Router.use('/reports', super_adminReportRouter);
apiV1Router.use('/settings', settingRouter);

export default apiV1Router;