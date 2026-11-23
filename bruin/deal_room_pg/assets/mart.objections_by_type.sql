/* @bruin
name: mart.objections_by_type
type: pg.sql
description: How often each objection type was raised in each session and how much it cost in conviction.
depends:
  - mart.conviction_timeline
materialization:
  type: table
columns:
  - name: objection_type
    type: varchar
    checks:
      - name: not_null
      - name: accepted_values
        value: [price, roi, security, integration, timing, vendor_risk, proof]
  - name: times_raised
    type: integer
    checks:
      - name: positive
@bruin */
SELECT
  session_id,
  objection_type,
  COUNT(*) AS times_raised,
  ROUND(AVG(delta), 1) AS avg_conviction_delta
FROM mart.conviction_timeline
WHERE turn > 0 AND objection_type IS NOT NULL AND objection_type <> 'none'
GROUP BY session_id, objection_type
