-- The v2 member operations reader must not depend on retired canonical-role
-- assignments. Keep club and unit visibility aligned with active v2 scope.

drop policy if exists "members read clubs" on public.clubs;
create policy "v2 actors read scoped clubs" on public.clubs for select using (
  public.actor_has_v2_club_governance(auth.uid(), id)
  or exists (
    select 1 from public.club_members member
    where member.club_id = id and member.user_id = auth.uid() and member.lifecycle = 'ACTIVE'
  )
);

drop policy if exists "members read scoped units" on public.units;
create policy "v2 actors read scoped units" on public.units for select using (
  public.actor_has_v2_club_governance(auth.uid(), club_id)
  or exists (
    select 1 from public.member_unit_assignments assignment
    join public.club_members member on member.id = assignment.member_id
    where assignment.unit_id = units.id and assignment.ended_at is null
      and member.user_id = auth.uid() and member.lifecycle = 'ACTIVE'
  )
);

grant select on table public.units to authenticated;
