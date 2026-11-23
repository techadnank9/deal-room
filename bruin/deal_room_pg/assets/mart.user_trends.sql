/* @bruin
name: mart.user_trends
type: pg.sql
description: Across all finished sessions, which objection types cost the seller the most.
depends:
  - mart.objections_by_type
  - mart.session_scorecard
materialization:
  type: table
columns:
  - name: objection_type
    type: varchar
    checks:
      - name: not_null
      - name: unique
  - name: loss_rate
    type: double
    checks:
      - name: min
        value: 0
      - name: max
        value: 1
@bruin */
SELECT
  o.objection_type,
  SUM(o.times_raised) AS times_raised,
  COUNT(DISTINCT o.session_id) AS sessions,
  ROUND(AVG(o.avg_conviction_delta), 1) AS avg_conviction_delta,
  ROUND(AVG(CASE WHEN s.result = 'lost' THEN 1.0 ELSE 0.0 END), 2) AS loss_rate
FROM mart.objections_by_type o
JOIN mart.session_scorecard s USING (session_id)
GROUP BY o.objection_type
ORDER BY avg_conviction_delta ASC, times_raised DESC
