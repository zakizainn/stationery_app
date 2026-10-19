import { getAuthSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { BERANDA_PER_ROLE } from "@/types";

export default async function RootPage() {
  const session = await getAuthSession();

  if (!session) {
    redirect("/login");
  }

  redirect(BERANDA_PER_ROLE[session.user.role]);
}
