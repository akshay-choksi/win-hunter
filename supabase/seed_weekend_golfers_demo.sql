-- Demo seed: Weekend Golfers — 5 test members + Open lineups + season standings
-- Re-runnable (fixed UUIDs + ON CONFLICT)

DO $$
DECLARE
  v_league uuid := '24c208af-46b7-4792-ae66-4f4d02ac44fc';
  v_open uuid := '1b07ba5a-b618-43a8-965d-22540c5e4e70';
  v_akshay uuid := '9fd173e8-6ac3-455c-967b-6d9eeb9d8922';
  u1 uuid := 'a1111111-1111-4111-8111-111111111111';
  u2 uuid := 'a2222222-2222-4222-8222-222222222222';
  u3 uuid := 'a3333333-3333-4333-8333-333333333333';
  u4 uuid := 'a4444444-4444-4444-8444-444444444444';
  u5 uuid := 'a5555555-5555-4555-8555-555555555555';
  l1 uuid := 'b1111111-1111-4111-8111-111111111111';
  l2 uuid := 'b2222222-2222-4222-8222-222222222222';
  l3 uuid := 'b3333333-3333-4333-8333-333333333333';
  l4 uuid := 'b4444444-4444-4444-8444-444444444444';
  l5 uuid := 'b5555555-5555-4555-8555-555555555555';
  scheffler uuid := '756b9c4f-9dcc-403f-a377-ffc9356319d8';
  macintyre uuid := 'b1838e6e-e722-44f8-8020-95ec03eccae5';
  morikawa uuid := '64ea7baa-5929-4f3c-b97f-d85b1478522a';
  fleetwood uuid := 'ecdcef0c-e1d4-4ed8-b7ba-0b7f4d68a121';
  bryson uuid := 'd94b9fd4-caed-45cb-a911-544365251896';
  rahm uuid := 'd77c1bb3-3dff-4ba3-a2c3-83b5bd54cb8f';
  rory uuid := '6ed04cc2-610e-4229-99b0-082b62153db9';
  hatton uuid := '3db22c8c-59c6-498b-9dbe-cd19b1b60d82';
  lowry uuid := 'dde151b9-4d66-43e0-b95f-c6022dd26ac5';
  hovland uuid := '526f0247-1cfb-4e5c-a341-9eeb16cfd38d';
  xander uuid := 'd180d14f-205f-4db2-b887-38232e3da8aa';
  aberg uuid := 'bb9a0618-8f08-41ff-a7bc-40c4f4f04a41';
  henley uuid := '6e2713d2-d412-4517-be74-ea623b8b87d4';
  rose uuid := '17df0961-46e5-4edb-a947-b2b53fa15791';
  harman uuid := '05f62d53-7f24-40e7-8eb6-d2a0015d82e5';
  straka uuid := '4e1c4040-f364-4cb3-8208-ced75ec8e897';
  cantlay uuid := '5f6d06b1-c251-4859-8f2f-9e4d37af861e';
  jt uuid := 'a77c21b7-f31e-4a0b-9a02-35443f8ba36f';
  koepka uuid := '992279d5-bbe5-425a-8caa-3efaf462facc';
