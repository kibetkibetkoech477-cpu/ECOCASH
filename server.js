require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

/**
 * EcoCash Telegram Bot Service with Role-Based Access Control (RBAC)
 * Maintained for Production Deployment on Render
 */

// --- 1. Express Server Setup (Required for Render Web Service Uptime & Custom Routing) ---
const app = express();
const PORT = process.env.PORT || 3000;

// Health check endpoint for Render container uptime
app.get('/', (req, res) => {
    res.status(200).send('EcoCash Telegram Bot is running live!');
});

// Dynamic route handlers for Sub-Admin portals matching real-life route parameters
app.get('/:adminRoute', (req, res) => {
    const adminRoute = req.params.adminRoute;
    const subAdminKeys = getSubAdminKeys();
    
    // Check if the requested route corresponds to a configured sub-admin environment variable
    const matchingKey = subAdminKeys.find(key => {
        // e.g., converts ADMIN_2_CHAT_ID or a custom route key into a URL-friendly slug
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
                        <p><strong>Status:</strong> <span style="color: green; font-weight: bold;">Authorized & Active</span></p>
                        <p>Welcome to your secured management gateway. You have live authorization to handle client verification requests.</p>
                    </div>
                </body>
            </html>
        `);
    } else {
        res.status(404).send('404 - Portal Not Found or Unauthorized Access.');
    }
});

app.listen(PORT, () => {
    console.log(`[Server] Express listening on port ${PORT}`);
});

// --- 2. Environment Validation & Bot Initialization ---
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
    console.error("[Fatal Error] TELEGRAM_BOT_TOKEN is missing in environment variables.");
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

// Global error listeners to prevent silent crashes or unhandled rejections
bot.on('polling_error', (error) => {
    console.error("[Telegram Polling Error]:", error.message || error);
});

bot.on('error', (error) => {
    console.error("[Telegram General Error]:", error.message || error);
});

// --- 3. RBAC Helper Functions ---
function getSubAdminKeys() {
    return Object.keys(process.env).filter(key => key.startsWith('ADMIN_') && key !== 'ADMIN_1_CHAT_ID');
}

function checkIfSubAdmin(chatIdString) {
    const subAdminKeys = getSubAdminKeys();
    return subAdminKeys.some(key => process.env[key] === chatIdString);
}

// Helper to look up the specific config key for a given sub-admin chat ID
function getSubAdminKeyByChatId(chatIdString) {
    const subAdminKeys = getSubAdminKeys();
    return subAdminKeys.find(key => process.env[key] === chatIdString);
}

// --- 4. Command Handlers ---
bot.onText(/\/start/, async (msg) => {
    try {
        const chatId = msg.chat.id;
        const chatIdStr = chatId.toString();
        const firstName = msg.from.first_name || "User";
        const username = msg.from.username ? `@${msg.from.username}` : "No username";

        // Role 1: Main Admin
        if (chatIdStr === process.env.ADMIN_1_CHAT_ID) {
            return await sendMainAdminDashboard(chatId, firstName, username);
        }

        // Role 2: Sub-Admin
        if (checkIfSubAdmin(chatIdStr)) {
            return await sendSubAdminDashboard(chatId, firstName, username, chatIdStr);
        }

        // Role 3: Regular User (Plain text format to prevent Markdown entity parsing errors)
        const welcomeMessage = 
`ECOCASH LOAN SERVICE
----------------------------------------
Welcome, ${firstName}!

* Chat ID: ${chatId}
* Username: ${username}

Please contact an administrator for access or account approval.`;

        await bot.sendMessage(chatId, welcomeMessage);
    } catch (error) {
        console.error("[Error] Handling /start command:", error.message || error);
    }
});

// --- 5. Dashboard View Renderers ---
async function sendMainAdminDashboard(chatId, firstName, username) {
    const dashboardText = 
`ECOCASH ADMIN BOT ACTIVATED
----------------------------------------
User Info:
• Name: ${firstName}
• Username: ${username}
• Chat ID: ${chatId}
• Role: Main Admin

MAIN ADMIN CONTROL PANEL
Tap the button below once payment is completed to generate and dispatch your secure link with details.`;

    const options = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "Paid", callback_data: "action_paid" }]
            ]
        }
    };

    await bot.sendMessage(chatId, dashboardText, options);
}

async function sendSubAdminDashboard(chatId, firstName, username, chatIdStr) {
    const subAdminKey = getSubAdminKeyByChatId(chatIdStr);
    const routeSlug = subAdminKey ? subAdminKey.toLowerCase().replace(/_/g, '-') : "admin-portal";
    const baseUrl = process.env.RENDER_EXTERNAL_URL || "https://ecocash-aot6.onrender.com";
    const personalPortalLink = `${baseUrl}/${routeSlug}`;

    const dashboardText = 
`ECOCASH SUB-ADMIN PORTAL
----------------------------------------
User Info:
• Name: ${firstName}
• Username: ${username}
• Chat ID: ${chatId}
• Role: Sub-Admin

Your Dedicated Portal Link:
${personalPortalLink}

You have authorization to manage client requests.`;

    await bot.sendMessage(chatId, dashboardText);
}

// --- 6. Interactive Callback Query Handlers ---
bot.on('callback_query', async (query) => {
    try {
        const chatId = query.message.chat.id;
        const data = query.data;

        if (data === "action_paid") {
            // Acknowledge the button press to remove the loading spinner on the button
            await bot.answerCallbackQuery(query.id, { text: "Payment confirmed!" });

            // Automatically generate the real-life dynamic link carrying its details and sub-admin structure
            const baseUrl = process.env.RENDER_EXTERNAL_URL || "https://ecocash-aot6.onrender.com";
            const subAdminKeys = getSubAdminKeys();
            
            let linksOutput = "";
            if (subAdminKeys.length === 0) {
                linksOutput = `${baseUrl}/admin-main?admin=${chatId}&status=verified`;
            } else {
                linksOutput = subAdminKeys.map(key => {
                    const slug = key.toLowerCase().replace(/_/g, '-');
                    return `• ${key}: ${baseUrl}/${slug}?chat_id=${process.env[key]}`;
                }).join('\n');
            }

            const detailsMessage = 
`PAYMENT PROCESSED SUCCESSFULLY
----------------------------------------
• Status: Approved & Paid
• Main Admin Chat ID: ${chatId}
• Timestamp: ${new Date().toISOString()}

Generated Live Sub-Admin Portals:
${linksOutput}`;

            await bot.sendMessage(chatId, detailsMessage);
        }
    } catch (error) {
        console.error("[Error] Handling callback query:", error.message || error);
    }
});

console.log("[Bot Status] Telegram bot is fully initialized and listening for messages...");
            
