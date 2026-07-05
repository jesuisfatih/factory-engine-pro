# Rule Engine MCP/MVP Agent Guide

This document is the agent-facing operating manual for authoring Rule Engine rules in Factory Engine Pro.

The goal is not to let an agent "do things" directly. The goal is to let an agent compile a business sentence into a deterministic workflow rule, then validate and simulate that rule before a human publishes it.

## Core Mental Model

Rule Engine is a deterministic workflow compiler for sales and account follow-up.

It listens to resolved call signals and produces staff work, notes, pins, routing, watchers, or no-op audit outcomes. It must not become a support ticket robot, mail sender, destructive automation, or hidden Shopify mutator.

The correct mental model:

1. Aircall call arrives.
2. Transcript resolver extracts structured operational signals.
3. Rule Engine evaluates active rules.
4. If a rule matches, it creates or enriches staff work.
5. Staff members decide what to do next.

The incorrect mental model:

1. Caller sounds upset.
2. Rule automatically opens a support case.
3. Rule sends a customer email.
4. Rule changes segments or deletes data.

That is not allowed in the MVP.

## Hard Boundaries

These boundaries are product rules, not implementation preferences.

- Automatic support case creation is not allowed.
- Customer requests are opened manually by customer service.
- Rule-created tasks can use only `sales` or `account` axis.
- MCP-authored rules use only `call.operational_signal.detected` as trigger.
- MCP-authored rules must include an `operational_intent` condition.
- MCP-authored rules are draft first. Publishing requires validation and simulation.
- Direct email sending is not enabled.
- Segment add/remove is not enabled.
- Destructive actions are not enabled.
- A rule must not hide uncertainty. Use conditions, assumptions, and validation output.
- Do not write customer-facing or admin-facing labels with the word "AI". Use "call analysis", "resolver", "workflow", or "transcript analysis" in UI text.

## Allowed MCP Tools

The MCP surface exposes these tool concepts:

- `list_workflow_capabilities`
- `read_workflow_agent_guide`
- `list_workflow_rules`
- `get_workflow_rule`
- `archive_workflow_rule`
- `restore_workflow_rule`
- `draft_workflow_rule`
- `validate_workflow_rule`
- `simulate_workflow_rule`
- `create_workflow_rule_draft`
- `publish_workflow_rule`
- `list_aircall_transcripts`
- `download_aircall_transcript`
- `export_aircall_transcripts`
- `list_scheduled_workflow_actions`
- `get_scheduled_workflow_action`
- `cancel_scheduled_workflow_action`
- `simulate_deferred_workflow_rule`
- `explain_scheduled_workflow_action`
- `read_frontend_agent_guide`
- `list_frontend_surfaces`
- `get_frontend_surface_contract`
- `preview_frontend_customization`
- `apply_frontend_customization`
- `list_frontend_customizations`
- `get_frontend_customization`
- `rollback_frontend_customization`
- `list_algorithm_surfaces`
- `get_algorithm_contract`
- `draft_algorithm_change`
- `validate_algorithm_change`
- `simulate_algorithm_change`
- `compare_algorithm_versions`
- `publish_algorithm_version`
- `rollback_algorithm_version`
- `explain_customer_ranking`
- `explain_task_visibility`

The safe authoring sequence is always:

1. `read_workflow_agent_guide`
2. `list_workflow_capabilities`
3. `list_workflow_rules` to avoid duplicate or conflicting rules.
4. If the task depends on a real call, `list_aircall_transcripts` first, then `download_aircall_transcript` only for the exact call event needed.
5. `draft_workflow_rule`
6. Store the returned `draftId`.
7. Inspect draft conditions and actions.
8. `validate_workflow_rule` with `draftId`.
9. `simulate_workflow_rule` with `draftId`.
10. `create_workflow_rule_draft` with `draftId`.
11. `simulate_workflow_rule` against the stored rule id.
12. `publish_workflow_rule` only with a fresh matching simulation report.

Never skip validation or simulation for a generated rule.

Prefer stateful `draftId` calls over sending the full rule object repeatedly. If an MCP bridge cannot send nested JSON objects safely, use `ruleJson` as a JSON string fallback.

Use `archive_workflow_rule` for removal. Hard delete is intentionally not exposed because rule history, simulations, and task audit evidence must remain inspectable. Use `restore_workflow_rule` only to bring an archived rule back as `draft` or `shadow`; publishing still requires the normal simulation gate.

Transcript tools are for evidence and debugging, not for bulk prompt stuffing. `list_aircall_transcripts` returns metadata only. `download_aircall_transcript` returns one transcript. `export_aircall_transcripts` should be bounded with a small `limit`, `recentDays`, or `q` filter.

Runtime binding:

```text
POST/GET/DELETE /api/v1/mcp/workflow
GET /api/v1/rules/mcp/capabilities
GET /api/v1/rules/mcp/agent-guide
```

Remote MCP clients should connect to:

```json
{
  "type": "streamable-http",
  "url": "https://api.dtfbank.com/api/v1/mcp/workflow",
  "headers": {
    "Authorization": "Bearer <member-or-mcp-access-token>",
    "x-tenant-id": "ten_dtfbank"
  }
}
```

Local stdio bridge clients may still run `packages/workflow-mcp/dist/index.js`, but they are no longer required for machines that support Streamable HTTP MCP.

Agents should discover the markdown through `agentGuide.endpoint` in capabilities and read it through `read_workflow_agent_guide`. Users should not need to paste this markdown into a separate MVP prompt.

### Remote Token Permissions

Remote MCP tokens are scoped. A token that can read this guide is not automatically allowed to inspect transcripts or mutate rules.

Minimum permission map:

- `settings.read`: read guide, list capabilities, list rules, get rules, draft/validate/simulate rules.
- `settings.write`: create stored drafts, publish rules, archive rules, restore rules.
- `aircall.users.read`: list, download, and export Aircall transcript evidence.

If an agent gets `You do not have permission to use this MCP tool`, inspect the token permission list before debugging the tool itself. For transcript work, the token must include `aircall.users.read`.

### Aircall Transcript Evidence Workflow

Use transcript tools to fetch only the calls needed for proof or rule design:

```json
{
  "tool": "list_aircall_transcripts",
  "input": {
    "agent": "Linda",
    "limit": 10
  }
}
```

