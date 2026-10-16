-- OLI · visita diaria (Vercel Cron llama /api/despertar): una consulta real a la base para que el plan gratuito no pause el proyecto.
-- Lee una fila de oli_docs (actividad real de la base) pero solo devuelve la hora del servidor: no expone datos del negocio.
-- Idempotente.
create or replace function public.oli_ping() returns timestamptz language plpgsql stable security definer set search_path = public as
$$
begin
  perform 1 from oli_docs limit 1;
  return now();
end $$;
revoke execute on function public.oli_ping() from public;
grant execute on function public.oli_ping() to anon, authenticated;
