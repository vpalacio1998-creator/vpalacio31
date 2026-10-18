-- OLI · estado de la cuenta de quien llama, para explicarle por qué ya no entra.
-- El administrador quita el acceso con la Edge Function invite-user (memberships.active = false y la cuenta bloqueada en Auth).
-- Desde ese momento oli_me devuelve null y el servidor no le muestra ni le acepta nada (RLS y oli_apply exigen active).
-- La app, al ver null, pregunta aquí si es una cuenta nueva (sin negocio) o una a la que le quitaron el acceso.
create or replace function oli_cuenta_estado() returns text language sql stable security definer set search_path = public as
$$ select case
     when auth.uid() is null then null
     when exists (select 1 from memberships m where m.user_id = auth.uid() and m.active) then 'activa'
     when exists (select 1 from memberships m where m.user_id = auth.uid()) then 'sin_acceso'
     else 'sin_negocio' end $$;
revoke all on function oli_cuenta_estado() from public, anon;
grant execute on function oli_cuenta_estado() to authenticated;