`agent` resolves against Factory Engine members by name, email, or Aircall user id, then filters exact `member.aircallUserId`. It is not a fuzzy transcript text search. This prevents Ihsan calls from being treated as Linda calls, or the reverse.

For a specific call, download by `callEventId`:

```json
{
  "tool": "download_aircall_transcript",
  "input": {
    "callEventId": "aircall_event_id_here"
  }
}
```

For a bounded handoff package, export with a small limit:

```json
{
  "tool": "export_aircall_transcripts",
  "input": {
    "agent": "Linda",
    "limit": 10,
    "format": "jsonl"
  }
}
```

Do not ask an LLM to read every transcript repeatedly. List metadata first, download only the exact call, and reuse stored resolver output before using raw transcript text.

Live proof from the DTF Bank setup:

- Linda resolves to Aircall user id `1831312`.
- `list_aircall_transcripts` with `agent="Linda"` and `limit=10` returned 10 Linda-only calls.
- `export_aircall_transcripts` with the same filter returned 10 JSONL rows.
- `download_aircall_transcript` returned the selected transcript plus resolver output.

## Staff Brief Contract

Transcript resolver schema v4 includes a `person_brief` JSON object. This object is the source for the staff task modal narrative:

```json
{
  "person_brief": {
    "why_calling": "specific reason this customer should be called now",
    "upset_about": "concrete complaint, objection, confusion, risk, or no explicit complaint",
    "call_goal": "next human outcome",
    "suggested_actions": ["2 to 5 concrete staff actions"],
    "transcript_snippet": "short transcript evidence"
  }
}
```

Rules do not write these modal paragraphs directly. The resolver writes them from transcript evidence, and Rule Engine uses rules only to decide whether staff work should be created or enriched. If `person_brief` is missing on older resolved calls, the person workspace synthesizes the same fields from resolver summary, product mentions, operational signals, and transcript text.

Do not include "AI", "automation", or automatic support-case language in `person_brief`. Use staff-facing sales/account language: call reason, concern, goal, and next actions.

## Allowed Trigger

For MCP-authored rules, use:

```text
call.operational_signal.detected
```

Legacy transcript triggers may exist in the system, but new MCP-authored rules should not use them.

## Allowed Actions

MCP-authored rules may use:

- `create_task`
- `route_member`
- `route_segment_owner`
- `route_call_owner`
- `add_note`
- `pin_customer`
- `add_watcher`
- `escalate`
- `no-op`

Task-targeted actions require a `create_task` earlier in the same rule:

- `route_member`
- `route_segment_owner`
- `route_call_owner`
- `add_watcher`
- `escalate`

Allowed `create_task` axis values:

- `sales`
- `account`

Do not use `support` as an axis. Support is personnel-driven.

## Disallowed Requests

Reject or warn on prompts that ask for:

- "create support case"
- "open ticket"
- "customer request ac"
- "mail gonder"
- "send email"
- "remove segment"
- "delete customer"
- "sil"
- direct destructive changes

Allowed alternative:

```text
Refund isteyen musteriyi account task olarak Linda'ya ata, support case acma.
```

Disallowed:

```text
Refund isteyen musteriden otomatik support case ac ve email gonder.
```

## Operational Intents

Every MCP-authored operational rule needs one of these intents:

- `heat_press_machine_purchase_intent`
- `spare_part_purchase_intent`
- `heat_press_purchase_intent`
- `dtf_supply_reorder_signal`
- `quote_request`
- `callback_requested`
- `refund_requested`
- `shipping_status_question`
- `financing_question`
- `price_objection`
- `product_fit_question`
- `sample_request`
- `machine_upgrade_interest`
- `training_installation_need`
- `existing_customer_expansion_signal`
- `no_action`

Use `no_action` for wrong number, spam, silent calls, or non-actionable calls. `no_action` must not create or route a task.

## Product Taxonomy

The product language registry is built from live Shopify catalog data. It exposes product aliases plus taxonomy:

- `family`
- `role`
- `category`
- `variantSkus`
- `collections`

Product roles:

- `machine`
- `spare_part`
- `consumable`
- `accessory`
- `service`
- `unknown`

Product categories:

- `heat_press`
- `dtf_supply`
- `printer_part`
- `transfer`
- `unknown`

Important:

- `product_mentioned` alone is not enough for hard rules.
- Use taxonomy guards when machine, part, or consumable semantics matter.
- If prompt says "Hydro1620 part", expect `product_family_is=Hydro1620` and `product_role_is=spare_part`.
- If prompt says "Hydro1620 heat press machine", expect `product_family_is=Hydro1620` and `product_role_is=machine`.
- Negative product phrases must not become target guards.

Example:

```text
Hydro1620 heat press machine fiyati soranlari sales task yap. Parca veya sarf malzeme sorularinda bu rule calismasin.
```

Correct compiled shape:

```text
operational_intent = heat_press_machine_purchase_intent
product_family_is = Hydro1620
product_role_is = machine
product_category_is = heat_press
open_task_exists_for_intent = false
create_task axis=sales
```

Incorrect compiled shape:

```text
operational_intent = heat_press_machine_purchase_intent
product_role_is = spare_part
```

That must be rejected.

## Shopify Data And MCP

Yes, Shopify data can be connected to MCP, but it must not be exposed as one unbounded "dump all Shopify" tool.

The current rule authoring surface already uses Shopify-derived data in deterministic places:

- live catalog product language for product family, role, category, SKU, aliases, and collections
- prior purchase guards such as `previous_purchase_includes`, `previous_purchase_family_includes`, and `owned_machine_family_is`
- customer order context guards such as `customer_ltv_gte`, `order_count_in_window`, and `last_order_age_lte`
- segment membership guards such as `segment_member`

Future Shopify MCP tools should be read-only, paginated, tenant-scoped, and purpose-built:

