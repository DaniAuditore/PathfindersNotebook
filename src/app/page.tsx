import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/shared/supabase/server";

export default async function HomePage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  redirect(data.user ? "/dashboard" : "/login");
}
