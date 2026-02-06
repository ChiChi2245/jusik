-- Sample institutions for MVP
insert into institutions (name, country_code, institution_type, source, external_id)
values
  ('National Pension Service', 'KR', 'pension', 'DART', null),
  ('Teachers Pension', 'KR', 'pension', 'DART', null),
  ('Government Employees Pension Service', 'KR', 'pension', 'DART', null),
  ('Military Pension', 'KR', 'pension', 'DART', null),
  ('Korea Post', 'KR', 'pension', 'DART', null),
  ('BlackRock', 'US', 'asset_manager', 'SEC_13F', null),
  ('The Vanguard Group', 'US', 'asset_manager', 'SEC_13F', null),
  ('State Street Global Advisors', 'US', 'asset_manager', 'SEC_13F', null),
  ('Fidelity Investments', 'US', 'asset_manager', 'SEC_13F', null),
  ('JPMorgan Asset Management', 'US', 'asset_manager', 'SEC_13F', null)
on conflict do nothing;

insert into institutions_aliases (institution_id, alias)
values
  ((select id from institutions where name = 'National Pension Service'), '국민연금공단'),
  ((select id from institutions where name = 'National Pension Service'), '국민연금'),
  ((select id from institutions where name = 'National Pension Service'), '국민연금기금운용본부'),
  ((select id from institutions where name = 'National Pension Service'), 'NPS'),
  ((select id from institutions where name = 'Teachers Pension'), '사학연금'),
  ((select id from institutions where name = 'Teachers Pension'), '사립학교교직원연금공단'),
  ((select id from institutions where name = 'Teachers Pension'), '사립학교교직원연금'),
  ((select id from institutions where name = 'Teachers Pension'), 'Teachers Pension Fund'),
  ((select id from institutions where name = 'Government Employees Pension Service'), '공무원연금'),
  ((select id from institutions where name = 'Government Employees Pension Service'), '공무원연금공단'),
  ((select id from institutions where name = 'Government Employees Pension Service'), 'GEPS'),
  ((select id from institutions where name = 'Military Pension'), '군인연금'),
  ((select id from institutions where name = 'Military Pension'), '군인연금관리공단'),
  ((select id from institutions where name = 'Korea Post'), '우정사업본부'),
  ((select id from institutions where name = 'Korea Post'), '우체국'),
  ((select id from institutions where name = 'BlackRock'), 'BlackRock, Inc.'),
  ((select id from institutions where name = 'BlackRock'), 'BlackRock Advisors'),
  ((select id from institutions where name = 'The Vanguard Group'), 'Vanguard'),
  ((select id from institutions where name = 'The Vanguard Group'), 'The Vanguard Group, Inc.'),
  ((select id from institutions where name = 'State Street Global Advisors'), 'State Street'),
  ((select id from institutions where name = 'State Street Global Advisors'), 'SSGA'),
  ((select id from institutions where name = 'Fidelity Investments'), 'Fidelity'),
  ((select id from institutions where name = 'JPMorgan Asset Management'), 'J.P. Morgan Asset Management'),
  ((select id from institutions where name = 'JPMorgan Asset Management'), 'JPMAM')
on conflict do nothing;