- `search_shopify_customers`: search by name, email, phone, company, or Shopify customer id.
- `get_shopify_customer`: return profile, phones, emails, tags, addresses, segment memberships, LTV, order counts, and recent order summary.
- `list_shopify_orders`: list orders by customer, date window, status, order number, or product/SKU filter.
- `get_shopify_order`: return one order with line items, SKU, product family, totals, fulfillments, refunds, and timeline facts.
- `search_shopify_products`: search synced catalog by title, handle, SKU, family, role, category, vendor, tag, or collection.
- `get_shopify_product`: return one product with variants, SKUs, taxonomy, aliases, collections, and active status.
- `list_shopify_segments`: list synced Shopify segments with ownership and membership counts.
- `get_shopify_segment_members`: page through segment members with cursor and limit.
- `get_shopify_sync_status`: show last sync state for customers, orders, products, and segments.

Required guardrails:

- Default limit should be small, maximum page size should be capped, and all list tools must use cursor pagination.
- No Shopify admin token, webhook secret, encrypted credential, or integration secret may be returned.
- Use local synced database rows first. Use live Shopify API fallback only for a single customer, order, or product detail lookup when the synced row is missing or stale.
- Do not expose mutation tools for discounts, orders, refunds, customer edits, segment membership edits, or deletion in this MVP.
- Do not feed full customer archives or full order histories into prompts. Fetch summaries first, then fetch one selected detail object.
- Tool output must carry enough source metadata to distinguish synced DB data from live Shopify fallback.

Recommended permissions:

- `customers.read`: customer profile, addresses, customer segment memberships.
- `orders.read`: order list, order detail, refunds/fulfillment facts.
- `pricing.read` or `settings.read`: catalog/product taxonomy lookup used by rule authoring.
- `settings.read`: sync status and rule authoring catalog language.

The MCP agent should treat Shopify as business context for rule drafting and staff brief explanation, not as an action surface.

## Conditions

Available condition families:

### Call Analysis

- `operational_intent`
- `call_intent`
- `psych_tag_includes`

### Product Taxonomy

- `product_mentioned`
- `product_family_is`
- `product_role_is`
- `product_category_is`
- `product_sku_is`
- `product_collection_is`
- `product_match_confidence_gte`

### Prior Commerce Context

- `previous_purchase_includes`
- `previous_purchase_family_includes`
- `owned_machine_family_is`
- `customer_ltv_gte`
- `order_count_in_window`
- `last_order_age_lte`

### Customer Segments

- `segment_member`

### Call History

- `call_count_in_window`
- `is_first_call`

### Task State

- `open_task_exists_for_intent`

### Ownership

- `axis_primary_is`

### Time

- `time_of_day_in_range`
- `day_of_week`

## Rule Quality Checklist

Before accepting a generated draft:

- Does it have exactly one clear operational intent?
- Does the axis match the business owner: `sales` or `account`?
- Does it avoid `support`?
- Does it avoid direct email?
- Does it avoid destructive changes?
- Does it guard duplicate work with `open_task_exists_for_intent=false` unless the user explicitly asked for every occurrence?
- If product semantics matter, does it include product taxonomy, not just product text?
- If the customer must own a machine, does it include `owned_machine_family_is`?
- If the customer must have bought related products before, does it include `previous_purchase_family_includes`?
- If routing to a person, did it resolve a real member email?
- If routing to call owner, does it use `route_call_owner`?
- If routing to segment owner, does it use `route_segment_owner`?
- Did validation pass?
- Did simulation show expected matches and no unintended task flood?

## Prompt Writing Style

Good prompts are specific about:

- trigger event
- intent
- product family
- product role
- customer history
- repeat-call threshold
- urgency
- owner/routing
- duplicate guard
- exclusions

Good:

```text
Hydro1620 yedek parcasi veya sliding handle soran musteri satin alma niyeti gosteriyorsa sales task olustur, Ihsan Taskiran atansin. Ayni makine ailesinden daha once makine aldiysa calissin. Makine fiyati soranlarda bu rule calismasin. Ayni intent icin acik task varsa yenisini acma.
```

Bad:

```text
Parca soranlari Ihsan'a ata.
```

The bad prompt is ambiguous. It does not define intent, product family, customer history, exclusions, or duplicate behavior.

## High Difficulty Prompt Examples

These are intentionally hard. They are meant to test cross-context behavior.

### 1. Machine Sale vs Part Sale Split

Prompt:

```text
Hydro1620 heat press machine fiyati soran veya yeni makine almak isteyen musteriyi call owner'a high priority sales task yap. Parca veya sarf malzeme sorularinda bu rule calismasin. Ayni intent icin acik task varsa yenisini acma.
```

Expected:

```text
operational_intent = heat_press_machine_purchase_intent
product_family_is = Hydro1620
product_role_is = machine
product_category_is = heat_press
open_task_exists_for_intent = false
create_task axis=sales
route_call_owner
```

Must not compile to:

```text
product_role_is = spare_part
call_intent = inquiry
```

### 2. Part Sale Only For Existing Machine Owners

Prompt:

```text
Hydro1620 yedek parcasi, sliding handle, platen part veya machine part soran musteri satin alma niyeti gosteriyorsa Ihsan'a sales task olustur. Sadece daha once ayni makine ailesinden makine almis musterilerde calissin. Yeni makine fiyati soranlarda calismasin. Ayni intent icin acik task varsa yenisini acma.
```

Expected:

```text
operational_intent = spare_part_purchase_intent
product_family_is = Hydro1620
product_role_is = spare_part
product_category_is = heat_press
owned_machine_family_is = Hydro1620
open_task_exists_for_intent = false
create_task axis=sales
route_member value=ihsan@dtfbank.com
```

### 3. Fifth Angry Call Escalation

Prompt:

```text
Son 30 gun icinde besinci kez arayan ve cok sinirli gorunen musteri varsa, satis niyeti veya callback istiyorsa sales task olustur, call owner'a ata, sales watcher ekle ve escalate et. Ayni intent icin acik task varsa yenisini acma.
```

Expected:

```text
call_count_in_window >= 5 calls / 30 days
psych_tag_includes = angry with confidenceGte 0.75
operational_intent in sales-oriented intent
open_task_exists_for_intent = false
create_task axis=sales
route_call_owner
add_watcher value=sales
escalate
```

### 4. First Call Product Fit Consultation

Prompt:

```text
Ilk kez arayan ve hangi heat press makineyi almasi gerektigini soran musteriyi sales consultation task yap. Segment owner varsa ona ata, yoksa call owner'a kalsin. Support case acma.
```

Expected:

```text
operational_intent = product_fit_question
is_first_call = true
product_category_is = heat_press
open_task_exists_for_intent = false
create_task axis=sales
route_segment_owner
```

