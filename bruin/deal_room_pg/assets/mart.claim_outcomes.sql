/* @bruin
name: mart.claim_outcomes
type: pg.sql
description: Every claim the seller made, what the analyst found, and the source.
depends:
  - raw.events
materialization:
  type: table
columns:
  - name: status
    type: varchar
    checks:
      - name: not_null
      - name: accepted_values
        value: [verified, unsupported, contradicted]
@bruin */
SELECT
  session_id,
  turn,
  text AS claim,
  status,
  target AS note,
  source_url
FROM raw.events
WHERE event_type = 'claim_check'
