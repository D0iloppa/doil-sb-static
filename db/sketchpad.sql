CREATE TABLE IF NOT EXISTS sketchpad (
  id         TEXT         PRIMARY KEY,
  elements   JSONB        NOT NULL DEFAULT '[]',
  app_state  JSONB        NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