### 5. VIP Existing Customer Expansion

Prompt:

```text
LTV 5000 dolar ustu olan mevcut musteri yeni urun, ikinci makine veya upgrade konusursa sales task olustur, segment owner'a ata, watcher olarak sales ekle. Son 30 gunde ayni intent icin acik task varsa yenisini acma.
```

Expected:

```text
operational_intent = existing_customer_expansion_signal or machine_upgrade_interest
customer_ltv_gte >= 5000
open_task_exists_for_intent = false
create_task axis=sales
route_segment_owner
add_watcher value=sales
```

### 6. DTF Supply Reorder With Recent Order Guard

Prompt:

```text
Daha once DTF powder, film veya ink almis musteri tekrar siparis, running low veya need more derse sales task olustur. Son siparisi 90 gun icindeyse calissin. Segment owner'a ata. Ayni intent icin acik task varsa yenisini acma.
```

Expected:

```text
operational_intent = dtf_supply_reorder_signal
product_role_is = consumable
product_category_is = dtf_supply
previous_purchase_family_includes = DTF Supplies
last_order_age_lte <= 90
open_task_exists_for_intent = false
create_task axis=sales
route_segment_owner
```

### 7. Exact SKU Or Variant Mention

Prompt:

```text
Musteri SKU HP-HYDRO-1620-PART veya ayni SKU icin fiyat sorarsa Ihsan'a sales task olustur. Urun eslesmesi guvenli degilse calismasin. Ayni intent icin acik task varsa yenisini acma.
```

Expected:

```text
operational_intent = spare_part_purchase_intent
product_sku_is = HP-HYDRO-1620-PART
product_match_confidence_gte >= 0.75
open_task_exists_for_intent = false
create_task axis=sales
route_member value=ihsan@dtfbank.com
```

### 8. Refund Request Is Account Work, Not Support Automation

Prompt:

```text
Refund veya exchange isteyen musteriyi account task olarak Linda'ya ata. Support case acma, ticket acma, email gonderme. Ayni intent icin acik task varsa yenisini acma.
```

Expected:

```text
operational_intent = refund_requested
open_task_exists_for_intent = false
create_task axis=account
route_member value=<Linda member email>
```

Must not:

```text
create support case
send_mail
create_task axis=support
```

### 9. Freight And Delivery Account Follow-Up

Prompt:

```text
Freight, liftgate, delivery address veya tracking soran musteriyi account task yap. Eger call owner cevaplamissa ona ata. Ayni intent icin acik task varsa yenisini acma.
```

Expected:

```text
operational_intent = shipping_status_question
open_task_exists_for_intent = false
create_task axis=account
route_call_owner
```

### 10. Financing Question With Purchase Intent

Prompt:

```text
Leasing, financing, monthly payment veya TimePayment soran ve makine satin alma niyeti olan musteriyi account task yap, account watcher ekle. Ayni intent icin acik task varsa yenisini acma.
```

Expected:

```text
operational_intent = financing_question
product_role_is = machine
open_task_exists_for_intent = false
create_task axis=account
add_watcher value=account
```

### 11. Price Objection Without Discount Automation

Prompt:

```text
Musteri heat press cok pahali, discount, cheaper, price match veya indirim isterse sales task olustur, call owner'a ata. Otomatik discount verme. Ayni intent icin acik task varsa yenisini acma.
```

Expected:

```text
operational_intent = price_objection
product_category_is = heat_press
open_task_exists_for_intent = false
create_task axis=sales
route_call_owner
```

Must not:

```text
change Shopify discount
send coupon email
```

### 12. Sample Request For Transfer Prospects

Prompt:

```text
DTF transfer sample, test print veya proof isteyen musteriyi sales task yap. Daha once siparisi yoksa high priority yap, segment owner'a ata. Ayni intent icin acik task varsa yenisini acma.
```

Expected:

```text
operational_intent = sample_request
product_category_is = transfer
open_task_exists_for_intent = false
create_task axis=sales
route_segment_owner
```

### 13. Training Or Installation Need

Prompt:

```text
Makine kurulum, training, setup veya nasil kullanilir sorusu gelirse account task olustur. Musteri daha once makine aldiysa calissin. Call owner'a ata.
```

Expected:

```text
operational_intent = training_installation_need
owned_machine_family_is = <detected machine family if present>
create_task axis=account
route_call_owner
```

### 14. Wrong Number Or Spam No-Op

Prompt:

```text
Wrong number, spam, silent call veya actionable olmayan aramalarda task olusturma; sadece audit no-op olarak kaydet.
```

Expected:

```text
operational_intent = no_action
no-op
```

Must not:

```text
create_task
route_member
route_call_owner
```

### 15. Cross-Context VIP Upgrade With Angry Repeat Call

Prompt:

```text
Son 30 gun icinde en az 4 kez arayan, LTV 10000 dolar ustu, daha once Hydro1620 ailesinden makine almis ve simdi ikinci makine, bigger machine veya upgrade isteyen musteri cok sinirli gorunuyorsa high priority sales task olustur. Call owner'a ata, sales watcher ekle, escalate et. Parca veya sarf malzeme sorularinda calismasin. Ayni intent icin acik task varsa yenisini acma.
```

Expected:

```text
operational_intent = machine_upgrade_interest
call_count_in_window >= 4 calls / 30 days
customer_ltv_gte >= 10000
owned_machine_family_is = Hydro1620
product_role_is = machine
psych_tag_includes = angry with confidenceGte 0.75
open_task_exists_for_intent = false
create_task axis=sales
route_call_owner
add_watcher value=sales
escalate
```

### 16. Segment Owner Priority Follow-Up

Prompt:

```text
Min 2 max 5 purchase segmentindeki musteri yeniden siparis veya heat press parca ihtiyaci konusursa segment owner'a sales task olustur. Ayni intent icin acik task varsa yenisini acma.
```

Expected:

```text
segment_member = Min 2 max 5 purchase
operational_intent = spare_part_purchase_intent or dtf_supply_reorder_signal
open_task_exists_for_intent = false
create_task axis=sales
route_segment_owner
```

### 17. Do Not Overfit Call Intent

Prompt:

