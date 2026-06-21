import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminPanel from "./AdminPanel";

export default async function AdminPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Check admin role from user metadata
  const isAdmin =
    user.user_metadata?.role === "admin" ||
    user.app_metadata?.role === "admin";

  if (!isAdmin) redirect("/pass");

  const [{ data: members }, { data: approvedPhones }] = await Promise.all([
    supabase.from("members").select("*").order("created_at", { ascending: false }),
    supabase.from("approved_phones").select("*").order("created_at", { ascending: false }),
  ]);

  return <AdminPanel members={members ?? []} approvedPhones={approvedPhones ?? []} />;
}
