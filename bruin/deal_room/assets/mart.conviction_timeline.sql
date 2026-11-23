/* @bruin
name: mart.conviction_timeline
type: duckdb.sql
description: Conviction of each executive after every turn.
depends:
  - raw.events
materialization:
  type: table
columns:
  - name: session_id
    type: varchar
    checks:
      - name: not_null
  - name: actor
    type: varchar
    checks:
      - name: not_null
      - name: accepted_values
        value: [cfo, tech, procurement]
  - name: conviction_after
    type: integer
    checks:
      - name: not_null
      - name: min
        value: 0
      - name: max
        value: 100
  - name: conviction_before
    type: integer
    checks:
      - name: min
        value: 0
      - name: max
        value: 100
@bruin */
SELECT
  session_id,
  turn,
  actor,
  conviction_before,
  conviction_after,
  conviction_after - conviction_before AS delta,
  target AS objection_type,
  text AS reason
FROM raw.events
WHERE event_type = 'conviction_change'
ORDER BY session_id, turn, actor
