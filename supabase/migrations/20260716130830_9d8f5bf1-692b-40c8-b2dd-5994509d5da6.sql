-- Fix daily-ohlc-refresh cron: preview URL serves SPA HTML, not API routes.
-- Switch to the published URL which correctly serves server routes.
SELECT cron.alter_job(
  job_id := 5,
  command := $$
    select net.http_post(
      url := 'https://bist-flash-finder.lovable.app/api/public/ingest-ohlc?all=1&days=5',
      headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvZWZ6cnpha3JreXRuZ29pZGp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzMjc2NjEsImV4cCI6MjA5NzkwMzY2MX0.T2Y9mgz2dOYBSseZ6yGZiPnF4aa6QHVO3HYBPDFcwUk"}'::jsonb,
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
  $$
);