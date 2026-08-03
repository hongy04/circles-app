-- Phase: Decoration v2.1 — generalized decoration objects (built-in, image, emoji, text, future Apple glyph)
-- Keeps the existing private JSONB layout columns and upgrades validation in place.

create or replace function public.decoration_sticker_state_is_valid(
  p_stickers jsonb,
  p_assets jsonb
)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  sticker_row jsonb;
  asset_row jsonb;
  asset_ids text[] := array[]::text[];
  seen_ids text[] := array[]::text[];
  decoration_id text;
  decoration_kind text;
  legacy_sticker text;
  asset_id text;
  content_value text;
  text_style_value text;
  color_value text;
begin
  if p_stickers is null or jsonb_typeof(p_stickers) <> 'array' then
    return false;
  end if;
  if p_assets is null or jsonb_typeof(p_assets) <> 'array' then
    return false;
  end if;
  if jsonb_array_length(p_stickers) > 18 then
    return false;
  end if;

  for asset_row in select value from jsonb_array_elements(p_assets)
  loop
    asset_ids := array_append(asset_ids, asset_row->>'id');
  end loop;

  for sticker_row in select value from jsonb_array_elements(p_stickers)
  loop
    if jsonb_typeof(sticker_row) <> 'object' then
      return false;
    end if;

    decoration_id := nullif(btrim(sticker_row->>'id'), '');
    if decoration_id is null or length(decoration_id) > 80 or decoration_id = any(seen_ids) then
      return false;
    end if;
    seen_ids := array_append(seen_ids, decoration_id);

    -- Backward compatibility for layouts created by migrations 074/075.
    decoration_kind := nullif(btrim(sticker_row->>'kind'), '');
    legacy_sticker := nullif(btrim(sticker_row->>'sticker'), '');
    if decoration_kind is null then
      if legacy_sticker = 'custom' then
        decoration_kind := 'custom_image';
      elsif legacy_sticker is not null then
        decoration_kind := 'built_in';
      end if;
    end if;

    if decoration_kind = 'built_in' then
      if legacy_sticker not in (
        'aero-bubbles',
        'aero-flower',
        'aero-sun',
        'aero-cloud',
        'nature-leaf',
        'nature-drop',
        'nature-star',
        'night-moon',
        'cozy-heart',
        'cozy-music',
        'cozy-smile',
        'cozy-planet'
      ) then
        return false;
      end if;

    elsif decoration_kind in ('custom_image', 'apple_glyph') then
      asset_id := nullif(btrim(sticker_row->>'asset_id'), '');
      if asset_id is null or not (asset_id = any(asset_ids)) then
        return false;
      end if;

    elsif decoration_kind = 'emoji' then
      content_value := nullif(btrim(sticker_row->>'content'), '');
      if content_value is null or char_length(content_value) > 24 then
        return false;
      end if;

    elsif decoration_kind = 'text' then
      content_value := nullif(btrim(sticker_row->>'content'), '');
      text_style_value := coalesce(nullif(btrim(sticker_row->>'text_style'), ''), 'glass');
      color_value := upper(coalesce(nullif(btrim(sticker_row->>'color'), ''), '#0A1222'));

      if content_value is null or char_length(content_value) > 60 then
        return false;
      end if;
      if text_style_value not in ('glass', 'ink', 'soft') then
        return false;
      end if;
      if color_value !~ '^#[0-9A-F]{6}$' then
        return false;
      end if;

    else
      return false;
    end if;

    if jsonb_typeof(sticker_row->'x') <> 'number'
       or (sticker_row->>'x')::numeric not between 0.04 and 0.96 then
      return false;
    end if;
    if jsonb_typeof(sticker_row->'y') <> 'number'
       or (sticker_row->>'y')::numeric not between 0.04 and 0.96 then
      return false;
    end if;
    if jsonb_typeof(sticker_row->'scale') <> 'number'
       or (sticker_row->>'scale')::numeric not between 0.55 and 2.20 then
      return false;
    end if;
    if jsonb_typeof(sticker_row->'rotation') <> 'number'
       or (sticker_row->>'rotation')::numeric not between -180 and 180 then
      return false;
    end if;
    if jsonb_typeof(sticker_row->'z') <> 'number'
       or (sticker_row->>'z')::numeric not between 0 and 50 then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

revoke all on function public.decoration_sticker_state_is_valid(jsonb, jsonb) from public;

comment on function public.decoration_sticker_state_is_valid(jsonb, jsonb) is
  'Validates generalized private decoration layouts. Supports built_in, custom_image, emoji, text, and reserves apple_glyph for explicit future system-keyboard imports.';
