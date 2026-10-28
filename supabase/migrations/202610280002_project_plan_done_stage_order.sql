  -- PREPARED, NOT APPLIED. Requires 202610280001_project_plans.sql.
  -- Normalize the designated Done stage on every plan insert or content update.
  create or replace function public.worksync_normalize_project_plan_columns()
  returns trigger language plpgsql set search_path = '' as $$
  declare
    source_columns jsonb;
    output_columns jsonb := '[]'::jsonb;
    item record;
    done_position bigint;
    done_stage jsonb;
  begin
    if jsonb_typeof(new.content) is distinct from 'object' then
      raise exception 'Project plan content must be an object';
    end if;
    source_columns := coalesce(new.content->'columns', '[]'::jsonb);
    if jsonb_typeof(source_columns) is distinct from 'array' then
      raise exception 'Project plan columns must be an array';
    end if;

    -- Prefer the explicit type marker. This keeps a renamed Done stage fixed.
    for item in
      select value, ordinality
      from jsonb_array_elements(source_columns) with ordinality
      order by ordinality
    loop
      if lower(coalesce(item.value->>'type', '')) = 'done' then
        done_position := item.ordinality;
      end if;
    end loop;

    -- Legacy plans had no type marker, so use the last stage named Done.
    if done_position is null then
      for item in
        select value, ordinality
        from jsonb_array_elements(source_columns) with ordinality
        order by ordinality
      loop
        if coalesce(item.value->>'type', '') = ''
          and lower(trim(coalesce(item.value->>'name', ''))) = 'done' then
          done_position := item.ordinality;
        end if;
      end loop;
    end if;

    if done_position is not null then
      for item in
        select value, ordinality
        from jsonb_array_elements(source_columns) with ordinality
        order by ordinality
      loop
        if item.ordinality = done_position then
          done_stage := jsonb_set(item.value, '{type}', '"done"'::jsonb, true);
        else
          output_columns := output_columns || jsonb_build_array(
            jsonb_set(item.value, '{type}', '"stage"'::jsonb, true)
          );
        end if;
      end loop;
    else
      for item in
        select value
        from jsonb_array_elements(source_columns) with ordinality
        order by ordinality
      loop
        output_columns := output_columns || jsonb_build_array(
          jsonb_set(item.value, '{type}', '"stage"'::jsonb, true)
        );
      end loop;

      -- Deleting Done through a stale or direct client write restores its previous
      -- content and tasks. New plans without Done receive an empty final stage.
      if tg_op = 'UPDATE' then
        done_position := null;
        for item in
          select value, ordinality
          from jsonb_array_elements(coalesce(old.content->'columns', '[]'::jsonb)) with ordinality
          order by ordinality
        loop
          if lower(coalesce(item.value->>'type', '')) = 'done' then
            done_position := item.ordinality;
          end if;
        end loop;
        if done_position is null then
          for item in
            select value, ordinality
            from jsonb_array_elements(coalesce(old.content->'columns', '[]'::jsonb)) with ordinality
            order by ordinality
          loop
            if coalesce(item.value->>'type', '') = ''
              and lower(trim(coalesce(item.value->>'name', ''))) = 'done' then
              done_position := item.ordinality;
            end if;
          end loop;
        end if;
        if done_position is not null then
          for item in
            select value, ordinality
            from jsonb_array_elements(coalesce(old.content->'columns', '[]'::jsonb)) with ordinality
            order by ordinality
          loop
            if item.ordinality = done_position then
              done_stage := jsonb_set(item.value, '{type}', '"done"'::jsonb, true);
            end if;
          end loop;
        end if;
      end if;
    end if;

    if done_stage is null then
      done_stage := jsonb_build_object(
        'id', gen_random_uuid()::text,
        'name', 'Done',
        'type', 'done',
        'tasks', '[]'::jsonb
      );
    end if;
    output_columns := output_columns || jsonb_build_array(done_stage);
    new.content := jsonb_set(new.content, '{columns}', output_columns, true);
    return new;
  end;
  $$;
  revoke all on function public.worksync_normalize_project_plan_columns() from public;
  drop trigger if exists project_plans_normalize_content on public.project_plans;
  create trigger project_plans_normalize_content
  before insert or update on public.project_plans
  for each row execute function public.worksync_normalize_project_plan_columns();
