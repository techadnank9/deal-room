import { redirect } from "next/navigation";
import Shell from "@/components/app/Shell";
import { currentSession } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export const metadata = { title: "Deal Room · Your AI sales agent" };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await currentSession();
  if (!s) redirect("/login?next=/app");
  return <Shell>{children}</Shell>;
}
