import ContactService from '../services/contact.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendResponse } from '../utils/response.js';

class ContactController {
  createContact = asyncHandler(async (req, res) => {
    const contact = await ContactService.createContact(req.body);
    return sendResponse(res, 201, 'Contact message submitted successfully', contact);
  });

  getAllContacts = asyncHandler(async (req, res) => {
    const contacts = await ContactService.getAllContacts(req.query);
    return sendResponse(res, 200, 'Contact messages fetched successfully', contacts);
  });

  getContactById = asyncHandler(async (req, res) => {
    const contact = await ContactService.getContactById(req.params.id);
    return sendResponse(res, 200, 'Contact message fetched successfully', contact);
  });

  deleteContact = asyncHandler(async (req, res) => {
    const result = await ContactService.deleteContact(req.params.id, req.user._id);
    return sendResponse(res, 200, result.message, result);
  });
}

export default new ContactController();