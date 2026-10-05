-- OLI · Storage: imágenes de producto, soportes (facturas, comprobantes) e informes exportados.
-- Convención de rutas: {org_id}/...  (la primera carpeta es la organización; así se aísla cada negocio).
do $$ begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public) values ('product-images', 'product-images', false), ('supports', 'supports', false), ('exports', 'exports', false) on conflict (id) do nothing;

    -- imágenes de producto: cualquier miembro las ve; solo administración las sube
    create policy oli_img_read on storage.objects for select to authenticated using (bucket_id = 'product-images' and oli.is_member(((storage.foldername(name))[1])::uuid));
    create policy oli_img_write on storage.objects for insert to authenticated with check (bucket_id = 'product-images' and oli.is_admin(((storage.foldername(name))[1])::uuid));
    create policy oli_img_update on storage.objects for update to authenticated using (bucket_id = 'product-images' and oli.is_admin(((storage.foldername(name))[1])::uuid));
    create policy oli_img_delete on storage.objects for delete to authenticated using (bucket_id = 'product-images' and oli.is_admin(((storage.foldername(name))[1])::uuid));

    -- soportes e informes: solo administración (contienen información financiera y de terceros)
    create policy oli_sup_all on storage.objects for all to authenticated using (bucket_id in ('supports', 'exports') and oli.is_admin(((storage.foldername(name))[1])::uuid)) with check (bucket_id in ('supports', 'exports') and oli.is_admin(((storage.foldername(name))[1])::uuid));
  end if;
end $$;
