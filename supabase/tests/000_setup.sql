-- Shared setup for pgTAP tests: a schema for test helpers. Runs first (alphabetical order).
begin;
create schema if not exists tests;
commit;
