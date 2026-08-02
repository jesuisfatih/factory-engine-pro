# Staff workflow live proof - 2026-08-02

- Deployed source build: `7e2e78c8a73f0a6290f91930b50bafc8badd749c`
- API health: pass
- Person frontend health: pass
- Browser console errors: 0
- Other tenant containers restarted: 0

## Task brief order

The production modal was checked against live Shopify, Aircall, task, and note data.

1. Call excerpt
2. Follow-up note
3. Customer purchase history and call summary
4. Customer history before calling

Measured vertical gaps were 12 px between every adjacent section. The automated bounding-box assertion returned `sequencePass: true`.

## Routine Call List

The production route uses server-side assignment filtering, pagination, and search. A live exact search returned one matching row with `Showing 1-1 of 1`; the page remained interactive and browser console errors were empty.

Screenshots containing production customer data are retained only in the local evidence directory and are intentionally excluded from the remote repository.