```text
Hydro1620 heat press machine fiyati soran veya yeni makine almak isteyen musteriyi sales task yap.
```

Expected:

```text
operational_intent = heat_press_machine_purchase_intent
product_family_is = Hydro1620
product_role_is = machine
create_task axis=sales
```

Do not add `call_intent=inquiry` when the prompt also says new machine or buy. A price question can still be purchase intent.

### 18. Customer Has Machine, Wants Consumables

Prompt:

```text
Hydro1620 sahibi olup DTF film, powder veya ink tekrar almak isteyen musteriyi sales task yap. Ayni makine ailesinden once makine almis olmasi gerekir. Segment owner'a ata. Ayni intent icin acik task varsa yenisini acma.
```

Expected:

```text
operational_intent = dtf_supply_reorder_signal
owned_machine_family_is = Hydro1620
product_role_is = consumable
product_category_is = dtf_supply
open_task_exists_for_intent = false
create_task axis=sales
route_segment_owner
```

## Prompt Templates

Use these as base templates.

### Product Purchase Template

```text
<product family> <machine|part|supply> hakkinda <buy/price/reorder> niyeti gosteren musteriyi <sales|account> task yap. <person/call owner/segment owner> atansin. <exclusions>. Ayni intent icin acik task varsa yenisini acma.
```

### Repeat Call Template

```text
Son <N> gun icinde en az <M> kez arayan ve <intent> gosteren musteriyi <axis> task yap. <psych tag> varsa escalate et. Ayni intent icin acik task varsa yenisini acma.
```

### Prior Purchase Template

```text
Daha once <product family> ailesinden <machine|supply|part> almis musteri simdi <new intent> gosterirse <axis> task yap. <routing>. Ayni intent icin acik task varsa yenisini acma.
```

### Segment Owner Template

```text
<segment name> segmentindeki musteri <intent> gosterirse segment owner'a <axis> task yap. Ayni intent icin acik task varsa yenisini acma.
```

### No-Op Template

```text
<wrong number/spam/silent/non-actionable> aramalarda task olusturma. no-op audit olarak kaydet.
```

## Validation Failures To Expect

These are good failures. They protect production behavior.

### Machine Intent With Spare Part Guard

Input shape:

```text
operational_intent = heat_press_machine_purchase_intent
product_role_is = spare_part
```

Expected validation:

```text
ok = false
Heat press machine purchase rules cannot be guarded by spare_part or consumable product_role conditions.
```

### Spare Part Intent With Machine Guard

Input shape:

```text
operational_intent = spare_part_purchase_intent
product_role_is = machine
```

Expected validation:

```text
ok = false
Spare part purchase rules cannot be guarded by machine product_role conditions.
```

### Support Axis

Input shape:

```text
create_task axis=support
```

Expected:

```text
ok = false
```

Reason:

```text
Rule-created tasks cannot target customer requests. Customer service must open customer requests manually.
```

### Direct Mail

Input prompt:

```text
Musteriye otomatik email gonder.
```

Expected:

```text
unsupported includes direct mail warning
```

## Runtime Evidence To Collect

For every serious rule rollout, collect:

- capabilities output proving allowed triggers/actions/conditions
- draft response with conditions/actions
- validation response
- simulation response
- stored draft id if persisted
- publish response if published
- live execution sample after real matching call, if available
- no unintended support case creation
- no duplicate task flood

Minimal smoke examples:

```text
GET /api/v1/rules/mcp/capabilities
GET /api/v1/rules/mcp/agent-guide
POST /api/v1/rules/mcp/draft
POST /api/v1/rules/mcp/validate
POST /api/v1/rules/mcp/simulate
```

## How To Explain A Draft To A Human

When presenting a generated rule, summarize in this exact order:

1. Trigger.
2. Operational intent.
3. Product/customer/history guards.
4. Duplicate guard.
5. Task axis.
6. Routing.
7. Watcher/escalation/no-op behavior.
8. What it explicitly does not do.
9. Validation result.
10. Simulation result.

Example:

```text
This draft fires on resolved call operational signals. It targets Hydro1620 spare part purchase intent only, requires the customer to own the Hydro1620 family, prevents duplicate open tasks for the same intent, creates a sales task, and routes it to Ihsan. It does not create support cases, send email, mutate segments, or touch Shopify discounts. Validation passed; simulation must be reviewed before publishing.
```

## Common Mistakes

### Mistake: Treating "support" As A Workflow Axis

Wrong:

```text
Support sikayeti varsa support task ac.
```

Correct:

```text
Refund veya delivery sorunu varsa account task ac; customer service gerekli gorurse manuel support case acar.
```

### Mistake: Letting Negative Clauses Become Conditions

Wrong interpretation:

```text
Parca sorularinda calismasin.
```

as:

```text
product_role_is = spare_part
```

Correct interpretation:

```text
spare_part is an exclusion, not a target.
```

### Mistake: Product Text Without Taxonomy

Weak:

```text
product_mentioned contains Hydro1620
```

Strong:

```text
product_family_is = Hydro1620
product_role_is = machine
product_category_is = heat_press
```

### Mistake: Price Question Means Only Inquiry

Price can be purchase intent. Do not narrow a machine purchase rule to `call_intent=inquiry` when the prompt also says buy, purchase, new machine, or almak.

### Mistake: Every Match Creates Another Task

Default should include:

```text
open_task_exists_for_intent = false
```

Only omit this if the human explicitly asks for every occurrence.

## Current MVP Limits

The MVP does not yet support:

- direct customer email sending from MCP-authored rules
- automatic support case creation
- Shopify discount mutation
- Shopify order mutation
- customer deletion
- segment add/remove from MCP-authored rules
- arbitrary SQL or arbitrary external tool calls
- custom HTML injection into modals
- executing actions without deterministic validation

Future versions may add controlled template rendering or richer modal variables, but that must be a separate safe rendering system with allowlisted variables and sanitization. It must not be mixed into rule execution silently.

## Deferred Visible Work

Deferred visible work is for prompts such as:

```text
Do not call the customer immediately. Put the customer in Ihsan's Daily Call List 15 days later if they still have not purchased.
```

This is not a due date.

Wrong implementation:

```text
Create a task today and set dueAt to 15 days later.
```

Correct implementation:

