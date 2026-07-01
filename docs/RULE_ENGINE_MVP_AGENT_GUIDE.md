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
GET /api/v1/rules/mcp/capabilities
GET /api/v1/rules/mcp/agent-guide
```

Agents should discover the markdown through `agentGuide.endpoint` in capabilities and read it through `read_workflow_agent_guide`. Users should not need to paste this markdown into a separate MVP prompt.

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
