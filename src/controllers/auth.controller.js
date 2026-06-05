// controllers/auth.controller.js
import AuthService from '../services/auth.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendResponse } from '../utils/response.js';

class AuthController {
  registersuper_admin = asyncHandler(async (req, res) => {
    const result = await AuthService.registersuper_admin(req.body, req);
    return sendResponse(res, 201, 'Super admin account created successfully', result);
  });

  login = asyncHandler(async (req, res) => {
    const result = await AuthService.login(req.body, req);

    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'development',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000
    });

    return sendResponse(res, 200, 'Login successful', {
      user: result.user,
      accessToken: result.accessToken
    });
  });

  logout = asyncHandler(async (req, res) => {
    await AuthService.logout(req.user._id, req);
    res.clearCookie('refreshToken');
    return sendResponse(res, 200, 'Logged out successfully');
  });

  getCurrentUser = asyncHandler(async (req, res) => {
    const user = await AuthService.getCurrentUser(req.user._id);
    return sendResponse(res, 200, 'User fetched successfully', { user });
  });

  changePassword = asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    await AuthService.changePassword(req.user._id, currentPassword, newPassword, req);
    res.clearCookie('refreshToken');
    return sendResponse(res, 200, 'Password changed successfully. Please login again.');
  });

  forgotPassword = asyncHandler(async (req, res) => {
    const { email } = req.body;
    const result = await AuthService.forgotPassword(email, req);
    return sendResponse(res, 200, result.message);
  });

  resetPassword = asyncHandler(async (req, res) => {
    const { token, newPassword } = req.body;
    const result = await AuthService.resetPassword(token, newPassword, req);
    return sendResponse(res, 200, result.message);
  });

  updateLastActive = asyncHandler(async (req, res) => {
    await AuthService.updateLastActive(req.user._id);
    return sendResponse(res, 200, 'Last active updated');
  });
}

export default new AuthController();