import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_FROM_NUMBER;

const client = accountSid && authToken ? twilio(accountSid, authToken) : null;

if (!client || !fromNumber) {
  console.warn(
    "[sms] Twilio isn't configured (set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER) " +
      "— falling back to logging the message instead of sending a real SMS.",
  );
}

export async function sendOtpSms(
  phoneE164: string,
  code: string,
  brandName: string,
): Promise<void> {
  const body = `${code} is your ${brandName} sign-in code. It expires in 5 minutes.`;

  if (!client || !fromNumber) {
    console.log(`[sms] to=${phoneE164} from="${brandName} via GDH Appointments" body="${body}"`);
    return;
  }

  await client.messages.create({ to: phoneE164, from: fromNumber, body });
}
