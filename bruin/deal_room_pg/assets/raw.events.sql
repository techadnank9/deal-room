/* @bruin
name: raw.events
type: pg.sql
description: Raw session events written by the app to public.events (one row per utterance, claim check, whisper, conviction change, vote).
materialization:
  type: view
columns:
  - name: id
    type: bigint
    checks:
      - name: not_null
      - name: unique
  - name: session_id
    type: varchar
    checks:
      - name: not_null
  - name: actor
    type: varchar
    checks:
      - name: not_null
      - name: accepted_values
        value: [user, cfo, tech, procurement, analyst, director]
  - name: event_type
    type: varchar
    checks:
      - name: not_null
      - name: accepted_values
        value: [session_started, utterance, claim_check, whisper, conviction_change, thought, speaker_pick, vote, adapt]
@bruin */
SELECT id, session_id, turn, ts, actor, event_type, text, target, conviction_before, conviction_after, status, source_url
FROM public.events
