require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

// --- 1. Express Server Setup (Required for Render Web Service Uptime & Sub-Admin Routes) ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.status(200).send('EcoCash Telegram Bot is running live! 🟢');
});

// Dynamic route mapping for Sub-Admin web panels (e.g., /admin-002, /admin-003)
app.get('/:adminRoute', (req, res) => {
    const adminRoute = req.params.adminRoute;
    const subAdminKeys = getSubAdminKeys();
    
    const matchingKey = subAdminKeys.find(key => {
        const formattedSlug = key.toLowerCase().replace(/_/g, '-');
        return formattedSlug === adminRoute.toLowerCase() || key.toLowerCase() === adminRoute.toLowerCase();
    });

    if (matchingKey || adminRoute.toLowerCase().startsWith('admin-')) {
        res.status(200).send(`
            <html>
                <head><title>EcoCash Sub-Admin Portal - ${adminRoute}</title></head>
                <body style="font-family: Arial, sans-serif; padding: 40px; background: #f4f6f9;">
                    <div style="max-width: 600px; margin: auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                        <h2 style="color: #2c3e50;">🏦 EcoCash Sub-Admin Portal</h2>
                        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                        <p><strong>Portal Route:</strong> /${adminRoute}</p>
                        <p><strong>Status:</strong> <span style="color: green; font-weight: bold;">Authorized & Active ✅</span></p>
                        <p>Welcome to your secured management gateway. You have live authorization to handle client requests.</p>
                    </div>
                </body>
            </html>
        `);
    } else {
        res.status(404).send('404 - Portal Not Found or Unauthorized Access. ❌');
    }
});

app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT} 🚀`);
});

// --- 2. Initialize Telegram Bot ---
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
    console.error("Error: TELEGRAM_BOT_TOKEN is missing in environment variables. ❌");
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

// Global error handlers to prevent crashes
bot.on('polling_error', (error) => {
    console.error("Telegram Polling Error:", error.message || error);
});

bot.on('error', (error) => {
    console.error("Telegram General Error:", error.message || error);
});

// Helper to check if a chat ID is a sub-admin
function getSubAdminKeys() {
    return Object.keys(process.env).filter(key => key.startsWith('ADMIN_') && key !== 'ADMIN_1_CHAT_ID');
}

function checkIfSubAdmin(chatIdString) {
    const subAdminKeys = getSubAdminKeys();
    return subAdminKeys.some(key => process.env[key] === chatIdString);
}

// Helper to find the specific env key name (e.g. ADMIN_2_CHAT_ID) by chat ID
function getSubAdminKeyByChatId(chatIdString) {
    const subAdminKeys = getSubAdminKeys();
    return subAdminKeys.find(key => process.env[key] === chatIdString);
}

// Handler for /start command
bot.onText(/\/start/, async (msg) => {
    try {
        const chatId = msg.chat.id;
        const chatIdStr = chatId.toString();
        const firstName = msg.from.first_name || "User";
        const username = msg.from.username ? `@${msg.from.username}` : "No username";

        // 1. Main Admin (ADMIN_1)
        if (chatIdStr === process.env.ADMIN_1_CHAT_ID) {
            return await sendMainAdminDashboard(chatId, firstName, username);
        }

        // 2. Sub-Admin (Shows welcome message, personal info, chat ID, and private link immediately)
        if (checkIfSubAdmin(chatIdStr)) {
            return await sendSubAdminDashboard(chatId, firstName, username, chatIdStr);
        }

        // 3. Regular User: Show EcoCash Welcome Message + Their Chat ID
        const welcomeMessage = 
`🏦 ECOCASH LOAN SERVICE 💳
----------------------------------------
Welcome, ${firstName}! 👋

🔹 Chat ID: ${chatId}
🔹 Username: ${username}

Please contact an administrator for access or account approval. ⚠️`;

        await bot.sendMessage(chatId, welcomeMessage);
    } catch (error) {
        console.error("Error handling /start command:", error.message || error);
    }
});

// Main Admin Dashboard Sender
async function sendMainAdminDashboard(chatId, firstName, username) {
    const subAdminKeys = getSubAdminKeys();
    let subAdminListText = "";

    if (subAdminKeys.length === 0) {
        subAdminListText = "No sub-admins currently configured via environment variables. ℹ️";
    } else {
        subAdminListText = subAdminKeys.map(key => `🔹 ${key}: ${process.env[key]}`).join('\n');
    }

    const dashboardText = 
`🏦 ECOCASH ADMIN BOT ACTIVATED ⚙️
----------------------------------------
👤 User Info:
▫️ Name: ${firstName}
▫️ Username: ${username}
▫️ Chat ID: ${chatId}
▫️ Role: Main Admin 👑

👑 MAIN ADMIN CONTROL PANEL
Approve payment status to authorize sub-admins (Admin-002, Admin-003 onwards): 📋

${subAdminListText}`;

    const options = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "🌐 Open Main Dashboard", callback_data: "main_dashboard" }]
            ]
        }
    };

    await bot.sendMessage(chatId, dashboardText, options);
}

// Sub-Admin Dashboard Sender (Displays requested format with personal info, ID, and private route link)
async function sendSubAdminDashboard(chatId, firstName, username, chatIdStr) {
    const subAdminKey = getSubAdminKeyByChatId(chatIdStr);
    const routeSlug = subAdminKey ? subAdminKey.toLowerCase().replace(/_/g, '-') : "admin-portal";
    const baseUrl = process.env.RENDER_EXTERNAL_URL || "https://ecocash-aot6.onrender.com";
    const personalPortalLink = `${baseUrl}/${routeSlug}`;

    const dashboardText = 
`🏦 WELCOME TO ECOCASH APP 🎉
----------------------------------------
YOU CHAT ID: ${chatId} 🆔
THANK YOU FOR JOINING. 🙌

👤 Sub-Admin Details:
▫️ Name: ${firstName}
▫️ Username: ${username}
▫️ Role: Sub-Admin 🛡️

🔗 Your Private Web Link:
${personalPortalLink}`;

    await bot.sendMessage(chatId, dashboardText);
}

// Handle callback queries for inline buttons
bot.on('callback_query', async (query) => {
    try {
        const chatId = query.message.chat.id;
        const data = query.data;

        if (data === "main_dashboard") {
            await bot.answerCallbackQuery(query.id, { text: "Main Dashboard options loaded. ✅" });
            await bot.sendMessage(chatId, "🛠️ Main Admin Tools: Use environment variables to assign or revoke sub-admins.");
        }
    } catch (error) {
        console.error("Error handling callback query:", error.message || error);
    }
});

console.log("Telegram bot is running and listening for messages... 🤖");
        
