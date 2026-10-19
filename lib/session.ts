import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/** Treat a revoked or unverified account as signed out in server code. */
export async function getAuthSession() {
  const session = await getServerSession(authOptions);
  if (!session || session.accountBlocked) return null;
  return session;
}
