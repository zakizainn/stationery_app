import { createHash, randomBytes } from "node:crypto";
import nodemailer from "nodemailer";
import { db } from "@/lib/db";

export const genericAuthMessage = "Jika data cocok dengan akun aktif, instruksi akan dikirim ke email kerja yang terdaftar.";
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function limitAuthRequest(key: string, max = 5) {
  const since = new Date(Date.now() - 15 * 60 * 1000);
  const count = await db.authAttempt.count({ where: { key, createdAt: { gte: since } } });
  if (count >= max) return false;
  await db.authAttempt.create({ data: { key } });
  return true;
}

export async function createAuthToken(userId: number, purpose: "verify" | "reset") {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + (purpose === "verify" ? 24 : 1) * 60 * 60 * 1000);
  await db.authToken.updateMany({ where: { userId, purpose, usedAt: null }, data: { usedAt: new Date() } });
  await db.authToken.create({ data: { userId, purpose, tokenHash: hashToken(token), expiresAt } });
  return token;
}

export async function sendAccountEmail(email: string, subject: string, content: string) {
  const { GMAIL_USER, GMAIL_APP_PASSWORD } = process.env;
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) throw new Error("Gmail SMTP is not configured");
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });
  await transporter.sendMail({
    from: `Stationery App <${GMAIL_USER}>`,
    to: email,
    subject,
    text: `${content}\n\nJika Anda tidak meminta ini, abaikan email ini.`,
  });
}

export function requestOrigin(request: Request) {
  const configured = process.env.APP_URL;
  if (configured) {
    const url = new URL(configured);
    if (process.env.NODE_ENV === "production" && url.protocol !== "https:") throw new Error("APP_URL must use HTTPS in production");
    return url.origin;
  }
  if (process.env.NODE_ENV === "production") throw new Error("APP_URL is required in production");
  const url = new URL(request.url);
  return url.origin;
}
