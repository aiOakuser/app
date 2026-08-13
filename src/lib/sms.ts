// Stand-in for a real provider (Twilio/Vonage/MessageBird). Logs instead of
// sending so the reference flow runs without provider credentials.
export async function sendOtpSms(
  phoneE164: string,
  code: string,
  brandName: string,
): Promise<void> {
  console.log(
    `[sms] to=${phoneE164} from="${brandName} via GDH Appointments" body="${code} is your ${brandName} sign-in code. It expires in 5 minutes."`,
  );
}
