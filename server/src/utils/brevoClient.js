const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

// Sends a transactional email via Brevo. Used for account-setup emails so
// delivery doesn't depend on Supabase's own (rate-limited, unbranded) email.
async function sendTransactionalEmail({ to, toName, subject, htmlContent }) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || "Royal Square Financial";

  if (!apiKey || !senderEmail) {
    throw new Error(
      "Brevo is not configured: set BREVO_API_KEY and BREVO_SENDER_EMAIL in server/.env"
    );
  }

  const response = await fetch(BREVO_API_URL, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: [{ email: to, name: toName }],
      subject,
      htmlContent,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Brevo request failed (${response.status}): ${body}`);
  }

  return response.json();
}

module.exports = { sendTransactionalEmail };
