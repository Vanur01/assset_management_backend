import AuditLog from '../models/auditLog.model.js';
import EmailService from './email.service.js';
import NotificationService from './notification.service.js';
import { NotFoundError, ValidationError } from '../errors/customError.js';
import Contact from '../models/contact.model.js'


class ContactService {
  async createContact(data) {
    const { fullName, email, phone, message } = data;

    if (!fullName || !email || !message) {
      throw new ValidationError([{ field: 'required', message: 'Name, email, and message are required' }]);
    }

    const contact = await Contact.create({ fullName, email, phone, message });

    // Send confirmation email to the user
    await EmailService.sendContactConfirmationEmail({ fullName, email, phone, message });

    // Send notification email to admin/support
    await EmailService.sendContactAdminNotificationEmail({ fullName, email, phone, message, contactId: contact._id });

    // Create notification for super admin
    await NotificationService.notifyContactInquiry({ fullName, email, phone, message });

    await AuditLog.create({
      action: 'CREATE',
      resource: 'contact',
      resourceId: contact._id,
      actor: null,
      actorRole: 'public',
      description: `New contact inquiry from ${fullName} (${email})`,
      newData: { fullName, email, phone, message: message.substring(0, 100) }
    });

    return contact._doc;
  }

  async getAllContacts(filters = {}) {
    const { page = 1, limit = 10, search = '' } = filters;
    const query = {};

    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;

    const [contacts, total] = await Promise.all([
      Contact.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Contact.countDocuments(query)
    ]);

    return {
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        contacts
      }
    };
  }

  async getContactById(contactId) {
    const contact = await Contact.findById(contactId);
    if (!contact) throw new NotFoundError('Contact message not found');
    return contact._doc;
  }

  async deleteContact(contactId, actorId) {
    const contact = await Contact.findById(contactId);
    if (!contact) throw new NotFoundError('Contact message not found');
    
    await Contact.findByIdAndDelete(contactId);

    await AuditLog.create({
      action: 'DELETE',
      resource: 'contact',
      resourceId: contactId,
      actor: actorId,
      actorRole: 'super_admin',
      description: `Contact inquiry from ${contact.fullName} deleted`
    });

    return { success: true, message: 'Contact deleted successfully' };
  }
}

export default new ContactService();