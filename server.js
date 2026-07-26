require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

// Initialize Express for Render web service requirement
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('EcoCash Telegram Bot is running live!');
});

app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});

// Initialize Telegram Bot
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
    console.error("Error: TELEGRAM_BOT_TOKEN is missing in environment variables.");
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

// Helper to check if a chat ID is a sub-admin
function getSubAdminKeys() {
    return Object.keys(process.env).filter(key => key.startsWith('ADMIN_') && key !== 'ADMIN_1_CHAT_ID');
}

function checkIfSubAdmin(chatIdString) {
    const subAdminKeys = getSubAdminKeys();
    return subAdminKeys.some(key => process.env[key] === chatIdString);
}

// Handler for /start command
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const chatIdStr = chatId.toString();
    const firstName = msg.from.first_name || "User";
    const username = msg.from.username ? `@${msg.from.username}` : "No username";

    // 1. Main Admin (ADMIN_1)
    if (chatIdStr === process.env.ADMIN_1_CHAT_ID) {
        return sendMainAdminDashboard(chatId, firstName, username);
    }

    // 2. Sub-Admin
    if (checkIfSubAdmin(chatIdStr)) {
        return sendSubAdminDashboard(chatId, firstName, username);
    }

    // 3. Regular User: Show EcoCash Welcome Message + Their Chat ID
    const welcomeMessage = `
🏦 **ECOCASH LOAN SERVICE**
----------------------------------------
Welcome, **${firstName}**!

* **Chat ID:** \`${chatId}\`
* **Username:** ${username}

Please contact an administrator for access or account approval.
    `;

    await bot.sendMessage(chatId, welcomeMessage, { parse_mode: "Markdown" });
});

// Main Admin Dashboard Sender
async function sendMainAdminDashboard(chatId, firstName, username) {
    const subAdminKeys = getSubAdminKeys();
    let subAdminListText = "";

    if (subAdminKeys.length === 0) {
        subAdminListText = "No sub-admins currently configured via environment variables.";
    } else {
        subAdminListText = subAdminKeys.map(key => `- ${key}: \`${process.env[key]}\``).join('\n');
    }

    const dashboardText = `
🏦 **ECOCASH ADMIN BOT ACTIVATED**
----------------------------------------
👤 **User Info:**
• Name: ${firstName}
• Username: ${username}
• Chat ID: \`${chatId}\`
• Role: **Main Admin**

👑 **MAIN ADMIN CONTROL PANEL**
Approve payment status to authorize sub-admins (Admin-002, Admin-003 onwards):

${subAdminListText}
    `;

    const options = {
        parse_mode: "Markdown",
        reply_markup: {
            inline_keyboard: [
                [{ text: "🌐 Open Main Dashboard", callback_data: "main_dashboard" }]
            ]
        }
    };

    await bot.sendMessage(chatId, dashboardText, options);
}

// Sub-Admin Dashboard Sender
async function sendSubAdminDashboard(chatId, firstName, username) {
    const dashboardText = `
🏦 **ECOCASH SUB-ADMIN PORTAL**
----------------------------------------
👤 **User Info:**
• Name: ${firstName}
• Username: ${username}
• Chat ID: \`${chatId}\`
• Role: **Sub-Admin**

You have authorization to manage client requests.
    `;

    await bot.sendMessage(chatId, dashboardText, { parse_mode: "Markdown" });
}

// Handle callback queries for inline buttons
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data === "main_dashboard") {
        await bot.answerCallbackQuery(query.id, { text: "Main Dashboard options loaded." });
        await bot.sendMessage(chatId, "🛠️ **Main Admin Tools:** Use environment variables to assign or revoke sub-admins.", { parse_mode: "Markdown" });
    }
});

console.log("Telegram bot is running and listening for messages...");
    
