import { notFound } from "next/navigation";

import { requireSession } from "@/shared/auth/session";
import { createSupabaseServerClient } from "@/shared/supabase/server";

export default async function StudentPage({ params }: { params: Promise<{ studentId: string }> }) {
  await requireSession();
  const { studentId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: student, error } = await supabase.from("students").select("id, display_name").eq("id", studentId).maybeSingle();
  if (error || !student) notFound();

  const { data: enrollments } = await supabase.from("enrollments").select("id, status, school_year").eq("student_id", student.id);
  return <main><h1>{student.display_name}</h1><p>{enrollments?.length ?? 0} accessible enrollment(s).</p></main>;
}
