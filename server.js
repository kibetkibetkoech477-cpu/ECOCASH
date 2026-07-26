// server.js - Complete Multi-Admin EcoCash Loan Bot Implementation
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

const token = process.env.TELEGRAM_BOT_TOKEN;
const app = express();
const port = process.env.PORT || 3000;

// Initialize bot using polling or webhooks (using polling here for simplicity)
const bot = new TelegramBot(token, { polling: true });

app.use(express.json());

app.get('/', (req, res) => {
    res.send('EcoCash Loan Bot is running!');
});

app.listen(port, () => {
    console.log(`Server is listening on port ${port}`);
});

// In-memory user tracking (Note: Consider a database for persistent storage on Render)
const registeredUsers = {}; 

// Helper function to extract all admin IDs dynamically from environment variables
function getAdmins() {
    const admins = {
        mainAdmin: process.env.ADMIN_1_CHAT_ID || null,
        subAdmins: []
    };

    let i = 2;
    while (process.env[`ADMIN_${i}_CHAT_ID`]) {
        admins.subAdmins.push({
            id: process.env[`ADMIN_${i}_CHAT_ID`],
            key: `ADMIN_${i}_CHAT_ID`,
            name: `Admin-00${i}`
        });
        i++;
    }
    return admins;
}

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id.toString();
    const username = msg.from.username ? `@${msg.from.username}` : 'No username';
    const firstName = msg.from.first_name || 'User';

    const admins = getAdmins();

    // 1. Check if user is the Main Admin
    if (chatId === admins.mainAdmin) {
        let subAdminText = "";
        const inlineKeyboard = [];

        if (admins.subAdmins.length === 0) {
            subAdminText = "\n\n*No sub-admins currently configured via environment variables.*";
        } else {
            subAdminText = "\n\n*Configured Sub-Admins:*";
            admins.subAdmins.forEach((sub) => {
                // Default status to UNPAID if not tracked yet
                if (!registeredUsers[sub.id]) {
                    registeredUsers[sub.id] = { status: 'UNPAID', name: sub.name, username: sub.id };
                }

                const currentState = registeredUsers[sub.id].status;
                subAdminText += `\n• ${sub.name} (${sub.id}) - Status: *${currentState}*`;

                // Toggle buttons for Main Admin approval
                inlineKeyboard.push([
                    { text: `Approve ${sub.name} (PAID)`, callback_data: `set_paid_${sub.id}` },
                    { text: `Revoke (UNPAID)`, callback_data: `set_unpaid_${sub.id}` }
                ]);
            });
        }

        const mainDashboardMessage = `
 🚡 **ECOCASH ADMIN BOT ACTIVATED**
--------------------------------------------------
👤 **User Info:**
• **Name:** ${firstName}
• **Username:** ${username}
• **Chat ID:** ${chatId}
• **Role:** Main Admin

👑 **MAIN ADMIN CONTROL PANEL**
*Approve payment status to authorize sub-admins (Admin-002, Admin-003 onwards):*
${subAdminText}
        `.trim();

        await bot.sendMessage(chatId, mainDashboardMessage, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: inlineKeyboard.length > 0 ? inlineKeyboard : [
                    [{ text: "🌐 Open Main Dashboard", url: process.env.WEB_URL || "https://render.com" }]
                ]
            }
        });
        return;
    }

    // 2. Check if user is a Sub-Admin
    const matchedSubAdmin = admins.subAdmins.find(sub => sub.id === chatId);
    if (matchedSubAdmin) {
        if (!registeredUsers[chatId]) {
            registeredUsers[chatId] = { status: 'UNPAID', name: matchedSubAdmin.name, username };
            
            // Notify Main Admin about new sub-admin registration attempt
            if (admins.mainAdmin) {
                bot.sendMessage(admins.mainAdmin, `🔔 **New Sub-Admin Activity**\n${matchedSubAdmin.name} (${chatId}) has started the bot and is currently *UNPAID*.`, { parse_mode: 'Markdown' });
            }
        }

        const userStatus = registeredUsers[chatId].status;

        if (userStatus === 'PAID') {
            await bot.sendMessage(chatId, `✅ **Access Approved!**\nWelcome ${firstName}. Your sub-admin status is active.\n\n🔗 **Website Link:** ${process.env.LOAN_PORTAL_URL || 'https://your-loan-portal.com'}`, { parse_mode: 'Markdown' });
        } else {
            await bot.sendMessage(chatId, `⏳ **Approval Pending**\nHello ${firstName}, you are registered as a sub-admin, but your account status is currently *UNPAID*. Please wait for the Main Admin to approve your access.`, { parse_mode: 'Markdown' });
        }
        return;
    }

    // 3. Regular User Fallback
    await bot.sendMessage(chatId, `Welcome to EcoCash Loan Service, ${firstName}. Please contact an administrator for access.`, { parse_mode: 'Markdown' });
});

// Handle inline button clicks for Main Admin approval actions
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id.toString();
    const data = query.data;
    const admins = getAdmins();

    if (chatId !== admins.mainAdmin) {
        return bot.answerCallbackQuery(query.id, { text: "Unauthorized action.", show_alert: true });
    }

    if (data.startsWith('set_paid_') || data.startsWith('set_unpaid_')) {
        const action = data.startsWith('set_paid_') ? 'PAID' : 'UNPAID';
        const targetId = data.replace('set_paid_', '').replace('set_unpaid_', '');

        if (!registeredUsers[targetId]) {
            registeredUsers[targetId] = { status: action };
        } else {
            registeredUsers[targetId].status = action;
        }

        await bot.answerCallbackQuery(query.id, { text: `Status updated to ${action}!` });

        // Notify the sub-admin of their new approval state
        if (action === 'PAID') {
            bot.sendMessage(targetId, `🎉 **Good News!** Your sub-admin account has been approved as **PAID**.\n\n🔗 **Access Link:** ${process.env.LOAN_PORTAL_URL || 'https://your-loan-portal.com'}`, { parse_mode: 'Markdown' });
        } else {
            bot.sendMessage(targetId, `⚠️ Your status has been changed to **UNPAID** by the Main Admin.`, { parse_mode: 'Markdown' });
        }

        // Refresh the Main Admin control panel message view
        bot.editMessageText(`Status for ${targetId} successfully updated to *${action}*. Run /start to view updated dashboard.`, {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: 'Markdown'
        });
    }
});
                                     
