import express from 'express';
import TeamController from '../controllers/team.controller.js';
import { authenticate, allowRoles } from '../middlewares/verifyToken.js';
import {
  validateCreateTeamMember,
  validateUpdateTeamMember,
  validateTeamMemberId,
  validateListTeamMembers,
  validateUpdateMyProfile,
  validateChangeMyPassword
} from '../validation/user.validation.js';

const router = express.Router();

router.use(authenticate);

// ── Admin: CRUD ───────────────────────────────────────────────────────────────
router.route('/')
  .post(allowRoles('admin'), validateCreateTeamMember, TeamController.createTeamMember)
  .get(allowRoles('admin'), validateListTeamMembers, TeamController.getAllTeamMembers);

router.route('/:id')
  .get(allowRoles('admin'), validateTeamMemberId, TeamController.getTeamMemberById)
  .put(allowRoles('admin'), validateTeamMemberId, validateUpdateTeamMember, TeamController.updateTeamMember)
  .delete(allowRoles('admin'), validateTeamMemberId, TeamController.deleteTeamMember);

router.get('/:id/details', allowRoles('admin'), validateTeamMemberId, TeamController.getTeamMemberDetails);

// ── Team Self-Service ─────────────────────────────────────────────────────────
router.get('/me/profile', allowRoles('team'), TeamController.getMyProfile);
router.patch('/me/profile', allowRoles('team'), validateUpdateMyProfile, TeamController.updateMyProfile);
router.post('/me/change-password', allowRoles('team'), validateChangeMyPassword, TeamController.changeMyPassword);
router.get('/me/recent-inspections', allowRoles('team', 'admin'), TeamController.getMyRecentInspections);

export default router;