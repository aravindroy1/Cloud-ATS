const nodemailer = require('nodemailer');
const { getSecret } = require('../config/keyvault');

const sendEmail = async (to, subject, text, html) => {
  const user = getSecret('SMTP_USER');
  const pass = getSecret('SMTP_PASS');

  if (!user || !pass) {
    console.warn('SMTP credentials not configured. Skipping email send.');
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail', // You can change this or configure host/port if using a different provider
      auth: {
        user: user,
        pass: pass
      }
    });

    const info = await transporter.sendMail({
      from: `"Cloud-ATS Notifications" <${user}>`,
      to,
      subject,
      text,
      html
    });

    console.log(`Message sent: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error(`Error sending email to ${to}:`, error.message);
    throw error;
  }
};

module.exports = {
  sendEmail
};