1. The rule matches today.
2. No ServiceRequest is created today.
3. A `workflow_scheduled_actions` row is written with `status=pending` and `runAt`.
4. BullMQ only wakes the worker. The database row is the source of truth.
5. At `runAt`, the worker revalidates the customer state.
6. If the rule is still valid, the worker creates the ServiceRequest at that time.
7. The task appears in the staff Daily Call List only after materialization.

Supported create_task timing:

```json
{
  "timing": {
    "mode": "deferred_materialization",
    "delayDays": 15,
    "base": "source_call_time"
  },
  "revalidate": {
    "skipIfOpenTaskExistsForIntent": true,
    "skipIfCustomerPurchasedSinceSourceCall": true,
    "skipIfNoCustomerMatch": true
  }
}
```

Rules:

- Deferred timing is allowed only on `create_task`.
- `support` is still forbidden.
- Use only `sales` or `account`.
- `runAt` must be future dated.
- `delayDays` is capped at 365.
- Revalidation must be explicit.
- Publish only after `simulate_deferred_workflow_rule` and normal validation/simulation.

Use these MCP tools for deferred work:

- `simulate_deferred_workflow_rule`: prove which actions will be hidden and when they would materialize.
- `list_scheduled_workflow_actions`: inspect pending/deferred work.
- `get_scheduled_workflow_action`: inspect one scheduled action.
- `explain_scheduled_workflow_action`: explain runAt, status, and revalidation.
- `cancel_scheduled_workflow_action`: cancel pending hidden work before it becomes staff-visible.

### Frontend runtime customization tools

Frontend MCP changes use a safe runtime customization DSL before source-file patching.

- `read_frontend_agent_guide`: read the full staff UI engineering guide.
- `list_frontend_surfaces`: list allowlisted surfaces.
- `get_frontend_surface_contract`: read the exact surface files, endpoints, states, terminology, and smoke checklist.
- `preview_frontend_customization`: validate a slot/block/data-binding UI overlay without changing staff UI.
- `apply_frontend_customization`: store the overlay as draft or activate it for the tenant.
- `list_frontend_customizations`: audit current and historical overlays.
- `get_frontend_customization`: inspect one overlay.
- `rollback_frontend_customization`: archive current active overlay or reactivate a previous overlay.

The DSL supports slots, block types, live data bindings, and visibility conditions. It must not include raw HTML, scripts, arbitrary CSS, secrets, deploy commands, or backend schema changes.

Staff UI text must stay business-facing. Prefer:

```text
Call now
From previous call on <date>
No purchase since last call
```

Do not show:

```text
AI
workflow rule
sales axis
support axis
internal resolver
```

## Algorithm Strategy Layer

Workflow rules decide when staff work is created. The algorithm strategy layer decides how existing staff/customer/mail work is ranked, shown, explained, and actioned.

Do not confuse these two layers:

- Workflow DSL: creates deterministic work from call or business events.
- Algorithm strategy DSL: ranks, filters, scores, schedules visibility, orders CTA buttons, and explains why an item appears.
- Frontend customization DSL: changes safe UI presentation slots and wording.
- Source patch lane: maintainer-only code changes with build and screenshot proof.

The strategy layer exists because the business owner wants to change operating logic without asking an engineer to edit source code for every idea. The answer is not freeform JavaScript. The answer is versioned JSON strategy with strict schema and a no-mutation simulation gate.

### Strategy surfaces

Use `list_algorithm_surfaces` first. The current allowed surfaces are:

- `staff.daily_call_list.ranking`
- `staff.priority_kanban.customer_score`
- `staff.task_visibility`
- `staff.customer_next_action`
- `staff.call_brief_generation`
- `customer_portal.reorder_eligibility`
- `mail_marketing.audience_eligibility`
- `mail_marketing.send_safety`

Use `get_algorithm_contract` for the target surface before drafting. The contract tells you:

- allowed signal fields
- allowed weights
- allowed sort fields
- allowed CTA ids
- allowed modal action ids
- simulation evidence expected before publish
- red lines for that surface

Never invent field names. If a requested field is not in the contract, return a clear limitation and ask for the backend contract to be expanded.

### Native runtime binding matrix

Strategy tools are not documentation-only. A published strategy changes a native runtime surface only when that surface is listed below. If a surface is not listed here, treat it as design-time only until engineering wires it.

Current runtime bindings:

- `staff.daily_call_list.ranking`
  - Runtime: `PersonWorkspaceService.dailyOperationsFor`.
  - Effect: ranks visible Daily Call List cards after ownership, source, axis, and date-window filters.
  - Hard guard: Linda custom ordering can still override automatic sort for her own queue.
- `staff.priority_kanban.customer_score`
  - Runtime: `PersonWorkspaceService.dailyOperationsFor`.
  - Effect: scores and sorts customers inside assigned Shopify segment groups.
  - Hard guard: cannot add customers outside the member's assigned segment ownership.
- `staff.task_visibility`
  - Runtime: `PersonWorkspaceService.dailyOperationsFor`.
  - Effect: hides or surfaces already-created staff work from the queue view.
  - Hard guard: never deletes service requests and never bypasses workflow source/axis contracts.
- `staff.customer_next_action`
  - Runtime: `PersonWorkspaceService.queueCard` and `TaskBriefModal`.
  - Effect: computes a per-card strategy proof and safely reorders staff CTAs such as call, note, schedule, email, customer detail, snooze, and done.
  - Hard guard: unsupported CTA ids are ignored, raw buttons/scripts are not rendered, and the strategy cannot auto-send mail or auto-open customer requests.
- `staff.call_brief_generation`
  - Runtime: `PersonWorkspaceService.queueCard`, `PersonWorkspaceService.taskBrief`, and `TaskBriefModal`.
  - Effect: computes a per-card strategy proof and safely reorders modal guidance steps from stored resolver/customer signals.
  - Hard guard: does not re-read full transcripts when resolver output is already stored, does not expose internal workflow/debug labels, and does not allow raw prompt-generated HTML.
- `customer_portal.reorder_eligibility`
  - Runtime: `AccountsService.createReorderCart`.
  - Effect: adds a strategy visibility and score gate to customer reorder cart creation.
  - Hard guard: customer ownership, catalog variant matching, variant availability, checkout creation, and payment safety stay in native Accounts/Shopify services. Strategy can block an item; it cannot force an unavailable variant into checkout.
