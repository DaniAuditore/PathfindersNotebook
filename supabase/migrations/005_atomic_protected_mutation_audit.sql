-- Protected writes remain available through their existing RLS/RPC boundaries,
-- but the audit invariant belongs in the same database transaction as the write.
-- An exception in this trigger rolls back the originating mutation.
create function public.audit_protected_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  mutation_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  previous_row jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  target_club_id uuid;
  target_entity_id uuid;
  audit_metadata jsonb := jsonb_build_object('operation', tg_op);
begin
  target_entity_id := nullif(mutation_row ->> 'id', '')::uuid;

  case tg_table_name
    when 'memberships', 'students', 'catalogs', 'enrollments', 'progress_reviews', 'evidence' then
      target_club_id := (mutation_row ->> 'club_id')::uuid;
    when 'catalog_versions' then
      select c.club_id into target_club_id
      from public.catalogs c where c.id = (mutation_row ->> 'catalog_id')::uuid;
    when 'requirements' then
      select c.club_id into target_club_id
      from public.catalog_versions cv join public.catalogs c on c.id = cv.catalog_id
      where cv.id = (mutation_row ->> 'catalog_version_id')::uuid;
    when 'requirement_progress' then
      select e.club_id into target_club_id
      from public.enrollments e where e.id = (mutation_row ->> 'enrollment_id')::uuid;
    when 'progress_attempts' then
      select e.club_id into target_club_id
      from public.requirement_progress p join public.enrollments e on e.id = p.enrollment_id
      where p.id = (mutation_row ->> 'progress_id')::uuid;
    when 'assessments', 'investitures' then
      select e.club_id into target_club_id
      from public.enrollments e where e.id = (mutation_row ->> 'enrollment_id')::uuid;
  end case;

  if target_club_id is null then
    raise exception 'protected mutation audit could not resolve club scope for %', tg_table_name;
  end if;

  if tg_table_name = 'requirement_progress' then
    audit_metadata := audit_metadata || jsonb_build_object(
      'prior_status', previous_row ->> 'status',
      'manual_rationale', mutation_row ->> 'manual_rationale'
    );
  end if;

  insert into public.audit_log (club_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    target_club_id,
    auth.uid(),
    'protected_mutation.' || lower(tg_op),
    tg_table_name,
    target_entity_id,
    audit_metadata
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger memberships_audit_protected_mutation after insert or update or delete on public.memberships
for each row execute function public.audit_protected_mutation();
create trigger students_audit_protected_mutation after insert or update or delete on public.students
for each row execute function public.audit_protected_mutation();
create trigger catalogs_audit_protected_mutation after insert or update or delete on public.catalogs
for each row execute function public.audit_protected_mutation();
create trigger catalog_versions_audit_protected_mutation after insert or update or delete on public.catalog_versions
for each row execute function public.audit_protected_mutation();
create trigger requirements_audit_protected_mutation after insert or update or delete on public.requirements
for each row execute function public.audit_protected_mutation();
create trigger enrollments_audit_protected_mutation after insert or update or delete on public.enrollments
for each row execute function public.audit_protected_mutation();
create trigger requirement_progress_audit_protected_mutation after insert or update or delete on public.requirement_progress
for each row execute function public.audit_protected_mutation();
create trigger progress_attempts_audit_protected_mutation after insert or update or delete on public.progress_attempts
for each row execute function public.audit_protected_mutation();
create trigger progress_reviews_audit_protected_mutation after insert or update or delete on public.progress_reviews
for each row execute function public.audit_protected_mutation();
create trigger assessments_audit_protected_mutation after insert or update or delete on public.assessments
for each row execute function public.audit_protected_mutation();
create trigger investitures_audit_protected_mutation after insert or update or delete on public.investitures
for each row execute function public.audit_protected_mutation();
create trigger evidence_audit_protected_mutation after insert or update or delete on public.evidence
for each row execute function public.audit_protected_mutation();