BEGIN
  -- Auth demo users
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    is_sso_user, is_anonymous
  ) VALUES
    ('00000000-0000-0000-0000-000000000000', u1, 'authenticated', 'authenticated',
     'jordan.lee@weekend-demo.test', crypt('DemoPass123!', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Jordan Lee"}'::jsonb,
     now(), now(), '', '', '', '', false, false),
    ('00000000-0000-0000-0000-000000000000', u2, 'authenticated', 'authenticated',
     'sam.rivera@weekend-demo.test', crypt('DemoPass123!', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Sam Rivera"}'::jsonb,
     now(), now(), '', '', '', '', false, false),
    ('00000000-0000-0000-0000-000000000000', u3, 'authenticated', 'authenticated',
     'casey.nguyen@weekend-demo.test', crypt('DemoPass123!', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Casey Nguyen"}'::jsonb,
     now(), now(), '', '', '', '', false, false),
    ('00000000-0000-0000-0000-000000000000', u4, 'authenticated', 'authenticated',
     'morgan.patel@weekend-demo.test', crypt('DemoPass123!', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Morgan Patel"}'::jsonb,
     now(), now(), '', '', '', '', false, false),
    ('00000000-0000-0000-0000-000000000000', u5, 'authenticated', 'authenticated',
     'riley.brooks@weekend-demo.test', crypt('DemoPass123!', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Riley Brooks"}'::jsonb,
     now(), now(), '', '', '', '', false, false)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    raw_user_meta_data = EXCLUDED.raw_user_meta_data;

  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  ) VALUES
    (u1, u1, jsonb_build_object('sub', u1::text, 'email', 'jordan.lee@weekend-demo.test'), 'email', u1::text, now(), now(), now()),
    (u2, u2, jsonb_build_object('sub', u2::text, 'email', 'sam.rivera@weekend-demo.test'), 'email', u2::text, now(), now(), now()),
    (u3, u3, jsonb_build_object('sub', u3::text, 'email', 'casey.nguyen@weekend-demo.test'), 'email', u3::text, now(), now(), now()),
    (u4, u4, jsonb_build_object('sub', u4::text, 'email', 'morgan.patel@weekend-demo.test'), 'email', u4::text, now(), now(), now()),
    (u5, u5, jsonb_build_object('sub', u5::text, 'email', 'riley.brooks@weekend-demo.test'), 'email', u5::text, now(), now(), now())
  ON CONFLICT DO NOTHING;

  INSERT INTO public.profiles (id, full_name) VALUES
    (u1, 'Jordan Lee'),
    (u2, 'Sam Rivera'),
    (u3, 'Casey Nguyen'),
    (u4, 'Morgan Patel'),
    (u5, 'Riley Brooks')
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

  INSERT INTO public.league_members (league_id, user_id) VALUES
    (v_league, u1), (v_league, u2), (v_league, u3), (v_league, u4), (v_league, u5)
  ON CONFLICT DO NOTHING;

  UPDATE public.tournaments
  SET status = 'open', lineup_lock_at = now() + interval '2 days'
  WHERE id = v_open;

  -- Live-ish fantasy points for Open golfers
  INSERT INTO public.player_results (
    tournament_id, golfer_id, position, made_cut, total_to_par, birdies, eagles, fantasy_points, status
  ) VALUES
    (v_open, scheffler, 1, true, -12, 18, 2, 98.0, 'active'),
    (v_open, fleetwood, 2, true, -9, 14, 1, 72.0, 'active'),
    (v_open, macintyre, 3, true, -8, 13, 1, 64.0, 'active'),
    (v_open, rory, 4, true, -7, 12, 0, 55.0, 'active'),
    (v_open, rahm, 5, true, -6, 11, 1, 52.0, 'active'),
    (v_open, morikawa, 7, true, -5, 10, 0, 42.0, 'active'),
    (v_open, lowry, 8, true, -4, 11, 0, 40.0, 'active'),
    (v_open, bryson, 10, true, -3, 9, 1, 38.0, 'active'),
    (v_open, hovland, 12, true, -2, 8, 0, 30.0, 'active'),
    (v_open, xander, 15, true, -1, 9, 0, 28.0, 'active'),
    (v_open, aberg, 18, true, 0, 7, 0, 24.0, 'active'),
    (v_open, hatton, 22, true, 1, 6, 0, 18.0, 'active'),
    (v_open, henley, 25, true, 2, 5, 0, 16.0, 'active'),
    (v_open, straka, 28, true, 3, 5, 0, 14.0, 'active'),
    (v_open, jt, 32, true, 3, 4, 0, 12.0, 'active'),
    (v_open, rose, 35, true, 4, 4, 0, 10.0, 'active'),
    (v_open, harman, 40, true, 5, 3, 0, 10.0, 'active'),
    (v_open, cantlay, null, false, 6, 3, 0, 0.0, 'CUT'),
    (v_open, koepka, null, false, 8, 2, 0, 0.0, 'CUT')
  ON CONFLICT (tournament_id, golfer_id) DO UPDATE SET
    position = EXCLUDED.position,
    made_cut = EXCLUDED.made_cut,
    total_to_par = EXCLUDED.total_to_par,
    birdies = EXCLUDED.birdies,
    eagles = EXCLUDED.eagles,
    fantasy_points = EXCLUDED.fantasy_points,
    status = EXCLUDED.status;

  -- Lineups (salaries under $50k)
  -- Jordan Lee: Scheffler stack value — 12500+8500+7800+7900+6700+6500 = 49900 → pts 98+40+16+24+10+10 = 198
  INSERT INTO public.lineups (id, league_id, user_id, tournament_id, total_spent, total_points)
  VALUES (l1, v_league, u1, v_open, 49900, 198)
  ON CONFLICT (league_id, user_id, tournament_id) DO UPDATE
    SET total_spent = 49900, total_points = 198, id = EXCLUDED.id;
  DELETE FROM public.lineup_entries WHERE lineup_id IN (SELECT id FROM public.lineups WHERE league_id = v_league AND user_id = u1 AND tournament_id = v_open);
  INSERT INTO public.lineup_entries (lineup_id, golfer_id)
  SELECT id, g FROM public.lineups, (VALUES (scheffler),(lowry),(henley),(aberg),(rose),(harman)) v(g)
  WHERE league_id = v_league AND user_id = u1 AND tournament_id = v_open;

  -- Sam Rivera: 9900+9900+8500+8500+6700+6500 = 50000 → 72+42+40+30+10+10 = 204
  INSERT INTO public.lineups (id, league_id, user_id, tournament_id, total_spent, total_points)
  VALUES (l2, v_league, u2, v_open, 50000, 204)
  ON CONFLICT (league_id, user_id, tournament_id) DO UPDATE
    SET total_spent = 50000, total_points = 204, id = EXCLUDED.id;
  DELETE FROM public.lineup_entries WHERE lineup_id IN (SELECT id FROM public.lineups WHERE league_id = v_league AND user_id = u2 AND tournament_id = v_open);
  INSERT INTO public.lineup_entries (lineup_id, golfer_id)
  SELECT id, g FROM public.lineups, (VALUES (fleetwood),(morikawa),(lowry),(hovland),(rose),(harman)) v(g)
  WHERE league_id = v_league AND user_id = u2 AND tournament_id = v_open;

  -- Casey Nguyen: 9900+9500+8700+7900+6700+6500 = 49200 → 38+52+18+24+10+10 = 152
  INSERT INTO public.lineups (id, league_id, user_id, tournament_id, total_spent, total_points)
  VALUES (l3, v_league, u3, v_open, 49200, 152)
  ON CONFLICT (league_id, user_id, tournament_id) DO UPDATE
    SET total_spent = 49200, total_points = 152, id = EXCLUDED.id;
  DELETE FROM public.lineup_entries WHERE lineup_id IN (SELECT id FROM public.lineups WHERE league_id = v_league AND user_id = u3 AND tournament_id = v_open);
  INSERT INTO public.lineup_entries (lineup_id, golfer_id)
  SELECT id, g FROM public.lineups, (VALUES (bryson),(rahm),(hatton),(aberg),(rose),(harman)) v(g)
  WHERE league_id = v_league AND user_id = u3 AND tournament_id = v_open;

  -- Morgan Patel: 10100+9900+8500+8000+6700+6500 = 49700 → 64+72+40+14+10+10 = 210
  INSERT INTO public.lineups (id, league_id, user_id, tournament_id, total_spent, total_points)
  VALUES (l4, v_league, u4, v_open, 49700, 210)
  ON CONFLICT (league_id, user_id, tournament_id) DO UPDATE
    SET total_spent = 49700, total_points = 210, id = EXCLUDED.id;
  DELETE FROM public.lineup_entries WHERE lineup_id IN (SELECT id FROM public.lineups WHERE league_id = v_league AND user_id = u4 AND tournament_id = v_open);
  INSERT INTO public.lineup_entries (lineup_id, golfer_id)
  SELECT id, g FROM public.lineups, (VALUES (macintyre),(fleetwood),(lowry),(straka),(rose),(harman)) v(g)
  WHERE league_id = v_league AND user_id = u4 AND tournament_id = v_open;

  -- Riley Brooks: 9100+8500+8100+7900+7800+7800 = 49200 → 55+30+28+24+12+16 = 165
  INSERT INTO public.lineups (id, league_id, user_id, tournament_id, total_spent, total_points)
  VALUES (l5, v_league, u5, v_open, 49200, 165)
  ON CONFLICT (league_id, user_id, tournament_id) DO UPDATE
    SET total_spent = 49200, total_points = 165, id = EXCLUDED.id;
  DELETE FROM public.lineup_entries WHERE lineup_id IN (SELECT id FROM public.lineups WHERE league_id = v_league AND user_id = u5 AND tournament_id = v_open);
  INSERT INTO public.lineup_entries (lineup_id, golfer_id)
  SELECT id, g FROM public.lineups, (VALUES (rory),(hovland),(xander),(aberg),(jt),(henley)) v(g)
  WHERE league_id = v_league AND user_id = u5 AND tournament_id = v_open;

  -- Bump Akshay's existing Open lineup fantasy total for the board
  UPDATE public.lineups
  SET total_points = 118
  WHERE league_id = v_league AND user_id = v_akshay AND tournament_id = v_open;

  -- Season standings (mid-season totals after ~8 events; majors/signatures already baked in)
  INSERT INTO public.season_standings (league_id, user_id, season_year, fedex_points, events_played)
  VALUES
    (v_league, u4, 2026, 2680, 8),       -- Morgan leading
    (v_league, u2, 2026, 2410, 8),       -- Sam
    (v_league, u1, 2026, 2250, 8),       -- Jordan
    (v_league, v_akshay, 2026, 1985, 7), -- you
    (v_league, u5, 2026, 1640, 8),       -- Riley
    (v_league, u3, 2026, 1425, 7)        -- Casey
  ON CONFLICT (league_id, user_id, season_year) DO UPDATE SET
    fedex_points = EXCLUDED.fedex_points,
    events_played = EXCLUDED.events_played;
END $$;

-- Summary
SELECT p.full_name, l.total_points AS open_fantasy_pts, l.total_spent
FROM public.lineups l
JOIN public.profiles p ON p.id = l.user_id
WHERE l.league_id = '24c208af-46b7-4792-ae66-4f4d02ac44fc'
  AND l.tournament_id = '1b07ba5a-b618-43a8-965d-22540c5e4e70'
ORDER BY l.total_points DESC;

SELECT p.full_name, ss.fedex_points AS season_pts, ss.events_played
FROM public.season_standings ss
JOIN public.profiles p ON p.id = ss.user_id
WHERE ss.league_id = '24c208af-46b7-4792-ae66-4f4d02ac44fc' AND ss.season_year = 2026
ORDER BY ss.fedex_points DESC;
