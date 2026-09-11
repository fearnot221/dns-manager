import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await auth();
  redirect(session?.user ? "/requests" : "/login");
}