- `mail_marketing.audience_eligibility`
  - Runtime: `MailMarketingService.resolveAudience`.
  - Effect: filters and sorts contacts after the saved audience filters resolve against the customer/mail graph.
  - Hard guard: strategy does not replace consent, suppression, Shopify/customer graph, or explicit audience filter resolution.
- `mail_marketing.send_safety`
  - Runtime: `MailMarketingService.queueCampaign` and `MailMarketingService.processFlowEnrollmentNode`.
  - Effect: adds a final strategy gate before campaign or flow delivery proof is recorded.
  - Hard guard: existing category enablement, quiet hours, frequency caps, daily caps, template approval, consent, suppression, and provider-mode checks remain mandatory and cannot be loosened by strategy.

Do not tell the owner a strategy affects production unless it appears in the runtime binding matrix and the current deploy contains that code.

### Staff runtime proof fields

When a staff strategy is runtime-bound, the staff API carries proof on each affected card. Use this proof before claiming a strategy changed the screen.

Daily task cards and task brief cards may include:

```json
{
  "ctaPriority": ["call", "note", "schedule"],
  "modalActionOrder": ["call_customer", "confirm_need", "capture_outcome"],
  "strategyProof": {
    "nextAction": {
      "surfaceId": "staff.customer_next_action",
      "score": 84,
      "bandId": "urgent",
      "bandLabel": "Needs fast follow-up",
      "tone": "danger",
      "ctaPriority": ["call", "note", "schedule"]
    },
    "callBrief": {
      "surfaceId": "staff.call_brief_generation",
      "score": 84,
      "bandId": "urgent",
      "bandLabel": "Needs fast follow-up",
      "tone": "danger",
      "modalActionOrder": ["call_customer", "confirm_need", "capture_outcome"]
    }
  }
}
```

Rules for agents:

- `ctaPriority` only reorders known staff actions. Unknown ids are ignored.
- `modalActionOrder` only reorders known guidance steps. Unknown ids are ignored.
- The modal still uses stored resolver/customer/order data; it must not re-send the full transcript to a model just to reorder buttons.
- The strategy proof is operator evidence, not customer-facing copy.
- If these fields are missing from the API response, the strategy is not active in that deployed runtime even if a draft exists.

### Strategy JSON shape

A strategy is controlled JSON:

```json
{
  "surfaceId": "staff.daily_call_list.ranking",
  "name": "Refund and repeat-call daily ranking",
  "status": "draft",
  "definition": {
    "schemaVersion": 1,
    "surfaceId": "staff.daily_call_list.ranking",
    "description": "Prioritize payment/refund friction and repeat calls for the daily call list.",
    "weights": {
      "urgencyScore": 4,
      "refundOrPaymentIssue": 8,
      "repeatCount": 5,
      "purchaseIntent": 3
    },
    "conditions": [],
    "visibility": {
      "mode": "show_by_default",
      "showWhen": [],
      "hideWhen": []
    },
    "sort": [
      { "field": "urgencyScore", "direction": "desc", "nulls": "last" },
      { "field": "createdAt", "direction": "desc", "nulls": "last" }
    ],
    "cooldown": {
      "hideIfOpenTaskExists": true,
      "reappearAfterHours": 360
    },
    "scoreBands": [
      { "id": "urgent", "label": "Needs fast follow-up", "min": 80, "max": 10000, "tone": "danger", "cta": "call" }
    ],
    "ctaPriority": ["call", "note", "schedule"],
    "modalActionOrder": ["call_customer", "confirm_need", "capture_outcome"]
  }
}
```

Allowed levers:

- `weights`: how much a known signal contributes to ranking.
- `conditions`: bounded boolean/numeric/string checks that can add score.
- `visibility`: show/hide logic. This does not delete data.
- `sort`: tie-breakers after scoring.
- `cooldown`: reappearance and duplicate suppression policy.
- `scoreBands`: business-facing labels for score ranges.
- `ctaPriority`: which staff action should appear first.
- `modalActionOrder`: which instruction blocks appear first in a staff modal.

Forbidden levers:

- raw SQL
- arbitrary code
- network calls
- token or secret access
- tenant scope changes
- auth or RBAC changes
- checkout/payment changes
- webhook secret changes
- destructive queue/worker behavior

### Safe algorithm workflow

Always use this order:

1. `list_algorithm_surfaces`
2. `get_algorithm_contract`
3. `draft_algorithm_change`
4. `validate_algorithm_change`
5. `simulate_algorithm_change`
6. `compare_algorithm_versions` when replacing an active strategy
7. Explain the diff to the user
8. `publish_algorithm_version` only after explicit human approval
9. `rollback_algorithm_version` if the result is not acceptable

Publishing without simulation is not allowed. Publishing a strategy with only a limited simulation is not acceptable for a surface that must affect live ranking.

### What simulation must prove

For `staff.daily_call_list.ranking`, simulation should answer:

- What changed in Linda's last 7 days queue?
- Which tasks moved into the top list?
- Which tasks disappeared from the visible sample?
- Did the newest real customer calls remain visible?
- Are internal labels such as workflow rule, axis, or AI hidden from staff-facing text?

For `staff.priority_kanban.customer_score`, simulation should answer:

- Who is in the top 20 before and after?
- Which assigned Shopify segment caused each customer to appear?
- Which customer moved up because of last order, recent call, open follow-up, or repeat activity?
- Which customers became hidden or newly surfaced?

For mail and customer portal surfaces, simulation must prove:

- consent/suppression/ownership guards were preserved
- no send, checkout, payment, or destructive mutation happened
- eligible/blocked counts are explained

Native simulation coverage:

- `staff.daily_call_list.ranking`
  - Sample source: recent tenant-scoped `ServiceRequest` rows for sales/account work created from call analysis, matched rules, source calls, source email, or workflow metadata.
  - Member filter: pass `memberEmail` to simulate Linda/Ihsan/Charlotte-specific queue impact.
  - Safety proof: simulation never creates, updates, deletes, transfers, archives, or closes a task; it only scores the bounded live sample.
  - Useful diff: which daily cards moved in the visible list, which cards became hidden or surfaced, and why the score changed.
