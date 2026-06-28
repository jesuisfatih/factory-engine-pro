-- Remove roadmap/proof Aircall records that were created only for workspace UI checks.
-- Real Aircall history is identified by provider call ids and must not use roadmap/proof ids.

DELETE FROM call_events
WHERE lower(coalesce(aircall_call_id, '')) LIKE '%roadmap%'
   OR lower(metadata::text) LIKE '%roadmap%'
   OR lower(metadata::text) LIKE '%proof%';

DELETE FROM calls
WHERE lower(coalesce(aircall_call_id, '')) LIKE '%roadmap%'
   OR lower(coalesce(caller_email, '')) LIKE 'roadmap%@%'
   OR lower(coalesce(transcript_raw, '')) LIKE '%roadmap%';

DELETE FROM aircall_call_events
WHERE lower(external_call_id) LIKE '%roadmap%'
   OR lower(coalesce(contact_email, '')) LIKE 'roadmap%@%'
   OR lower(coalesce(contact_email, '')) LIKE '%@dtfbank.test'
   OR lower(coalesce(contact_email, '')) LIKE '%@example.invalid'
   OR lower(raw_payload::text) LIKE '%roadmap%'
   OR lower(raw_payload::text) LIKE '%proof%';

DELETE FROM aircall_webhook_inbox
WHERE lower(coalesce(external_call_id, '')) LIKE '%roadmap%'
   OR lower(raw_body) LIKE '%roadmap%'
   OR lower(raw_body) LIKE '%proof%';
