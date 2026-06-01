// utils/emailTemplates.js - Professional Email Templates for AssetMach Platform

// ==================== CLIENT EMAILS ====================

export const getNewClientEmailTemplate = (clientData, resetLink) => {
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + 3);

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Welcome to AssetMach - Your Inspection Management Platform</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background-color: #f0f2f5;
          margin: 0;
          padding: 0;
          line-height: 1.6;
        }
        .container {
          max-width: 650px;
          margin: 0 auto;
          background-color: #ffffff;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 10px 40px rgba(0,0,0,0.1);
        }
        .header {
          background: linear-gradient(135deg, #0f2b3d 0%, #1a4a6b 50%, #2e7d9e 100%);
          padding: 40px 30px;
          text-align: center;
          position: relative;
        }
        .header h1 {
          color: #ffffff;
          margin: 0;
          font-size: 32px;
          font-weight: 700;
          letter-spacing: -0.5px;
        }
        .header .tagline {
          color: rgba(255,255,255,0.9);
          margin-top: 10px;
          font-size: 16px;
        }
        .logo {
          font-size: 48px;
          margin-bottom: 10px;
        }
        .content {
          padding: 40px 35px;
        }
        .welcome-text {
          font-size: 18px;
          color: #1f2937;
          margin-bottom: 25px;
          font-weight: 500;
        }
        .info-box {
          background: linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%);
          border-left: 4px solid #1a4a6b;
          padding: 20px 25px;
          margin: 25px 0;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        }
        .info-box h3 {
          margin-top: 0;
          color: #1a4a6b;
          font-size: 18px;
        }
        .info-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
          margin-top: 15px;
        }
        .info-item {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid #e2e8f0;
        }
        .info-label {
          font-weight: 600;
          color: #475569;
        }
        .info-value {
          color: #1f2937;
        }
        .credentials {
          background: linear-gradient(135deg, #fff9e6 0%, #fff3cd 100%);
          border: 1px solid #ffd54f;
          border-radius: 12px;
          padding: 25px;
          margin: 25px 0;
          box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        }
        .credentials h3 {
          color: #d97706;
          margin-top: 0;
          font-size: 18px;
        }
        .credential-item {
          background-color: #ffffff;
          padding: 12px 15px;
          border-radius: 8px;
          margin: 12px 0;
          font-family: 'Courier New', monospace;
          border: 1px solid #e5e7eb;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }
        .credential-label {
          font-weight: 700;
          color: #374151;
          display: inline-block;
          width: 70px;
        }
        .credential-value {
          color: #059669;
          font-weight: 500;
        }
        .button {
          display: inline-block;
          background: linear-gradient(135deg, #1a4a6b 0%, #2e7d9e 100%);
          color: white;
          text-decoration: none;
          padding: 14px 35px;
          border-radius: 50px;
          margin: 20px 0;
          font-weight: 600;
          font-size: 16px;
          transition: all 0.3s ease;
          box-shadow: 0 4px 12px rgba(26,74,107,0.3);
        }
        .button:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(26,74,107,0.4);
        }
        .reset-link-box {
          background-color: #f0fdf4;
          border: 1px solid #86efac;
          border-radius: 12px;
          padding: 20px;
          margin: 25px 0;
          text-align: center;
        }
        .reset-link-box p {
          margin: 0 0 10px 0;
          color: #166534;
        }
        .reset-link {
          word-break: break-all;
          color: #059669;
          font-size: 12px;
          background-color: #ffffff;
          padding: 10px;
          border-radius: 8px;
          font-family: monospace;
        }
        .features {
          margin: 30px 0;
          background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
          padding: 25px;
          border-radius: 12px;
        }
        .features h4 {
          color: #1a4a6b;
          margin-top: 0;
          font-size: 16px;
        }
        .features ul {
          margin: 0;
          padding-left: 20px;
        }
        .features li {
          margin: 10px 0;
          color: #334155;
        }
        .footer {
          background-color: #1e293b;
          padding: 30px;
          text-align: center;
          color: #94a3b8;
          font-size: 13px;
        }
        .footer a {
          color: #60a5fa;
          text-decoration: none;
        }
        .warning {
          color: #dc2626;
          font-size: 13px;
          margin-top: 15px;
          background-color: #fef2f2;
          padding: 12px;
          border-radius: 8px;
        }
        .expiry-badge {
          background-color: #fef3c7;
          color: #d97706;
          padding: 5px 12px;
          border-radius: 20px;
          font-size: 12px;
          display: inline-block;
        }
        @media (max-width: 600px) {
          .content { padding: 25px 20px; }
          .info-grid { grid-template-columns: 1fr; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">🏗️</div>
          <h1>Welcome to AssetMach</h1>
          <div class="tagline">Enterprise Asset & Inspection Management Platform</div>
        </div>
        <div class="content">
          <p class="welcome-text">Dear <strong>${clientData.customerName}</strong>,</p>
          
          <p>We are thrilled to welcome you to <strong>AssetMach</strong> – your comprehensive solution for asset management and inspection operations. Your organization has been successfully onboarded to our platform, and we're excited to partner with you in optimizing your inspection processes.</p>
          
          <div class="info-box">
            <h3>📋 Organization Account Details</h3>
            <div class="info-grid">
              <div class="info-item"><span class="info-label">Organization:</span><span class="info-value">${clientData.customerName}</span></div>
              <div class="info-item"><span class="info-label">Email Address:</span><span class="info-value">${clientData.email}</span></div>
              <div class="info-item"><span class="info-label">Subscription Plan:</span><span class="info-value"><strong>${clientData.membershipPlan?.toUpperCase() || 'STANDARD'}</strong></span></div>
              <div class="info-item"><span class="info-label">Team Licenses:</span><span class="info-value">${clientData.licenseLimit || 10} users</span></div>
              <div class="info-item"><span class="info-label">Storage Allocation:</span><span class="info-value">${clientData.storageLimit || 10} GB</span></div>
              <div class="info-item"><span class="info-label">API Calls/Month:</span><span class="info-value">${clientData.apiCallLimit?.toLocaleString() || '10,000'} requests</span></div>
              <div class="info-item"><span class="info-label">Valid Until:</span><span class="info-value">${new Date(clientData.subscriptionEndDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span></div>
              <div class="info-item"><span class="info-label">Auto-Renewal:</span><span class="info-value">${clientData.autoRenewal !== false ? '✅ Enabled' : '❌ Disabled'}</span></div>
            </div>
          </div>

          <div class="credentials">
            <h3>🔐 Your Login Credentials</h3>
            <div class="credential-item">
              <span class="credential-label">Email:</span>
              <span class="credential-value">${clientData.email}</span>
            </div>
            <div class="warning">
              ⚠️ <strong>Security Notice:</strong> This is a temporary password. For security reasons, you will be required to change it upon your first login.
            </div>
          </div>

          <div class="reset-link-box">
            <p>🔑 <strong>Set Up Your Account Now</strong></p>
            <p>Click the button below to set up your password. This link will expire on <strong>${expiryDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</strong>.</p>
            <a href="${resetLink}" class="button">🔐 Set Up Your Password</a>
          </div>

          <div class="features">
            <h4>✨ What You Can Do With AssetMach</h4>
            <ul>
              <li><strong>👥 Team Management</strong> – Invite and manage your inspection team members with custom roles and permissions</li>
              <li><strong>📋 Smart Checklists</strong> – Create dynamic inspection checklists tailored to your assets</li>
              <li><strong>🎯 Asset Tracking</strong> – Monitor asset health, maintenance history, and compliance status</li>
              <li><strong>📊 Real-time Analytics</strong> – Track inspection completion rates, team performance, and compliance metrics</li>
              <li><strong>📱 Mobile-Ready</strong> – Conduct inspections from anywhere using any device</li>
              <li><strong>📈 Custom Reports</strong> – Generate professional reports for stakeholders and regulators</li>
              <li><strong>🔔 Smart Notifications</strong> – Stay updated with automated alerts and reminders</li>
              <li><strong>🔄 API Integration</strong> – Connect AssetMach with your existing systems via REST API</li>
            </ul>
          </div>

          <div style="background-color: #f1f5f9; padding: 20px; border-radius: 12px; margin: 25px 0;">
            <h4 style="margin-top: 0; color: #1e293b;">📞 Need Assistance?</h4>
            <p>Our dedicated support team is here to help you get started:</p>
            <ul style="margin: 0; padding-left: 20px;">
              <li><strong>📧 Email:</strong> <a href="mailto:support@assetmach.com" style="color: #1a4a6b;">support@assetmach.com</a></li>
              <li><strong>📞 Phone:</strong> +1 (888) 123-4567 (Mon-Fri, 9 AM - 6 PM EST)</li>
              <li><strong>💬 Live Chat:</strong> Available on your dashboard</li>
              <li><strong>📚 Documentation:</strong> <a href="${process.env.DOCS_URL || 'https://docs.assetmach.com'}" style="color: #1a4a6b;">https://docs.assetmach.com</a></li>
            </ul>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL || 'https://app.assetmach.com'}/login" class="button">
              🚀 Launch Dashboard
            </a>
          </div>

          <p style="font-size: 14px; color: #6b7280; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 20px;">
            <strong>Getting Started Guide:</strong> We've prepared a comprehensive onboarding guide to help you maximize the value of AssetMach. <a href="${process.env.FRONTEND_URL}/guides/onboarding" style="color: #1a4a6b;">Download your copy here →</a>
          </p>
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} <strong>AssetMach</strong> – Enterprise Asset & Inspection Management Platform. All rights reserved.</p>
          <p>This email was sent to ${clientData.email} as part of your account setup process.</p>
          <p><a href="${process.env.FRONTEND_URL}/privacy">Privacy Policy</a> | <a href="${process.env.FRONTEND_URL}/terms">Terms of Service</a> | <a href="${process.env.FRONTEND_URL}/unsubscribe">Unsubscribe</a></p>
          <p style="font-size: 11px;">AssetMach Inc. | 123 Innovation Drive, Suite 400 | San Francisco, CA 94105</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// ==================== TEAM MEMBER EMAILS ====================

export const getNewTeamMemberEmailTemplate = (memberData, adminData, tempPassword, resetLink) => {
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + 3);

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Welcome to AssetMach - You've Been Added to the Team</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background-color: #f0f2f5;
          margin: 0;
          padding: 0;
          line-height: 1.6;
        }
        .container {
          max-width: 650px;
          margin: 0 auto;
          background-color: #ffffff;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 10px 40px rgba(0,0,0,0.1);
        }
        .header {
          background: linear-gradient(135deg, #4c1d95 0%, #7c3aed 50%, #a855f7 100%);
          padding: 40px 30px;
          text-align: center;
        }
        .header h1 {
          color: #ffffff;
          margin: 0;
          font-size: 32px;
          font-weight: 700;
        }
        .header .tagline {
          color: rgba(255,255,255,0.9);
          margin-top: 10px;
          font-size: 16px;
        }
        .logo {
          font-size: 48px;
          margin-bottom: 10px;
        }
        .content {
          padding: 40px 35px;
        }
        .welcome-text {
          font-size: 18px;
          color: #1f2937;
          margin-bottom: 25px;
          font-weight: 500;
        }
        .org-badge {
          background: linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%);
          padding: 15px 20px;
          border-radius: 12px;
          margin: 20px 0;
          text-align: center;
          border: 1px solid #c4b5fd;
        }
        .org-badge p {
          margin: 0;
          color: #5b21b6;
        }
        .info-box {
          background: linear-gradient(135deg, #f8fafc 0%, #f3e8ff 100%);
          border-left: 4px solid #7c3aed;
          padding: 20px 25px;
          margin: 25px 0;
          border-radius: 12px;
        }
        .info-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
          margin-top: 15px;
        }
        .info-item {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid #e2e8f0;
        }
        .info-label {
          font-weight: 600;
          color: #475569;
        }
        .info-value {
          color: #1f2937;
        }
        .credentials {
          background: linear-gradient(135deg, #fff9e6 0%, #fff3cd 100%);
          border: 1px solid #ffd54f;
          border-radius: 12px;
          padding: 25px;
          margin: 25px 0;
        }
        .credentials h3 {
          color: #d97706;
          margin-top: 0;
        }
        .credential-item {
          background-color: #ffffff;
          padding: 12px 15px;
          border-radius: 8px;
          margin: 12px 0;
          font-family: 'Courier New', monospace;
          border: 1px solid #e5e7eb;
        }
        .credential-label {
          font-weight: 700;
          color: #374151;
          display: inline-block;
          width: 70px;
        }
        .credential-value {
          color: #059669;
          font-weight: 500;
        }
        .button {
          display: inline-block;
          background: linear-gradient(135deg, #7c3aed 0%, #a855f7 100%);
          color: white;
          text-decoration: none;
          padding: 14px 35px;
          border-radius: 50px;
          margin: 20px 0;
          font-weight: 600;
          font-size: 16px;
          transition: all 0.3s ease;
          box-shadow: 0 4px 12px rgba(124,58,237,0.3);
        }
        .button:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(124,58,237,0.4);
        }
        .reset-link-box {
          background-color: #f0fdf4;
          border: 1px solid #86efac;
          border-radius: 12px;
          padding: 20px;
          margin: 25px 0;
          text-align: center;
        }
        .role-badge {
          display: inline-block;
          background-color: #7c3aed;
          color: white;
          padding: 5px 15px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
        }
        .responsibilities {
          background-color: #f8fafc;
          padding: 20px;
          border-radius: 12px;
          margin: 25px 0;
        }
        .responsibilities h4 {
          color: #1a4a6b;
          margin-top: 0;
        }
        .footer {
          background-color: #1e293b;
          padding: 30px;
          text-align: center;
          color: #94a3b8;
          font-size: 13px;
        }
        .warning {
          color: #dc2626;
          font-size: 13px;
          margin-top: 15px;
          background-color: #fef2f2;
          padding: 12px;
          border-radius: 8px;
        }
        @media (max-width: 600px) {
          .content { padding: 25px 20px; }
          .info-grid { grid-template-columns: 1fr; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">👋</div>
          <h1>Welcome to the Team!</h1>
          <div class="tagline">You've been added as a team member on AssetMach</div>
        </div>
        <div class="content">
          <p class="welcome-text">Dear <strong>${memberData.firstName} ${memberData.lastName || ''}</strong>,</p>
          
          <div class="org-badge">
            <p>🏢 <strong>${adminData.customerName}</strong> has added you as a team member on AssetMach</p>
          </div>
          
          <p>We're excited to have you join the inspection team! AssetMach will help you streamline your inspection workflow, track asset conditions, and collaborate effectively with your team.</p>
          
          <div class="info-box">
            <h3>📋 Your Role & Profile</h3>
            <div class="info-grid">
              <div class="info-item"><span class="info-label">Role:</span><span class="info-value"><span class="role-badge">${memberData.customRole || 'Team Member'}</span></span></div>
              <div class="info-item"><span class="info-label">Department:</span><span class="info-value">${memberData.department || 'Not specified'}</span></div>
              <div class="info-item"><span class="info-label">Location:</span><span class="info-value">${memberData.location || 'Not specified'}</span></div>
              <div class="info-item"><span class="info-label">Email:</span><span class="info-value">${memberData.email}</span></div>
              <div class="info-item"><span class="info-label">Joined:</span><span class="info-value">${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span></div>
            </div>
          </div>

          <div class="credentials">
            <h3>🔐 Your Login Credentials</h3>
            <div class="credential-item">
              <span class="credential-label">Email:</span>
              <span class="credential-value">${memberData.email}</span>
            </div>
            <div class="warning">
              ⚠️ <strong>Security Notice:</strong> This is a temporary password. You will be required to change it upon your first login.
            </div>
          </div>

          <div class="reset-link-box">
            <p>🔑 <strong>Activate Your Account</strong></p>
            <p>Click the button below to set up your password. This link will expire on <strong>${expiryDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</strong>.</p>
            <a href="${resetLink}" class="button">🔐 Activate Your Account</a>
          </div>

          <div class="responsibilities">
            <h4>✅ What You Can Do as a Team Member</h4>
            <ul>
              <li><strong>📋 Complete Inspections</strong> – Access and complete assigned inspection checklists</li>
              <li><strong>📸 Upload Evidence</strong> – Attach photos, documents, and notes to inspections</li>
              <li><strong>📊 Track Performance</strong> – Monitor your inspection metrics and quality scores</li>
              <li><strong>🔔 Receive Assignments</strong> – Get notified when new inspections are assigned to you</li>
              <li><strong>📱 Mobile Access</strong> – Conduct inspections from any device, anywhere</li>
              <li><strong>🏆 Earn Recognition</strong> – High performers are recognized on team leaderboards</li>
            </ul>
          </div>

          <div style="background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); padding: 20px; border-radius: 12px; margin: 20px 0;">
            <h4 style="margin: 0 0 10px 0; color: #166534;">💡 Pro Tip</h4>
            <p style="margin: 0;">Download the AssetMach mobile app from the App Store or Google Play to conduct inspections on the go, even without internet connection!</p>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL || 'https://app.assetmach.com'}/login" class="button">
              🚀 Go to Dashboard
            </a>
          </div>

          <p style="font-size: 14px; color: #6b7280; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 20px;">
            Need help getting started? Check out our <a href="${process.env.FRONTEND_URL}/guides/team-member" style="color: #7c3aed;">Team Member Quick Start Guide</a> or contact your organization administrator.
          </p>
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} <strong>AssetMach</strong> – Enterprise Asset & Inspection Management Platform</p>
          <p>You're receiving this email because ${adminData.customerName} added you to their AssetMach team.</p>
          <p><a href="${process.env.FRONTEND_URL}/privacy" style="color: #94a3b8;">Privacy Policy</a> | <a href="${process.env.FRONTEND_URL}/terms" style="color: #94a3b8;">Terms of Service</a></p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// ==================== DEACTIVATION EMAILS ====================

export const getTeamMemberRemovedEmailTemplate = (memberData, adminData) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>AssetMach - Account Access Updated</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background-color: #f0f2f5;
          margin: 0;
          padding: 0;
          line-height: 1.6;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background-color: #ffffff;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 10px 40px rgba(0,0,0,0.1);
        }
        .header {
          background: linear-gradient(135deg, #991b1b 0%, #dc2626 100%);
          padding: 40px 30px;
          text-align: center;
        }
        .header h1 {
          color: #ffffff;
          margin: 0;
          font-size: 28px;
        }
        .logo {
          font-size: 48px;
          margin-bottom: 10px;
        }
        .content {
          padding: 40px 35px;
        }
        .info-box {
          background-color: #fef2f2;
          border-left: 4px solid #dc2626;
          padding: 20px;
          margin: 25px 0;
          border-radius: 12px;
        }
        .button {
          display: inline-block;
          background-color: #dc2626;
          color: white;
          text-decoration: none;
          padding: 12px 30px;
          border-radius: 8px;
          margin: 20px 0;
          font-weight: 600;
        }
        .footer {
          background-color: #1e293b;
          padding: 30px;
          text-align: center;
          color: #94a3b8;
          font-size: 13px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">🔒</div>
          <h1>Account Access Updated</h1>
        </div>
        <div class="content">
          <p>Dear <strong>${memberData.firstName} ${memberData.lastName || ''}</strong>,</p>
          
          <div class="info-box">
            <p><strong>Your access to AssetMach has been deactivated by ${adminData.customerName}.</strong></p>
            <p>You will no longer be able to access your account, view assigned inspections, or submit inspection reports.</p>
          </div>
          
          <p><strong>What does this mean?</strong></p>
          <ul>
            <li>You cannot log into your AssetMach account</li>
            <li>Any pending inspections will be reassigned</li>
            <li>Your inspection history remains in the system for audit purposes</li>
          </ul>
          
          <p>If you believe this change was made in error or have questions, please contact your organization administrator directly.</p>
          
          <div style="background-color: #f8fafc; padding: 20px; border-radius: 12px; margin: 25px 0;">
            <p style="margin: 0;"><strong>📞 Need to appeal?</strong> Contact your administrator at: <a href="mailto:${adminData.email}">${adminData.email}</a></p>
          </div>
          
          <p>Thank you for your contributions to the AssetMach platform.</p>
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} AssetMach – Enterprise Asset & Inspection Management Platform</p>
          <p>This is an automated notification, please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

export const getClientDeactivatedEmailTemplate = (clientData) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>AssetMach - Account Deactivated</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background-color: #f0f2f5;
          margin: 0;
          padding: 0;
          line-height: 1.6;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background-color: #ffffff;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 10px 40px rgba(0,0,0,0.1);
        }
        .header {
          background: linear-gradient(135deg, #991b1b 0%, #dc2626 100%);
          padding: 40px 30px;
          text-align: center;
        }
        .header h1 {
          color: #ffffff;
          margin: 0;
          font-size: 28px;
        }
        .content {
          padding: 40px 35px;
        }
        .info-box {
          background-color: #fef2f2;
          border-left: 4px solid #dc2626;
          padding: 20px;
          margin: 25px 0;
          border-radius: 12px;
        }
        .appeal-box {
          background-color: #f8fafc;
          padding: 20px;
          border-radius: 12px;
          margin: 25px 0;
          text-align: center;
        }
        .footer {
          background-color: #1e293b;
          padding: 30px;
          text-align: center;
          color: #94a3b8;
          font-size: 13px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">⚠️</div>
          <h1>Organization Account Deactivated</h1>
        </div>
        <div class="content">
          <p>Dear <strong>${clientData.customerName}</strong>,</p>
          
          <div class="info-box">
            <p><strong>Your organization's AssetMach account has been deactivated.</strong></p>
            <p>All team members associated with your account have also been deactivated and cannot access the platform.</p>
          </div>
          
          <p><strong>Impact of Deactivation:</strong></p>
          <ul>
            <li>❌ No access to the AssetMach dashboard</li>
            <li>❌ Team members cannot conduct inspections</li>
            <li>❌ No new inspections can be assigned</li>
            <li>❌ API access is revoked</li>
            <li>✅ Your data remains securely stored and can be restored upon reactivation</li>
          </ul>
          
          <div class="appeal-box">
            <p><strong>🔓 Want to reactivate your account?</strong></p>
            <p>Contact our support team to discuss reactivation options:</p>
            <p><strong>📧 Email:</strong> <a href="mailto:support@assetmach.com">support@assetmach.com</a><br>
            <strong>📞 Phone:</strong> +1 (888) 123-4567</p>
          </div>
          
          <p>We value your partnership with AssetMach and hope to serve you again in the future.</p>
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} AssetMach – Enterprise Asset & Inspection Management Platform</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// ==================== PASSWORD RESET EMAIL ====================

export const getPasswordResetEmailTemplate = (user, resetLink) => {
  const userName = user.role === 'admin' ? user.customerName :
    user.role === 'team' ? `${user.firstName || ''} ${user.lastName || ''}`.trim() :
      user.name;
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + 3);

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>AssetMach - Password Reset Request</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background-color: #f0f2f5;
          margin: 0;
          padding: 0;
          line-height: 1.6;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background-color: #ffffff;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 10px 40px rgba(0,0,0,0.1);
        }
        .header {
          background: linear-gradient(135deg, #d97706 0%, #f59e0b 100%);
          padding: 40px 30px;
          text-align: center;
        }
        .header h1 {
          color: #ffffff;
          margin: 0;
          font-size: 28px;
        }
        .content {
          padding: 40px 35px;
        }
        .alert-box {
          background-color: #fef3c7;
          border-left: 4px solid #f59e0b;
          padding: 20px;
          margin: 25px 0;
          border-radius: 12px;
        }
        .reset-button {
          display: inline-block;
          background: linear-gradient(135deg, #d97706 0%, #f59e0b 100%);
          color: #fff;
          text-decoration: none;
          padding: 14px 35px;
          border-radius: 50px;
          margin: 20px 0;
          font-weight: 600;
          font-size: 16px;
        }
        .security-box {
          background-color: #f1f5f9;
          padding: 20px;
          border-radius: 12px;
          margin: 25px 0;
        }
        .warning-box {
          background-color: #fef2f2;
          padding: 15px;
          border-radius: 8px;
          color: #dc2626;
          font-size: 14px;
          margin: 20px 0;
        }
        .footer {
          background-color: #1e293b;
          padding: 30px;
          text-align: center;
          color: #94a3b8;
          font-size: 13px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">🔐</div>
          <h1>Password Reset Request</h1>
        </div>
        <div class="content">
          <p>Dear <strong>${userName}</strong>,</p>
          
          <p>We received a request to reset the password for your AssetMach account associated with <strong>${user.email}</strong>.</p>
          
          <div class="alert-box">
            <p><strong>⚠️ Important:</strong> This password reset link will expire on <strong>${expiryDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</strong>.</p>
          </div>
          
          <div style="text-align: center;">
            <a href="${resetLink}" class="reset-button">
              🔑 Reset My Password
            </a>
          </div>
          
          <div class="warning-box">
            <strong>🔒 Didn't request this?</strong> If you didn't request a password reset, please ignore this email. Your password will remain unchanged. For added security, you may want to log in and review your account activity.
          </div>
          
          <div class="security-box">
            <h4 style="margin-top: 0; color: #1e293b;">🛡️ Security Tips</h4>
            <ul style="margin-bottom: 0;">
              <li>Never share your password with anyone</li>
              <li>Use a unique password that you don't use elsewhere</li>
              <li>Enable two-factor authentication for added security</li>
              <li>Always verify you're on the official AssetMach website before entering credentials</li>
            </ul>
          </div>
          
          <p>If the button doesn't work, copy and paste this link into your browser:</p>
          <p style="word-break: break-all; background-color: #f8fafc; padding: 12px; border-radius: 8px; font-family: monospace; font-size: 12px;">${resetLink}</p>
          
          <hr style="margin: 30px 0; border-color: #e5e7eb;">
          
          <p style="font-size: 13px; color: #6b7280;">Need additional help? Contact our support team at <a href="mailto:support@assetmach.com">support@assetmach.com</a></p>
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} AssetMach – Enterprise Asset & Inspection Management Platform</p>
          <p>This is an automated email, please do not reply.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// ==================== INACTIVITY REMINDER EMAIL ====================

export const getInactivityReminderEmailTemplate = (user, daysInactive) => {
  const userName = user.role === 'admin' ? user.customerName :
    user.role === 'team' ? `${user.firstName || ''} ${user.lastName || ''}`.trim() :
      user.name;
  const roleText = user.role === 'admin' ? 'Organization' : 'Team Member';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>AssetMach - Account Inactivity Notice</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background-color: #f0f2f5;
          margin: 0;
          padding: 0;
          line-height: 1.6;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background-color: #ffffff;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 10px 40px rgba(0,0,0,0.1);
        }
        .header {
          background: linear-gradient(135deg, #6b21a5 0%, #9333ea 100%);
          padding: 40px 30px;
          text-align: center;
        }
        .header h1 {
          color: #ffffff;
          margin: 0;
          font-size: 28px;
        }
        .content {
          padding: 40px 35px;
        }
        .warning-box {
          background-color: #fef2f2;
          border-left: 4px solid #dc2626;
          padding: 20px;
          margin: 25px 0;
          border-radius: 12px;
        }
        .login-button {
          display: inline-block;
          background: linear-gradient(135deg, #9333ea 0%, #a855f7 100%);
          color: white;
          text-decoration: none;
          padding: 14px 35px;
          border-radius: 50px;
          margin: 20px 0;
          font-weight: 600;
          font-size: 16px;
        }
        .consequences {
          background-color: #f8fafc;
          padding: 20px;
          border-radius: 12px;
          margin: 25px 0;
        }
        .footer {
          background-color: #1e293b;
          padding: 30px;
          text-align: center;
          color: #94a3b8;
          font-size: 13px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">⏰</div>
          <h1>Account Inactivity Alert</h1>
        </div>
        <div class="content">
          <p>Dear <strong>${userName}</strong>,</p>
          
          <div class="warning-box">
            <p><strong>⚠️ Your ${roleText.toLowerCase()} account has been inactive for ${daysInactive} days.</strong></p>
            <p>We haven't detected any login activity on your account during this period.</p>
          </div>
          
          <div style="text-align: center;">
            <a href="${process.env.FRONTEND_URL || 'https://app.assetmach.com'}/login" class="login-button">
              🔑 Login to Your Account
            </a>
          </div>
          
          <div class="consequences">
            <h4 style="margin-top: 0; color: #1e293b;">📋 What happens if you remain inactive?</h4>
            <ul style="margin-bottom: 0;">
              <li>You'll miss important inspection assignments and deadlines</li>
              <li>Your team performance metrics may be affected</li>
              <li>Continued inactivity may lead to account deactivation</li>
              <li>You'll stop receiving important platform notifications</li>
            </ul>
          </div>
          
          <p><strong>Why stay active?</strong> Regular logins ensure you stay on top of your inspection schedule, maintain your performance record, and contribute effectively to your team's goals.</p>
          
          <div style="background-color: #f0fdf4; padding: 15px; border-radius: 12px; margin: 20px 0;">
            <p style="margin: 0;"><strong>💡 Pro Tip:</strong> Enable email or push notifications in your settings to stay updated without logging in daily.</p>
          </div>
          
          <p style="color: #6b7280;">Need help? Contact support at <a href="mailto:support@assetmach.com">support@assetmach.com</a></p>
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} AssetMach – Enterprise Asset & Inspection Management Platform</p>
          <p>You're receiving this because your account has been inactive for ${daysInactive} days.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// ==================== SUBSCRIPTION EXPIRY EMAIL ====================

export const getSubscriptionExpiryEmailTemplate = (client, daysRemaining) => {
  const isUrgent = daysRemaining <= 3;
  const expiryDate = new Date(client.subscriptionEndDate);

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>AssetMach - Subscription Expiry Notice</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background-color: #f0f2f5;
          margin: 0;
          padding: 0;
          line-height: 1.6;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background-color: #ffffff;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 10px 40px rgba(0,0,0,0.1);
        }
        .header {
          background: linear-gradient(135deg, ${isUrgent ? '#991b1b' : '#ea580c'} 0%, ${isUrgent ? '#dc2626' : '#f97316'} 100%);
          padding: 40px 30px;
          text-align: center;
        }
        .header h1 {
          color: #ffffff;
          margin: 0;
          font-size: 28px;
        }
        .content {
          padding: 40px 35px;
        }
        .expiry-box {
          background-color: ${isUrgent ? '#fef2f2' : '#ffedd5'};
          border-left: 4px solid ${isUrgent ? '#dc2626' : '#ea580c'};
          padding: 20px;
          margin: 25px 0;
          border-radius: 12px;
        }
        .days-badge {
          font-size: 48px;
          font-weight: 800;
          color: ${isUrgent ? '#dc2626' : '#ea580c'};
          text-align: center;
          margin: 10px 0;
        }
        .renew-button {
          display: inline-block;
          background: linear-gradient(135deg, ${isUrgent ? '#dc2626' : '#ea580c'} 0%, ${isUrgent ? '#b91c1c' : '#c2410c'} 100%);
          color: white;
          text-decoration: none;
          padding: 14px 35px;
          border-radius: 50px;
          margin: 20px 0;
          font-weight: 600;
          font-size: 16px;
        }
        .features-lost {
          background-color: #f8fafc;
          padding: 20px;
          border-radius: 12px;
          margin: 25px 0;
        }
        .support-box {
          background-color: #f1f5f9;
          padding: 20px;
          border-radius: 12px;
          margin: 25px 0;
          text-align: center;
        }
        .footer {
          background-color: #1e293b;
          padding: 30px;
          text-align: center;
          color: #94a3b8;
          font-size: 13px;
        }
        @media (max-width: 600px) {
          .content { padding: 25px 20px; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">📆</div>
          <h1>Subscription Expiry Notice</h1>
        </div>
        <div class="content">
          <p>Dear <strong>${client.customerName}</strong>,</p>
          
          <div class="expiry-box">
            <p><strong>⚠️ Your AssetMach subscription is expiring soon!</strong></p>
            <div class="days-badge">${daysRemaining} ${daysRemaining === 1 ? 'DAY' : 'DAYS'} REMAINING</div>
            <p><strong>Expiry Date:</strong> ${expiryDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
            <p><strong>Current Plan:</strong> ${client.membershipPlan?.toUpperCase() || 'STANDARD'}</p>
            <p><strong>Auto-Renewal:</strong> ${client.settings?.autoRenewal !== false ? '✅ Enabled' : '❌ Disabled'}</p>
          </div>
          
          <div style="text-align: center;">
            <a href="${process.env.FRONTEND_URL || 'https://app.assetmach.com'}/settings/billing" class="renew-button">
              ${isUrgent ? '⚠️ RENEW NOW - PREVENT SERVICE INTERRUPTION' : '🔄 RENEW SUBSCRIPTION'}
            </a>
          </div>
          
          <div class="features-lost">
            <h4 style="margin-top: 0; color: #1e293b;">❌ What you'll lose access to after expiry:</h4>
            <ul style="margin-bottom: 0;">
              <li>👥 <strong>Team Management</strong> – Add or manage team members</li>
              <li>📋 <strong>Inspection Checklists</strong> – Create new checklists or templates</li>
              <li>📊 <strong>Advanced Analytics</strong> – Detailed reports and insights</li>
              <li>🔄 <strong>API Access</strong> – Integrations with your systems</li>
              <li>📱 <strong>Mobile App</strong> – Offline inspection capabilities</li>
              <li>🔔 <strong>Automated Notifications</strong> – Email and push alerts</li>
              <li>💾 <strong>Extended Storage</strong> – Beyond basic limits</li>
            </ul>
          </div>
          
          <div class="support-box">
            <p><strong>💳 Need to update payment method or upgrade your plan?</strong></p>
            <p>Visit your <a href="${process.env.FRONTEND_URL}/settings/billing">Billing Settings</a> or contact our sales team for enterprise options.</p>
            <p style="margin-bottom: 0;"><strong>📞 Sales:</strong> +1 (888) 123-4567 | <strong>📧 Email:</strong> <a href="mailto:sales@assetmach.com">sales@assetmach.com</a></p>
          </div>
          
          ${isUrgent ? `
          <div style="background-color: #fee2e2; padding: 15px; border-radius: 12px; margin: 20px 0; text-align: center;">
            <p style="margin: 0; color: #991b1b; font-weight: 600;">🚨 URGENT: Your subscription expires in ${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'}! Renew now to avoid service interruption.</p>
          </div>
          ` : `
          <div style="background-color: #e0f2fe; padding: 15px; border-radius: 12px; margin: 20px 0;">
            <p style="margin: 0;"><strong>💡 Tip:</strong> Enable auto-renewal in your billing settings to never worry about expiry again!</p>
          </div>
          `}
          
          <hr style="margin: 30px 0; border-color: #e5e7eb;">
          
          <p style="font-size: 13px; color: #6b7280;">Questions about your subscription? Our support team is here to help at <a href="mailto:support@assetmach.com">support@assetmach.com</a></p>
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} AssetMach – Enterprise Asset & Inspection Management Platform</p>
          <p>This is an automated subscription notification, please do not reply.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// ==================== CONTACT INQUIRY EMAILS ====================

export const getContactInquiryEmailTemplate = (inquiryData) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>AssetMach - We've Received Your Inquiry</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background-color: #f0f2f5;
          margin: 0;
          padding: 0;
          line-height: 1.6;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background-color: #ffffff;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 10px 40px rgba(0,0,0,0.1);
        }
        .header {
          background: linear-gradient(135deg, #0f2b3d 0%, #1a4a6b 50%, #2e7d9e 100%);
          padding: 40px 30px;
          text-align: center;
        }
        .header h1 {
          color: #ffffff;
          margin: 0;
          font-size: 28px;
        }
        .content {
          padding: 40px 35px;
        }
        .message-box {
          background-color: #f8fafc;
          border-left: 4px solid #1a4a6b;
          padding: 20px;
          margin: 25px 0;
          border-radius: 12px;
        }
        .response-box {
          background-color: #f0fdf4;
          border: 1px solid #86efac;
          border-radius: 12px;
          padding: 20px;
          margin: 25px 0;
        }
        .footer {
          background-color: #1e293b;
          padding: 30px;
          text-align: center;
          color: #94a3b8;
          font-size: 13px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">📬</div>
          <h1>Thank You for Contacting AssetMach</h1>
        </div>
        <div class="content">
          <p>Dear <strong>${inquiryData.fullName}</strong>,</p>
          
          <p>Thank you for reaching out to AssetMach. We have received your inquiry and our customer support team will respond to you within <strong>24-48 hours</strong>.</p>
          
          <div class="message-box">
            <h3 style="margin-top: 0; color: #1a4a6b;">📝 Your Inquiry Details</h3>
            <p><strong>Reference #:</strong> AM-${Date.now().toString().slice(-8)}</p>
            <p><strong>Submitted:</strong> ${new Date().toLocaleString()}</p>
            <p><strong>Message:</strong></p>
            <p style="background-color: #ffffff; padding: 15px; border-radius: 8px; margin-top: 10px;">"${inquiryData.message}"</p>
          </div>
          
          <div class="response-box">
            <h4 style="margin-top: 0; color: #166534;">✅ What happens next?</h4>
            <ul style="margin-bottom: 0;">
              <li>Our support team will review your inquiry</li>
              <li>You'll receive a response via email within 24-48 hours</li>
              <li>For urgent matters, call our support hotline</li>
              <li>Check your spam folder if you don't see our response</li>
            </ul>
          </div>
          
          <div style="background-color: #f1f5f9; padding: 20px; border-radius: 12px; margin: 25px 0;">
            <p style="margin: 0;"><strong>📞 Need immediate assistance?</strong><br>
            Call our support hotline: <strong>+1 (888) 123-4567</strong><br>
            Hours: Monday-Friday, 9 AM - 6 PM EST</p>
          </div>
          
          <p style="font-size: 14px; color: #6b7280;">We appreciate your patience and look forward to assisting you.</p>
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} AssetMach – Enterprise Asset & Inspection Management Platform</p>
          <p>This is an automated confirmation, please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

export const getContactInquiryAdminEmailTemplate = (inquiryData) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>AssetMach - New Contact Inquiry (Admin Alert)</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background-color: #f0f2f5;
          margin: 0;
          padding: 0;
          line-height: 1.6;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background-color: #ffffff;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 10px 40px rgba(0,0,0,0.1);
        }
        .header {
          background: linear-gradient(135deg, #991b1b 0%, #dc2626 100%);
          padding: 30px 20px;
          text-align: center;
        }
        .header h1 {
          color: #ffffff;
          margin: 0;
          font-size: 24px;
        }
        .badge {
          display: inline-block;
          background-color: rgba(255,255,255,0.2);
          padding: 5px 15px;
          border-radius: 20px;
          font-size: 12px;
          margin-top: 10px;
          color: #fff;
        }
        .content {
          padding: 35px;
        }
        .alert-box {
          background-color: #fef2f2;
          border-left: 4px solid #dc2626;
          padding: 15px 20px;
          margin: 20px 0;
          border-radius: 8px;
        }
        .info-section {
          background-color: #f8fafc;
          padding: 20px;
          margin: 20px 0;
          border-radius: 12px;
        }
        .message-content {
          background-color: #ffffff;
          border: 1px solid #e5e7eb;
          padding: 15px;
          border-radius: 8px;
          margin-top: 10px;
          line-height: 1.6;
        }
        .action-buttons {
          display: flex;
          gap: 15px;
          margin: 25px 0;
          justify-content: center;
          flex-wrap: wrap;
        }
        .btn-primary {
          display: inline-block;
          background: linear-gradient(135deg, #1a4a6b 0%, #2e7d9e 100%);
          color: white;
          text-decoration: none;
          padding: 12px 25px;
          border-radius: 50px;
          font-weight: 600;
        }
        .btn-secondary {
          display: inline-block;
          background-color: #e5e7eb;
          color: #374151;
          text-decoration: none;
          padding: 12px 25px;
          border-radius: 50px;
          font-weight: 600;
        }
        .footer {
          background-color: #1e293b;
          padding: 30px;
          text-align: center;
          color: #94a3b8;
          font-size: 12px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🔔 New Contact Inquiry Received</h1>
          <div class="badge">URGENT - Requires Response</div>
        </div>
        <div class="content">
          <div class="alert-box">
            <p style="margin:0;"><strong>⚠️ New inquiry submitted at:</strong> ${new Date().toLocaleString()}</p>
          </div>

          <div class="info-section">
            <h4 style="margin-top: 0; color: #1e293b;">👤 Customer Information</h4>
            <p><strong>Name:</strong> ${inquiryData.fullName}</p>
            <p><strong>Email:</strong> <a href="mailto:${inquiryData.email}">${inquiryData.email}</a></p>
            <p><strong>Phone:</strong> ${inquiryData.phone || 'Not provided'}</p>
            <p><strong>IP Address:</strong> ${inquiryData.ipAddress || 'Not recorded'}</p>
          </div>

          <div class="info-section">
            <h4 style="margin-top: 0; color: #1e293b;">💬 Inquiry Message</h4>
            <div class="message-content">
              "${inquiryData.message}"
            </div>
          </div>

          <div class="action-buttons">
            <a href="mailto:${inquiryData.email}?subject=Response to your AssetMach Inquiry" class="btn-primary">
              📧 Reply to Customer
            </a>
            <a href="${process.env.ADMIN_DASHBOARD_URL || 'https://app.assetmach.com/admin/contact-inquiries'}" class="btn-secondary">
              📋 View All Inquiries
            </a>
          </div>

          <hr style="margin: 25px 0; border-color: #e5e7eb;">

          <div style="background-color: #f1f5f9; padding: 15px; border-radius: 12px;">
            <p style="margin: 0 0 10px 0;"><strong>📌 Response Checklist:</strong></p>
            <ul style="margin: 0; padding-left: 20px;">
              <li>✅ Acknowledge receipt within 24 hours</li>
              <li>✅ Address the customer's specific concern</li>
              <li>✅ Provide solution or next steps</li>
              <li>✅ Follow up if needed within 48 hours</li>
              <li>✅ Mark inquiry as resolved in the dashboard</li>
            </ul>
          </div>
        </div>
        <div class="footer">
          <p>This is an automated notification from AssetMach</p>
          <p>To manage email preferences, visit your <a href="${process.env.FRONTEND_URL}/settings/notifications" style="color: #94a3b8;">notification settings</a></p>
        </div>
      </div>
    </body>
    </html>
  `;
};
