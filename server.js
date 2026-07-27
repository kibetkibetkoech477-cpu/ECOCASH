require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

// --- 1. Express Server Setup (Required for Render Web Service Uptime & Sub-Admin Loan Portals) ---
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// In-memory storage for submitted EcoCash loan applications
const loanApplications = [];

app.get('/', (req, res) => {
    res.status(200).send('EcoCash Zimbabwe Telegram Bot & Loan Portal is running live! 🟢🇿🇼');
});

// Dynamic route mapping for Sub-Admin web panels & Loan Application Forms (e.g., /admin-002)
app.get('/:adminRoute', (req, res) => {
    try {
        const adminRoute = req.params.adminRoute;
        const subAdminKeys = getSubAdminKeys();
        
        const matchingKey = subAdminKeys.find(key => {
            const formattedSlug = key.toLowerCase().replace(/_/g, '-');
            return formattedSlug === adminRoute.toLowerCase() || key.toLowerCase() === adminRoute.toLowerCase();
        });

        if (matchingKey || adminRoute.toLowerCase().startsWith('admin-')) {
            const assignedChatId = matchingKey ? process.env[matchingKey] : "Dynamic Sub-Admin";
            
            // Render the Sub-Admin Portal with the Zimbabwe EcoCash Loan Form and Submissions List
            res.status(200).send(`
                <html>
                    <head>
                        <title>EcoCash Zimbabwe Sub-Admin Portal - ${adminRoute}</title>
                        <style>
                            body { font-family: Arial, sans-serif; padding: 30px; background: #f4f6f9; color: #333; }
                            .container { max-width: 700px; margin: auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
                            h2 { color: #d32f2f; margin-top: 0; }
                            .badge { color: green; font-weight: bold; }
                            .form-group { margin-bottom: 15px; }
                            label { display: block; margin-bottom: 5px; font-weight: bold; }
                            input, select, textarea { width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
                            button { background: #d32f2f; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; }
                            button:hover { background: #b71c1c; }
                            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 14px; }
                            th { background-color: #f2f2f2; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <h2>📱 EcoCash Zimbabwe Sub-Admin Portal 🇿🇼</h2>
                            <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                            <p><strong>Portal Route:</strong> /${adminRoute}</p>
                            <p><strong>Associated Chat ID:</strong> ${assignedChatId}</p>
                            <p><strong>Status:</strong> <span class="badge">Authorized & Active ✅</span></p>
                            
                            <h3 style="margin-top: 30px;">📝 Submit EcoCash Loan Application (USD / ZiG)</h3>
                            <form action="/submit-loan/${adminRoute}" method="POST">
                                <div class="form-group">
                                    <label for="clientName">Full Name:</label>
                                    <input type="text" id="clientName" name="clientName" required placeholder="Enter client full name">
                                </div>
                                <div class="form-group">
                                    <label for="phoneNumber">EcoCash Mobile Number (+263):</label>
                                    <input type="text" id="phoneNumber" name="phoneNumber" required placeholder="e.g., +263771234567">
                                </div>
                                <div class="form-group">
                                    <label for="nationalId">Zimbabwe National ID Number:</label>
                                    <input type="text" id="nationalId" name="nationalId" required placeholder="e.g., 63-1234567-A-89">
                                </div>
                                <div class="form-group">
                                    <label for="currency">Loan Currency:</label>
                                    <select id="currency" name="currency" required>
                                        <option value="USD">USD ($)</option>
                                        <option value="ZiG">ZiG</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label for="loanAmount">Loan Amount Requested:</label>
                                    <input type="number" id="loanAmount" name="loanAmount" required placeholder="Enter amount">
                                </div>
                                <div class="form-group">
                                    <label for="purpose">Loan Purpose:</label>
                                    <textarea id="purpose" name="purpose" rows="3" required placeholder="Reason for loan (e.g., Business capital, school fees)"></textarea>
                                </div>
                                <button type="submit">Submit Loan Application 🚀</button>
                            </form>

                            <h3 style="margin-top: 40px;">📋 Recent Submitted Loans on this Portal</h3>
                            <table>
                                <tr>
                                    <th>Name</th>
                                    <th>EcoCash Phone</th>
                                    <th>National ID</th>
                                    <th>Amount</th>
                                    <th>Purpose</th>
                                </tr>
                                ${loanApplications.length === 0 ? '<tr><td colspan="5" style="text-align:center;">No loan applications submitted yet. ℹ️</td></tr>' : 
                                    loanApplications.map(loan => `
                                        <tr>
                                            <td>${loan.clientName}</td>
                                            <td>${loan.phoneNumber}</td>
                                            <td>${loan.nationalId}</td>
                                            <td>${loan.loanAmount} ${loan.currency}</td>
                                            <td>${loan.purpose}</td>
                                        </tr>
                                    `).join('')}
                            </table>
                        </div>
                    </body>
                </html>
            `);
        } else {
            res.status(404).send('404 - Portal Not Found or Unauthorized Access. ❌');
        }
    } catch (routeError) {
        console.error("Express Route Error:", routeError);
        res.status(500).send('500 - Internal Server Error on Web Route. ❌');
    }
});

