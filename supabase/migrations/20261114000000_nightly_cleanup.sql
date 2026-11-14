-- The cleanup goes back to once a night. What bounds abandoned uploads is the limit of five
-- in progress per account, not the schedule: an upload cut after its file was sent keeps its
-- place until the next run, and a reservation with no file is dropped at the next open.
select cron.schedule('dklothes-retention-cleanup', '17 3 * * *', $$select public.run_retention_cleanup();$$);
