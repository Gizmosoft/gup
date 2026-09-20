-- V8__add_health.sql
-- Singleton row used by GET /health to prove API + Postgres are reachable.

CREATE TABLE health (
    id               SMALLINT PRIMARY KEY CHECK (id = 1),
    check_count      BIGINT NOT NULL DEFAULT 0,
    last_checked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO health (id, check_count, last_checked_at)
VALUES (1, 0, NOW());