// Handle incoming loan form submissions from the web portal
app.post('/submit-loan/:adminRoute', (req, res) => {
    try {
        const { adminRoute } = req.params;
        const { clientName, phoneNumber, nationalId, currency, loanAmount, purpose } = req.body;

        // Store submission
        const newLoan = { clientName, phoneNumber, nationalId, currency, loanAmount, purpose, adminRoute, date: new Date().toLocaleString() };
        loanApplications.push(newLoan);

        // Redirect back to the admin portal confirmation view
        res.send(`
            <html>
                <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center; background: #f4f6f9;">
                    <div style="max-width: 500px; margin: auto; background: white; padding: 30px; border-radius: 8px; border: 1px solid #d32f2f; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                        <h2 style="color: #d32f2f;">🎉 EcoCash Loan Application Submitted! 🇿🇼</h2>
                        <p>Thank you, <strong>${clientName}</strong>. Your loan request for <strong>${loanAmount} ${currency}</strong> has been successfully logged.</p>
                        <a href="/${adminRoute}" style="display: inline-block; margin-top: 20px; background: #d32f2f; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Back to Portal ⬅️</a>
                    </div>
                </body>
            </html>
        `);
    } catch (err) {
        console.error("Error processing loan submission:", err);
        res.status(500).send('500 - Error processing loan submission.');
    }
});

const server = app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT} 🚀`);
});

server.on('error', (serverError) => {
    console.error("Express Server Error:", serverError);
});

// --- 2. Initialize Telegram Bot ---
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
    console.error("Error: TELEGRAM_BOT_TOKEN is missing in environment variables. ❌");
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

bot.on('polling_error', (error) => {
    console.error("Telegram Polling Error:", error.message || error);
});

bot.on('error', (error) => {
    console.error("Telegram General Error:", error.message || error);
});

// Helper functions for Sub-Admins
function getSubAdminKeys() {
    return Object.keys(process.env).filter(key => key.startsWith('ADMIN_') && key !== 'ADMIN_1_CHAT_ID');
}

function checkIfSubAdmin(chatIdString) {
    const subAdminKeys = getSubAdminKeys();
    return subAdminKeys.some(key => process.env[key] === chatIdString);
}

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

        // 2. Sub-Admin
        if (checkIfSubAdmin(chatIdStr)) {
            return await sendSubAdminDashboard(chatId, firstName, username, chatIdStr);
        }

        // 3. Regular User
        const welcomeMessage = 
`📱 ECOCASH ZIMBABWE LOAN SERVICE 🇿🇼💳
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
`📱 ECOCASH ZIMBABWE ADMIN BOT 🇿🇼⚙️
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

// Sub-Admin Dashboard Sender
async function sendSubAdminDashboard(chatId, firstName, username, chatIdStr) {
    const subAdminKey = getSubAdminKeyByChatId(chatIdStr);
    const routeSlug = subAdminKey ? subAdminKey.toLowerCase().replace(/_/g, '-') : "admin-portal";
    const baseUrl = process.env.RENDER_EXTERNAL_URL || "https://ecocash-aot6.onrender.com";
    const personalPortalLink = `${baseUrl}/${routeSlug}`;

    const dashboardText = 
`📱 WELCOME TO ECOCASH ZIMBABWE APP 🇿🇼🎉
----------------------------------------
YOU CHAT ID: ${chatId} 🆔
THANK YOU FOR JOINING. 🙌

👤 Sub-Admin Details:
▫️ Name: ${firstName}
▫️ Username: ${username}
▫️ Role: Sub-Admin 🛡️

🔗 Your Private Loan Portal Web Link:
${personalPortalLink}`;

    await bot.sendMessage(chatId, dashboardText);
}

// Handle callback queries
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

console.log("EcoCash Zimbabwe Telegram bot is running and listening for messages... 🤖🇿🇼");
                                                            
