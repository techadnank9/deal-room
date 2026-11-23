/* @bruin
name: mart.session_scorecard
type: pg.sql
description: One row per finished session - result, votes, claim and whisper counts.
depends:
  - raw.events
  - mart.claim_outcomes
materialization:
  type: table
columns:
  - name: session_id
    type: varchar
    checks:
      - name: not_null
      - name: unique
  - name: votes
    type: integer
    checks:
      - name: accepted_values
        value: [3]
  - name: result
    type: varchar
    checks:
      - name: accepted_values
        value: [won, lost]
custom_checks:
  - name: every finished session has exactly three votes
    query: |
      SELECT COUNT(*) FROM (
        SELECT session_id FROM raw.events WHERE event_type = 'vote'
        GROUP BY session_id HAVING COUNT(*) <> 3
      )
    value: 0
@bruin */
WITH votes AS (
  SELECT
    session_id,
    COUNT(*) AS votes,
    SUM(CASE WHEN status = 'buy' THEN 1 ELSE 0 END) AS buys,
    MAX(turn) AS turns
  FROM raw.events
  WHERE event_type = 'vote'
  GROUP BY session_id
),
started AS (
  SELECT session_id, MIN(ts) AS started_at, MIN(split_part(text, ' | ', 1)) AS company
  FROM raw.events
  WHERE event_type = 'session_started'
  GROUP BY session_id
),
claims AS (
  SELECT
    session_id,
    SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) AS claims_verified,
    SUM(CASE WHEN status <> 'verified' THEN 1 ELSE 0 END) AS claims_failed
  FROM mart.claim_outcomes
  GROUP BY session_id
),
whispers AS (
  SELECT session_id, COUNT(*) AS whispers
  FROM raw.events WHERE event_type = 'whisper'
  GROUP BY session_id
)
SELECT
  v.session_id,
  s.company,
  s.started_at,
  v.turns,
  v.votes,
  v.buys,
  CASE WHEN v.buys >= 2 THEN 'won' ELSE 'lost' END AS result,
  COALESCE(c.claims_verified, 0) AS claims_verified,
  COALESCE(c.claims_failed, 0) AS claims_failed,
  COALESCE(w.whispers, 0) AS whispers
FROM votes v
LEFT JOIN started s USING (session_id)
LEFT JOIN claims c USING (session_id)
LEFT JOIN whispers w USING (session_id)
