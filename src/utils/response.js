// utils/response.js
export const sendResponse = (res, statusCode, message, data = null) => {
  const response = { success: statusCode < 400, message };
  if (data) Object.assign(response, data);
  return res.status(statusCode).json(response);
};