- `staff.priority_kanban.customer_score`
  - Sample source: `SegmentOwnership -> SegmentCustomerMembership -> Customer`, including customer insight, open service requests, and latest Shopify order context.
  - Member filter: pass `memberEmail` to restrict simulation to that staff member's assigned Shopify segments.
  - Safety proof: strategy cannot add customers outside the owner's segment scope and cannot mutate segment membership.
  - Useful diff: top customer movement, hidden/surfaced customers, last order/open follow-up/repeat activity impact.
- `staff.task_visibility`
  - Sample source: the same bounded sales/account call-analysis service requests used by the Daily Call List.
  - Runtime lever: `visibility.showWhen`, `visibility.hideWhen`, `cooldown.reappearAfterHours`, and `cooldown.archiveAfterDays`.
  - Safety proof: hidden means "not shown on this staff surface now"; it does not delete or close the underlying service request.
  - Useful diff: visible count, hidden count, surfaced count, and archive/reappearance boundary impact.
- `staff.customer_next_action`
  - Sample source: bounded live staff task cards and stored task/customer/order signals.
  - Runtime lever: `ctaPriority` plus score/condition/sort fields from the surface contract.
  - Safety proof: strategy can reorder only known staff actions such as call, note, schedule, email, customer detail, archive, transfer, done, snooze, more, and pin.
  - Useful diff: CTA order changed from baseline to candidate, plus any score/rank/visibility changes.
- `staff.call_brief_generation`
  - Sample source: bounded live staff task cards with stored resolver/customer/order signals.
  - Runtime lever: `modalActionOrder` plus score/condition/sort fields from the surface contract.
  - Safety proof: simulation and runtime do not re-read full transcripts when stored resolver output already exists; no raw prompt HTML or internal debug labels are exposed.
  - Useful diff: modal action order changed from baseline to candidate, plus any score/rank/visibility changes.
- `customer_portal.reorder_eligibility`
  - Sample source: recent tenant-scoped `CommerceOrder` rows and their Shopify line-item JSON.
  - Variant context: the simulator resolves SKU or Shopify variant id against `CatalogVariant` and `CatalogProduct`.
  - Safety proof: ownership remains customer/order scoped; unavailable catalog variants stay blocked; no cart, checkout, draft order, or payment mutation happens.
  - Useful diff: which line items became eligible, blocked, or moved in score/rank.
- `mail_marketing.audience_eligibility`
  - Sample source: recent `MailContact` rows with marketing consent and active suppression state, joined to customer and segment context when available.
  - Safety proof: unsubscribed, suppressed, and unsendable contacts remain visible to the simulation as blockers; the strategy cannot override the core audience filter contract.
  - Useful diff: which contacts moved into or out of the eligible sample and why.
- `mail_marketing.send_safety`
  - Sample source: recent frozen snapshot members when available; otherwise recent contacts are used as a bounded safety sample.
  - Safety proof: no email is sent, no provider credential is touched, and existing quiet-hour/frequency/provider/template guards remain native service guards.
  - Useful diff: which recipients would be held before delivery proof is recorded.

If any algorithm simulation returns `limited`, do not publish that strategy. It means the contract exists but the current deployed backend cannot yet prove the native impact for that surface.

### Explanation tools

Use `explain_customer_ranking` when the user asks why a customer is high or low in Priority kanban.

The answer should mention business signals:

```text
Score 92 is in "Needs fast follow-up".
segmentPriority contributed 30.
repeatCount contributed 12.
totalSpent contributed 18.
```

Do not answer with internal implementation labels:

```text
Resolver returned U4.2.
Workflow trace matched action a1.
Axis sales boosted score.
```

Use `explain_task_visibility` when the user asks why a call task is visible, hidden, delayed, or archived.

### Hard examples

Example prompt:

```text
For Linda, make refund/payment calls appear above normal purchase intent calls for the last 7 days. Keep newest calls high, but do not show duplicate tasks if the customer already has an open follow-up for the same intent. Put Call first, Note second, Schedule third. Simulate before publishing.
```

Expected tool flow:

1. `get_algorithm_contract` for `staff.daily_call_list.ranking`
2. `draft_algorithm_change`
3. `validate_algorithm_change`
4. `simulate_algorithm_change` with `memberEmail`
5. summarize top moved tasks, hidden count, surfaced count
6. wait for approval before `publish_algorithm_version`

Example prompt:

```text
In Priority kanban, rank assigned segment customers by last order value, repeat calls, and open follow-up. Customers with no phone should still be visible but lower priority. Explain why Salvador moved into the top 20.
```

Expected tool flow:

1. `get_algorithm_contract` for `staff.priority_kanban.customer_score`
2. draft/validate/simulate
3. `explain_customer_ranking` for the named customer id

Example prompt:

```text
Show a call again 15 days after the source call only if the customer has not purchased and no open follow-up exists.
```

This can be either:

- workflow deferred materialization when a new hidden future task must be created, or
- strategy cooldown/reappearance when existing work should reappear in a queue.

Do not mix them. If the request says "create staff work 15 days later", use deferred workflow action. If the request says "make this existing work visible again later", use algorithm cooldown/reappearance.

### Patch lane

If the user asks for real algorithmic source-code changes instead of strategy DSL:

1. Explain that strategy DSL should be tried first.
2. If code is still required, use the source patch lane.
3. Only allow listed files and modules.
4. Generate a patch plan.
5. Run typecheck/build.
6. Produce fixture/API/screenshot evidence as relevant.
7. Wait for human approval before deploy.

The agent must not edit auth, tenant scope, RBAC, checkout/payment, webhook secret, raw SQL, Prisma tenant extension, or destructive worker behavior.

## Agent Instruction Summary

When asked to create a rule:

1. Convert the business sentence into operational intent.
2. Resolve product family, role, category, SKU, and collection from live Shopify catalog language.
3. Treat exclusions as exclusions, not target conditions.
4. Add prior purchase or owned machine guards when requested.
5. Add duplicate guard unless every-occurrence behavior is explicitly requested.
6. Choose `sales` or `account`.
7. Choose routing: named member, call owner, or segment owner.
8. Add watcher/escalation only when requested or clearly justified by repeat-call/strong sentiment.
9. Reject support case, direct mail, destructive, or Shopify mutation requests.
10. Draft, validate, simulate, then store as draft. Publish only after fresh simulation proof.
