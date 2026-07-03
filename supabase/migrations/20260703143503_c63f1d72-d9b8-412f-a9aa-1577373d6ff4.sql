create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('daily-ohlc-refresh') where exists (select 1 from cron.job where jobname='daily-ohlc-refresh');

select cron.schedule(
  'daily-ohlc-refresh',
  '0 16 * * 1-5',
  $$
  select net.http_post(
    url := 'https://project--1f231002-aa7a-4e31-bf81-18e9a93ae528.lovable.app/api/public/ingest-ohlc?all=1&days=5',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvZWZ6cnpha3JreXRuZ29pZGp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzMjc2NjEsImV4cCI6MjA5NzkwMzY2MX0.T2Y9mgz2dOYBSseZ6yGZiPnF4aa6QHVO3HYBPDFcwUk"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);