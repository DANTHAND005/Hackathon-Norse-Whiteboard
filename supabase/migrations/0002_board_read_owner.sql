-- INSERT ... RETURNING re-checks the select policy, but can_read_board() (stable) can't see the
-- row being inserted in the same statement. Check ownership directly so creating a board works.
drop policy "read boards" on public.boards;
create policy "read boards" on public.boards for select to authenticated
  using (owner = auth.uid() or public.can_read_board(id));
