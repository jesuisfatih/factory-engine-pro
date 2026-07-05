# Mail Template, Mail Marketing, Customer Portal Deep Inventory

Date: 2026-07-04

Scope:
- Mail Template transfer inventory.
- Mail Marketing transfer inventory.
- Customer portal order, invoice, cart, and reorder lifecycle inventory.

This document compares the old system under `C:\Users\mhmmd\Desktop\eagle-engine.dev\eagledtfprint` with the new `factory-engine-pro` architecture. The old system is read-only reference. The target implementation must keep the new pure logic model intact: `Tenant -> Member / Customer -> CustomerUser -> SubUser`, tenant-enforced Prisma access, service-to-service module boundaries, typed contracts, queue-backed side effects, and no mock/seed/static UI.

## Executive Result

The new repository has useful first-pass scaffolding for mail and customer portal, but it is not equivalent to the old production behavior yet.

Initial inventory state at the start of this transfer:
- Transactional mail delivery exists in the new backend, but the old mail center operations are not fully transferred.
- Email template workspace exists, but it is shallow: no real revision lifecycle, no event binding activation, no approval gate, no block/snippet/profile system, no real test send.
- Mail marketing exists as a disabled shell: contacts, audiences, templates, and flows are listed, but flow runtime, campaign sending, snapshots, suppression, consent, attribution, and delivery history are missing.
- Customer portal exists with pages for orders, invoices, products, documents, support, and reorder, but core old behavior is missing: order detail, item-level reorder, cart checkout, real invoice/payment lifecycle, property-rich line item inspection, and Shopify customer-scoped visibility parity.

Note:
- This document is both an inventory and an implementation ledger. Later "implemented in this pass" sections supersede the initial-state bullets above where they provide concrete files, migrations, and verification.

Decision:
- Do not start ROADMAP item 30 or 31 implementation until this inventory is accepted.
- When implementation starts, keep provider sends disabled unless explicitly enabled per tenant. Disabled mode must still create real `MailDelivery` records with `queued_disabled`, so UI, logs, and evidence are real.
- Customer portal transfer is a separate Commerce/Accounts workstream, but it must share the same customer identity, order, cart, invoice, and mail-event surfaces with mail marketing.
- UIX composition is a hard acceptance gate for all three modules. Backend parity is not enough. Before implementation, each module must have a clear first viewport, primary action hierarchy, empty/loaded/error states, and role-safe terminology.
- Canonical UIX source of truth: `docs/migration/three-module-uix-composition.md`, especially `2026-07-05 Product Composition Brainstorm: Useful, Ordered, Efficient`, `2026-07-05 Authoritative UIX Decision Board: Useful Before Rich`, `2026-07-05 Final Composition Lock: No-Confusion Route Shape`, `2026-07-05 Concrete Composition Brainstorm: Think Before Adding UI`, `Non-Negotiable UIX Outcome: Order, Speed, No Confusion`, `Final Canonical Brainstorm: Useful Before Dense`, `Composition Brainstorming Record`, `First-Viewport Blueprints`, and `Efficiency Guardrails`. If older repeated brainstorming notes in this inventory conflict or feel softer, that file wins. Do not add more duplicate UIX brainstorm blocks here; update the canonical contract instead.
- Implementation order for each screen is fixed: brainstorm composition first, bind real backend data second, then implement layout/styling. A screen with working APIs but confusing first viewport remains incomplete.

## UIX-First Implementation Blocker

This section is intentionally placed before the source inventory and gap matrix. The old system is useful for behavior discovery, but it must not be copied as visual structure when the result would confuse users. The new implementation must be easier to operate than the old one.

Main product rule:
- A screen is not production-ready until a first-time user can understand where they are, what matters now, and what safe action comes next.
- Data completeness does not compensate for bad composition.
- A generic table full of columns is not a usable workflow.
- A modal that opens with raw history, JSON, logs, or internal ids is not acceptable for the primary user path.
- Every visible number must explain whether it is live, frozen, eligible, skipped, disabled, due, paid, or failed.

Before coding any screen in these three modules, write the screen composition in this document or the implementation PR:
- role: who uses this screen;
- job: what single job the screen exists for;
- first viewport: what must be visible without scrolling;
- primary CTA: the one safest action for the current state;
- secondary actions: quiet actions that do not compete with the primary CTA;
- hidden detail: what moves behind click/tabs/advanced area;
- data source: which real endpoint/table powers each visible count;
- disabled states: what blocks each CTA and how the UI explains it;
- empty/loading/error states: what the user sees when there is no data, slow data, or failed data;
- forbidden vocabulary: internal words that must not appear for that role.

### Authoritative UIX Composition Standard

This section is the product gate for all three modules. If later notes repeat the same idea with softer wording, this section wins. The implementation is not acceptable when the API is correct but the screen still forces the user to guess what is live, what is safe, what is blocked, or what action will happen next.

### Canonical Three-Module UIX Brainstorm: Order, Speed, No Confusion

This is the required thinking layer before implementation. The old system is a behavior reference, not a composition reference. The new screens must be calmer, faster, and more obvious than the old screens. If the user has to ask "what am I supposed to do here?", the module is not production-ready even when every endpoint works.

Shared UIX thesis:
- Each module gets one dominant mental model. Mail Template is a protected release lane. Mail Marketing is a recipient decision room. Customer Portal is a buyer account desk.
- The first viewport must never start with raw data. It starts with the current business state, the next safe action, and the few numbers that change the decision.
- Internal proof is still required, but proof belongs after the decision layer or inside a clearly named detail area.
- A screen cannot use the same visual treatment for live preview, frozen snapshot, draft, active version, disabled proof, payable invoice, review-only cart, eligible reorder, and blocked reorder.
- Long lists must be search-first, paginated, virtualized, or grouped by a user decision. Full-table dumping is a UIX bug.
- Every primary CTA must be state-derived. If two or more buttons look equally important, the screen is not composed yet.
- Every empty, loading, error, disabled, and long-list state must explain the next possible business action in plain language.
- Role-safe terminology is mandatory. Customers never see provider, tenant, workflow, queue, suppression internals, raw Shopify JSON, or staff-only proof. Operators never need code names unless they open an advanced proof panel.
- Light mode, dark mode, laptop width, and narrow/mobile layout are part of acceptance, not polish.

Module 1, Mail Template composition:
- User mental model: "I am changing a customer-facing email without accidentally changing the live email."
- First viewport must answer: which event/template is selected, which version is active, whether a draft exists, whether the draft has been tested, whether it is approved, whether provider sending is enabled, and what release action is currently safe.
- Main composition: selector and status strip at top, rendered preview/editor in the center, release checklist beside or directly below the action area, revision/proof details below.
- Primary CTA sequence is state-based: create draft -> save draft -> preview/test -> approve -> publish -> activate. These actions must not appear as equal random buttons.
- Secondary actions: duplicate, archive, compare revision, view delivery proof, edit raw source, inspect variables.
- Hidden detail: raw HTML, CSS source, variable JSON, provider payload, delivery trace, audit diff.
- No-confusion rule: saving a draft must never look like the live email changed; sending a test must never look like approval; publishing must not silently change an event binding without a confirmation summary.

Module 2, Mail Marketing composition:
- User mental model: "I am deciding exactly who will be contacted, why they qualify, who is blocked, and whether communication is real or proof-only."
- First viewport must answer: provider mode, live audience estimate, frozen snapshot count, suppressed/blocked count, final eligible count, selected approved template, and current send readiness.
- Main composition: campaign or audience pipeline, not a generic automation table. The visible order is audience definition -> live preview -> freeze snapshot -> template selection -> blocker review -> queue/send or disabled-proof record.
- Audience builder must use business-readable criteria: Shopify segment, product/SKU/family purchased, order count, revenue, last order date, owner/member, lifecycle, tags, consent state, suppression state.
- Live preview and frozen snapshot must be visually different. Preview is moving data; snapshot is the send list.
- Work queues should show only decisions needing action: stale snapshot, no approved template, blocked recipients, provider disabled, failed/skipped delivery, consent problem.
- Hidden detail: raw flow JSON, webhook payload, provider event payload, per-recipient debug trace, analytics drilldown.
- No-confusion rule: blocked recipients cannot be counted as reachable, disabled proof cannot look like a sent customer email, and flows/campaigns cannot collapse into a vague "automation" surface.

Module 3, Customer Portal composition:
- User mental model: "I am a buyer trying to find my order, invoice, reorder option, cart, or account document quickly."
- First viewport must answer: open invoices, recent orders, reorder-ready items, active cart/review state, and the next useful action.
- Main composition: account home is action-card first; orders, invoices, and reorder lists are search-first with page-size control. Deep order and reorder detail opens as a centered modal or full page, not a narrow side drawer.
- Order detail starts with customer-useful facts: status, total, tracking, line items, item properties, files/proofs when allowed, invoice/payment state, and reorder eligibility.
- Reorder must support safe item-level action: reorder full order, reorder eligible item, continue cart, or request account review when checkout cannot be created safely.
- Hidden from customers forever: staff notes, internal audit payloads, provider names, tenant ids, workflow/routing/source fields, raw Shopify JSON, marketing suppression internals.
- No-confusion rule: a review request must not look like checkout success, a placeholder invoice must not look payable, and unavailable reorder items must show a readable reason.

Screen-level composition rule before code:
- For each screen, write one sentence: "This screen exists so [role] can [job] safely."
- Then define: first viewport, primary CTA, secondary actions, hidden detail, real data source, disabled reasons, empty state, error state, and forbidden vocabulary.
- If those answers are not clear, do not implement the UI yet.

### Final UIX Composition Contract: Clear, Efficient, No-Confusion

This is the product-thinking pass that must happen before code in all three modules. The goal is not to expose every capability. The goal is a calm, ordered workflow where the user immediately understands:
- where they are;
- which state matters now;
- what action is safe;
- why an action is blocked;
- where proof/history lives if they need it.

The UIX rule is stricter than backend parity:
- A complete endpoint with a confusing screen is still incomplete.
- A screen with correct data but unclear action hierarchy is still incomplete.
- A screen that requires the user to understand internal implementation language is still incomplete.
- A screen that works only in one viewport, one theme, or one data-size case is still incomplete.

Composition rhythm for every page:
1. **Orient:** title, role-safe description, selected entity, current business state.
2. **Prioritize:** only the counts that change what the user should do next.
3. **Decide:** show the context required for the next safe decision.
4. **Act:** one dominant action for the current state; secondary actions stay quiet.
5. **Prove:** delivery/order/payment/cart/history evidence after the action layer.
6. **Recover:** empty, loading, disabled, and error states explain the next possible step.

#### Module 1: Mail Template UIX

Core user problem:
- "I am changing a customer-facing email and I must not accidentally ship the wrong version."

First viewport composition:
- Left/top selector: business event or template family.
- Status strip: active email, draft change, test state, approval state, provider mode, event binding.
- Main workspace: rendered preview and editable draft controls.
- Release checklist: missing variables, preview readiness, test proof, approval, publish/activation readiness.
- One primary CTA based on state: create draft, save draft, send test, approve, publish, or activate.

Efficient action sequence:
1. Select event/template.
2. Create or open draft.
3. Edit content and variables.
4. Preview with a real profile.
5. Send real test or record disabled-provider proof.
6. Approve.
7. Publish and activate with a visible binding-change summary.

What stays hidden until detail:
- raw HTML/source;
- revision diff;
- variable JSON;
- provider response;
- delivery log;
- audit trail.

Confusion to prevent:
- Draft save must never look like live customer email changed.
- Test send must never look like approval.
- Publish must never silently imply activation unless the confirmation states exactly which binding changes.
- Disabled provider proof must not use language that suggests a customer email was sent.

#### Module 2: Mail Marketing UIX

Core user problem:
- "I am deciding who will be contacted, why, and whether it is safe to queue communication."

First viewport composition:
- Summary strip: provider mode, live audience count, frozen snapshot count, blocked recipients, final eligible recipients, send readiness.
- Work queue: campaigns needing review, stale snapshots, failed/skipped deliveries, consent/suppression issues.
- Main tabs: Contacts, Audiences, Campaigns, Flows, Delivery, Consent.
- Selected work surface: recipient review before creative editing or delivery action.
- One primary CTA based on pipeline state: preview audience, freeze snapshot, choose template, review blockers, queue/send, or record disabled proof.

Efficient action sequence:
1. Define audience in business language.
2. Preview live matches and exclusions.
3. Freeze campaign snapshot.
4. Attach approved template.
5. Review blockers: missing email, unsubscribed, suppressed, frequency capped, provider disabled.
6. Queue/send or record disabled proof.
7. Monitor delivery evidence and failed/skipped rows.

What stays hidden until detail:
- raw flow JSON;
- webhook payload;
- provider event payload;
- per-recipient debug trace;
- analytics that does not affect send readiness.

Confusion to prevent:
- Live audience preview and frozen snapshot must look different.
- Blocked recipients must not be counted as reachable.
- Disabled-provider proof must not look like real customer delivery.
- Campaigns and flows must not collapse into a vague automation page.
- Consent/suppression cannot be buried in logs; it is a first-layer blocker.

#### Module 3: Customer Portal UIX

Core user problem:
- "I am a buyer trying to understand my account, orders, invoices, and safe reorder options."

First viewport composition:
- Account context: customer/company identity only when useful.
- Action cards: recent orders, open invoices, reorder-ready items, active cart or review request.
- Search-first lists: orders, invoices, reorderable items, and cart history must not render unbounded data.
- Detail entry: order/invoice/cart detail opens centered or as a full page, not a narrow side drawer for deep data.
- One primary CTA based on context: view order, reorder item/order, continue cart, download invoice, pay invoice, or contact staff.

Efficient action sequence:
1. Customer opens account home, orders, invoices, or reorder.
2. System shows real linked records and clearly explains missing linkage.
3. Customer opens an order and sees status, total, tracking, line items, item properties, design files, and reorder eligibility.
4. Customer reorders all eligible items or one eligible item.
5. System creates a persisted cart, real checkout URL when confirmed, or an account-review request when checkout cannot be safely created.
6. Customer can return to the same cart, order, or invoice without losing context.

What stays hidden forever from customer UI:
- tenant;
- provider;
- workflow;
- queue;
- source/axis/routing;
- campaign/suppression internals;
- staff notes;
- raw Shopify JSON;
- internal audit payloads.

Confusion to prevent:
- Placeholder/derived invoices must not look payable.
- Review request must not look like checkout success.
- Unavailable reorder items must show a customer-safe reason.
- Item properties and design-file details must be readable, not raw JSON.
- Customer must never see staff/admin/marketing implementation language.

Implementation acceptance for all three modules:
- The first viewport can be explained in one sentence.
- The primary action is unambiguous and state-driven.
- Every disabled action has a business-language reason.
- Long lists are paginated, searchable, or virtualized.
- Empty, loading, error, loaded, disabled, and long-list states are all designed before wiring.
- Light mode, dark mode, laptop width, and narrow/mobile view are checked before the module is considered done.

### 2026-07-04 UIX Brainstorm: No-Confusion Blueprint

This is the practical composition blueprint to use before building or refactoring any screen in Mail Template, Mail Marketing, or Customer Portal. The rule is simple: the UI must be orderly, usable, efficient, and free of role confusion. A screen that exposes every backend capability but makes the user think is still unfinished.

Shared composition thesis:
- The first layer is for orientation and safe action, not for history or debugging.
- The second layer is for business context that explains the action.
- The third layer is for proof, audit, logs, raw payloads, and advanced data.
- Every page needs a single dominant job, a single dominant next action, and one clearly named proof area.
- Every repeated list must explain why it exists and what the row lets the user do.
- Long lists are search-first with page-size control or virtualization. Rendering a full customer/contact/order universe is forbidden.
- A modal opens with decision context and the recommended next action. It must not open on raw JSON, long history, internal ids, or low-value metadata.
- The same visual treatment cannot be used for states with different consequences. Draft, active, preview, snapshot, payable, review-only, eligible, blocked, sent, and disabled-proof must look different.
- Empty, loading, error, and disabled states are product states. They must explain the next possible step in business language.
- Dark mode, light mode, and narrow laptop layout are acceptance gates. Unreadable contrast, tiny text, clipped values, and hidden CTAs are production bugs.

Module composition, first-pass mental sketch:

| Module | Screen should feel like | First viewport must answer | Dominant action | Secondary area | Hidden/advanced area |
| --- | --- | --- | --- | --- | --- |
| Mail Template | Protected release lane | What email is live, what draft exists, is it tested/approved, and what can be safely released? | State-based release action: create draft, save, test, approve, publish, activate. | Rendered preview, variables, readiness checklist. | Raw HTML, provider trace, revision diff, delivery proof, variable JSON. |
| Mail Marketing | Recipient control room | Who will be contacted, why, who is blocked, what template is selected, and is sending real or proof-only? | Staged send action: preview, freeze snapshot, review blockers, queue/send or record disabled proof. | Audience/contact/campaign/flow work queues and recipient review. | Raw flow JSON, webhook payloads, per-recipient trace, analytics depth. |
| Customer Portal | Buyer account desk | What did I order, what can I reorder, what invoice is real, and what should I do next? | Context action: view order, reorder item/order, download/pay invoice, continue cart, request review. | Recent orders, open invoices, reorderable items, cart/review state. | Internal audit, raw Shopify payloads, staff-only notes, integration proof. |

Mail Template composition brainstorm:
- The operator's fear is accidental production change. The screen must calm that fear before it shows editing power.
- Top strip must show active email, draft change, approval state, test state, provider mode, and event binding.
- The editor can be large, but it cannot hide release readiness.
- Save, test, approve, publish, and activate are not equal actions. Only the state-appropriate action should be visually dominant.
- A test in disabled provider mode must read as "test recorded" or "disabled delivery recorded", not as customer delivery.
- The publish modal must describe exactly what customer-facing binding changes.
- A useful template row shows event, active version, draft status, readiness, and last proof. It does not force the user to open a log to know if it is safe.

Mail Marketing composition brainstorm:
- The operator's fear is contacting the wrong people. Recipient truth must appear before creative editing or analytics.
- The first viewport must distinguish live audience preview from frozen campaign snapshot.
- Contact detail must be business-useful: identity, consent, suppression, audience memberships, recent deliveries, and recent customer events. Raw identities stay advanced.
- Campaigns use a guided pipeline: audience -> snapshot -> approved template -> blocker review -> queue/send/proof -> delivery evidence.
- Flows use canvas plus inspector, but the top summary must answer who enters, what happens first, what stops the flow, and what proof exists.
- Suppression, unsubscribe, bounce, complaint, and missing-email states are blockers with labels, not debug details.
- Provider disabled mode is allowed, but it must be visually and verbally different from a real send.

Customer Portal composition brainstorm:
- The buyer's goal is account clarity, not internal proof. The screen must feel like an account desk.
- The first viewport should show recent orders, open invoices, reorder-ready items, and active cart or review state.
- Orders, invoices, reorder, and carts each need their own state labels. Do not merge them into a generic account table.
- Order detail must be centered or full-page for deep inspection. It starts with status, total, tracking, line items, properties, files, and reorder eligibility.
- Item-level reorder must show eligibility and unavailable reason per item.
- Invoice actions must only look payable/downloadable when real backend records or URLs exist.
- Review-only reorder outcomes must look different from checkout success.
- Customer copy must never include tenant, provider, workflow, queue, source, axis, campaign, suppression, staff routing, or raw integration language.

Concrete no-confusion build rule:
- Before adding a route/component, write its composition in this document or PR: role, job, first viewport, primary action, secondary actions, hidden details, real data source, disabled reason, empty/loading/error copy, and forbidden terms.
- If this cannot be written clearly, the screen design is not ready for implementation.
- If implementation reveals new states, update this blueprint before adding more controls.

### Canonical UIX Decision Record: Three-Module Composition

This is the required thinking record before implementation. The core acceptance condition is not visual polish. The core condition is that the screen is orderly, usable, efficient, and does not create user confusion. Old-system behavior may define capability parity, but the new UI must be composed around the user's decision, not around old tables, old routes, or backend model names.

Shared product thinking:
- Each module must answer one primary human question in the first viewport.
- Each module must make the next safe action obvious without training.
- Each module must separate action context from proof/history/debug data.
- Each module must use role-safe vocabulary. Customers must not see internal workflow or provider language. Staff/admin users should see business labels before technical proof.
- Counts are only useful when the label explains what they count: live, frozen, eligible, blocked, sent, disabled, paid, due, failed, reorderable, or review required.
- A list that can grow must be search-first and paginated or virtualized before production.
- A modal must open with decision context and next action. Raw history, payloads, logs, JSON, and audit evidence belong below the useful summary.
- Light mode, dark mode, laptop width, and mobile/narrow states are product gates. Broken contrast, tiny text, clipped buttons, or hidden phone/order values are not cosmetic issues.

Module 1, Mail Template:
- Mental model: protected release desk for customer-facing emails.
- First viewport question: "Which email is live, what draft exists, is it tested and approved, and what is the next safe release step?"
- Composition: a top status strip shows selected business event, active version, draft version, test state, approval state, provider/send mode, and current binding. The main workspace shows the rendered draft/editor. A release checklist stays close to the primary CTA. Revision history, raw HTML, variables, provider trace, and delivery proof are below or behind tabs.
- Primary action hierarchy: one state-driven CTA only. The sequence is create draft -> save draft -> send test -> approve -> publish -> activate. These actions must never appear as equal-weight buttons because they do not carry equal risk.
- Empty state: explains how to create the first template for a business event and why it will not affect live mail until activated.
- Error state: names the blocked release reason in business language, for example missing variables, failed render, provider disabled, missing approval, or no active binding.
- Confusion to prevent: an operator saves a draft and thinks live customer email changed; an operator sends a test and thinks the template is approved; an operator publishes without understanding which event binding will change.

Module 2, Mail Marketing:
- Mental model: recipient decision and campaign control room.
- First viewport question: "Who will be contacted, why, who is blocked, which approved template is selected, and is this a real send or disabled proof?"
- Composition: top KPIs show provider mode, live audience count, frozen snapshot count, blocked/suppressed count, final eligible count, and send readiness. The work surface is a staged pipeline: audience preview -> freeze snapshot -> choose approved template -> review blockers -> queue/send or record disabled proof. Flow/campaign internals, per-recipient traces, raw webhook payloads, and analytics depth stay behind detail.
- Primary action hierarchy: recipient safety comes before creative editing and before automation controls. The user cannot queue or send until the screen proves snapshot, consent/suppression, template readiness, and provider mode.
- Empty state: explains the next safe setup step: connect contacts, define an audience, create a campaign, or enable provider sending.
- Error state: tells whether the user is blocked by missing audience, missing snapshot, unapproved template, suppression/consent blockers, provider disabled state, or queue failure.
- Confusion to prevent: user mistakes a moving live preview for the frozen send list; user sees blocked recipients counted as reachable; user believes disabled-provider proof actually sent customer email.

Module 3, Customer Portal:
- Mental model: buyer self-service account desk.
- First viewport question: "What did I order, what can I reorder, what invoice is real, and what action can I safely take now?"
- Composition: customer home prioritizes open invoices, active cart/review state, reorderable recent items, and recent orders. Orders and invoices are search-first with page-size control. Order detail opens as a centered/detail-focused modal or page, not a narrow side drawer, and starts with customer-useful summary: status, total, tracking, line items, item properties, files, and reorder eligibility. Internal proof goes below the customer action layer.
- Primary action hierarchy: context actions only: view order, reorder item/order, continue cart, request review, download invoice, pay invoice, contact staff. Payment/download/checkout actions must only look active when the backend has a real URL or real persisted state.
- Empty state: gives the buyer a useful next step: browse products, contact staff, or check another account email if no records are linked.
- Error state: explains whether records cannot load, the customer is not linked, a Shopify order is unavailable, a variant cannot be reordered, a payment link is missing, or account review is required.
- Confusion to prevent: customer mistakes review request for checkout success; customer sees a placeholder invoice as payable; customer sees internal staff/marketing/workflow terms; customer cannot read item properties or design-file context.

Cross-module composition guardrails:
- Do not copy old-system layout when the old layout mixes unrelated decisions.
- Do not use one generic table for all three modules.
- Do not let a secondary metric compete with the primary action.
- Do not use identical card colors or badges for states with different consequences.
- Do not put raw implementation words in first-layer copy. Translate `workflow`, `queue`, `source`, `axis`, `provider`, `snapshot_member`, and raw enum names into business language.
- Do not show admin/staff evidence to customers.
- Do not hide the reason for a disabled action. A disabled action without a business reason looks broken.
- Do not call a module complete from backend parity alone. Every module needs empty, loaded, error, disabled, and long-list states bound to real data.

Implementation consequence:
- Before coding a screen, write the first viewport, primary CTA, secondary actions, hidden details, data sources, forbidden terms, empty state, loading state, and error state.
- During implementation, bind the visible numbers to real endpoints first, then add styling.
- Before marking a module done, capture evidence that a first-time user can understand the page without reading logs or source code.

Design principle:
- The first layer must be a decision surface, not a data dump.
- The second layer must be business context that explains the decision.
- The third layer may hold proof, history, audit, and advanced details.
- A user should never need to read raw ids, enum names, logs, JSON, provider payloads, or backend terminology to complete the normal workflow.
- Every page needs one dominant job, one dominant next action, and one clearly labeled proof area.

The common screen composition is:
1. Orient: identify the account/module, current state, and why this page exists.
2. Prioritize: show the work that matters now, not every possible metric.
3. Decide: show only the context required to choose the next safe action.
4. Act: expose one primary action for the current state, with quiet secondary actions.
5. Prove: show history, delivery/payment/cart/order proof after the action context is clear.
6. Recover: empty, loading, disabled, and error states must explain the next possible step.

Module-specific composition contract:

| Module | Product composition | First viewport must answer | Primary action rule | Detail can contain | Must not happen |
| --- | --- | --- | --- | --- | --- |
| Mail Template | Protected release lane | Which email is active, what draft exists, is it tested/approved, can it be safely published/activated? | State machine only: create draft -> save -> test -> approve -> publish -> activate. Do not show all as equal buttons. | revisions, raw HTML, variable payload, delivery proof, provider trace | User saves a draft and thinks live customer email changed. |
| Mail Marketing | Recipient and campaign control room | Who will be contacted, why, who is blocked, which template will be used, is sending enabled or proof-only? | Pipeline only: audience preview -> freeze snapshot -> choose approved template -> review blockers -> queue/send or disabled proof. | per-recipient trace, raw flow JSON, webhook payload, delivery audit | User confuses live audience preview with the frozen send list. |
| Customer Portal | Buyer self-service account desk | What did I order, what can I reorder, what invoice is real/payable, what cart/review needs action? | Context action only: view order, reorder item/order, download/pay invoice, continue cart, contact staff. | order timeline, item properties, design files, payment history, cart outcome | Customer sees internal workflow/staff/marketing data or mistakes review-only state for checkout/payment success. |

Five-second clarity rule:
- Mail Template: the operator can point to the active email, draft email, readiness state, and the next safe release action in five seconds.
- Mail Marketing: the operator can point to live preview, frozen snapshot, blocked recipients, final eligible recipients, selected template, and delivery mode in five seconds.
- Customer Portal: the customer can point to recent orders, open invoices, reorderable items, active cart/review state, and the next customer-safe action in five seconds.

Composition rules that prevent confusion:
- Do not reuse the same visual treatment for different states. Preview and snapshot, draft and active, payable invoice and order receipt, checkout and review request must look different.
- Do not render long operational lists without search, filters, pagination, or virtualization.
- Do not put raw history or JSON at the top of modals. A modal opens with summary, reason, next action, then details.
- Do not expose staff-only or backend vocabulary to customers. Forbidden customer words include tenant, provider, workflow, queue, task routing, source, axis, campaign membership, suppression, and internal owner.
- Do not expose engineering labels to staff/admin when a business label exists. Use "Purchase intent", "Customer request", "Follow-up", "Eligible", "Blocked", "Ready to publish", "Payment unavailable", and "Review required".
- Do not let a disabled or unavailable action look broken. The disabled state must explain the missing backend state in business language.
- Do not duplicate the same number in multiple places unless one is a summary and the other is drill-down proof.

UIX must be designed before endpoint wiring for every new screen:
- Draw the first viewport in words first.
- Name the one primary action.
- Name the real backend state that enables the action.
- Name the hidden advanced data.
- Name the role-specific forbidden words.
- Only then bind contracts, API calls, tables, cards, modals, and styling.

### UIX Brainstorming Gate: No-Confusion Composition

This is the required thinking step before touching code in Mail Template, Mail Marketing, or Customer Portal. The product goal is not "show all data". The goal is an orderly, usable, efficient screen where the user does not need training to understand the next safe action.

Shared brainstorming questions:
- What decision is the user trying to make in this moment?
- What data is required for that decision, and what data is only proof/history?
- What action would be dangerous if the user misunderstood the state?
- What words would confuse this role because they are internal, technical, or operational?
- What should the user see first when the page has no data, when data is loading, and when the API fails?

The three modules must use the same clarity rhythm:
1. Summary strip: the few numbers that change the user's next action.
2. Work surface: the list/editor/table where the actual decision is made.
3. Action lane: one primary action plus quiet secondary actions.
4. Detail/proof area: logs, revision history, recipient trace, payment/order proof, or integration evidence.
5. Recovery state: explicit empty/loading/error/disabled copy that says what to do next.

Mail Template brainstorming:
- User mindset: "I am changing a customer-facing email and I must not accidentally ship the wrong version."
- First viewport must reduce release anxiety: active version, draft version, test status, approval state, provider mode, and next safe release action.
- Composition must feel like a protected release lane, not a free-form code editor.
- The editor is the workspace, but the release checklist is the safety system. The checklist stays visible near the primary action.
- Draft, tested, approved, published, and active are separate states with separate visual treatments.
- The primary CTA changes by state. Examples: `Create draft`, `Save draft`, `Send test`, `Approve`, `Publish`, `Activate`.
- Dangerous confusion to prevent: user thinks "saved draft" means "live customer email changed".
- Hide by default: raw HTML, variable JSON, provider response, revision diff, and delivery trace.

Mail Marketing brainstorming:
- User mindset: "I am deciding who will be contacted, why, and whether it is safe to queue the send."
- First viewport must make recipient risk obvious: live audience count, frozen snapshot count, blocked/suppressed count, provider delivery mode, selected approved template, and send readiness.
- Composition must feel like a recipient control room and campaign pipeline, not a generic automation builder.
- The user must see the difference between moving audience preview and frozen send snapshot before any send/queue action.
- Campaign creation follows a staged path: select audience -> preview -> freeze snapshot -> choose approved template -> review blockers -> queue/send or record disabled proof.
- Dangerous confusion to prevent: user thinks live preview count is the final send list.
- Hide by default: flow JSON, webhook payload, provider raw event, per-recipient debug trace, and analytics details that do not affect send readiness.

Customer Portal brainstorming:
- User mindset: "I am a buyer managing my account. I want to see what I ordered, pay or download what is real, and reorder safely."
- First viewport must show recent orders, open invoices, reorder-ready items, active cart/review state, and the next customer-safe action.
- Composition must feel like an account desk, not an internal admin panel.
- Order detail must explain line items, properties, files, totals, status, and reorder eligibility in customer language.
- Invoice and checkout actions must only look active when the backend has a real payable/downloadable URL.
- Reorder has two honest outcomes: checkout link exists, or account review is required. Both must be visually different.
- Dangerous confusion to prevent: customer thinks a review request, placeholder invoice, or unavailable checkout is a completed payment/order action.
- Hide forever from customer UI: tenant, provider, workflow, queue, source, axis, routing, campaign membership, suppression, staff notes, raw Shopify JSON, and internal audit payloads.

Composition acceptance rule:
- If the screen cannot be explained with one sentence, one primary action, and one clear blocked-state reason, it is not ready.
- If two states look alike but have different consequences, the UIX is wrong.
- If a role sees words from another role's internal workflow, the UIX is wrong.
- If a list can grow beyond a single screen, search, paging, filtering, or virtualization is required before production.
- If the backend returns real data but the user still has to guess what to do, the item is not done.

### Three-Module Composition Plan

| Module | Primary user | Screen must feel like | First viewport must show | Primary CTA pattern | Hide until detail | Main confusion to prevent |
| --- | --- | --- | --- | --- | --- | --- |
| Mail Template | Admin/operator | Protected release lane for customer-facing email | active version, draft change, approval/test readiness, provider mode, selected event/template | staged CTA: create draft -> save -> test -> approve -> publish/activate | raw HTML, revision history, provider trace, delivery log, variable payload | user thinking draft save changed live email |
| Mail Marketing | Admin/marketing operator | Recipient decision and campaign control room | provider mode, reachable/blocked counts, work needing action, audience/snapshot state | staged CTA: preview -> freeze snapshot -> review recipients -> queue/send/record disabled proof | raw flow JSON, webhook payload, per-recipient trace, analytics depth | user thinking live preview equals frozen send list |
| Customer Portal | Customer/buyer | Self-service account desk | recent orders, open invoices, reorder-ready items, active cart/review request | context CTA: view order, reorder item/order, download/pay invoice, continue cart | staff notes, raw Shopify JSON, internal audit, workflow/routing data | customer thinking a placeholder invoice/checkout is a real payment/order action |

### Composition Rules Per Module

Mail Template:
- First layer is state safety: active email, draft change, readiness, provider mode.
- The editor is important, but it is not more important than knowing what is live.
- Test, approval, publish, and activate must be staged. They must not appear as equal-weight buttons.
- Publishing in disabled provider mode must say that delivery is recorded but no customer email is sent.
- Raw HTML/source is an advanced view, not the default operator view.

Mail Marketing:
- Recipient certainty comes before creative editing.
- Audience preview and campaign snapshot must be visually different. Preview is moving data; snapshot is the frozen send list.
- Review must show total, missing email, unsubscribed, suppressed, frequency-capped, provider-disabled, and final eligible count before any queue/send action.
- Campaigns and flows must not be merged into one vague "automation" screen.
- Consent and suppression are first-class blockers, not hidden log details.

Customer Portal:
- The customer sees only account-safe business actions: view, reorder, download, pay, continue cart, contact staff.
- Order detail must open as a centered modal/full page for deep inspection, not a narrow right drawer that hides line items and design properties.
- Line item properties and design files must be readable business data, not raw JSON.
- Reorder buttons require eligibility proof. Unavailable items must show the reason.
- Pseudo invoices, missing payment links, or review-only carts must never look like final finance/checkout success.

### UIX Acceptance Before Build

Each of the three modules must pass these checks before backend implementation can be called done:
- The first viewport has one dominant workflow and one primary CTA.
- The visual hierarchy makes the most important decision obvious.
- Long lists are search-first and paged/virtualized.
- Loaded, empty, loading, and error states are designed separately.
- Internal terms are translated before they reach staff/customer copy.
- Customer-facing screens never expose tenant, provider, workflow, queue, staff routing, marketing audience membership, or raw integration payload.
- Staff/admin screens may expose technical evidence only after the business meaning is already clear.
- Light mode, dark mode, and narrow laptop layout must be checked because unreadable text or broken contrast is a production bug, not cosmetic polish.

### Final UIX Composition Gate

This is the non-negotiable product condition for all three modules. The goal is not to place every transferred capability on screen. The goal is to make the screen orderly, usable, efficient, and impossible to misunderstand.

Implementation must start from composition, not from components:
- First decide what the user is trying to finish.
- Then decide what must be visible before the user can safely act.
- Then decide what can be hidden behind detail, tabs, or advanced evidence.
- Then bind real backend data.
- Only after that should styling, tables, cards, and modals be built.

Shared UIX thesis:
- A useful screen has one dominant job, one dominant next action, and one clear proof area.
- Data that does not help the current decision moves down or behind detail.
- A count is useful only if the user understands what it counts: live, frozen, eligible, blocked, skipped, disabled, due, paid, failed.
- Repeating the same data in multiple places is allowed only when one is a summary and the other is a drill-down.
- If a role cannot act on a detail, that detail must not be in the first layer.
- The first screen must never require reading logs, raw JSON, ids, enum names, or backend terminology.

#### UIX Brainstorm Before Implementation

The three modules must not share one generic "admin table" composition. They solve different human decisions and must be designed around those decisions before any component is built.

Mail Template thinking:
- The user is touching production communication. Their first fear is accidental live change.
- The UI must behave like a release desk: draft, test, approval, publish, and active binding are separate mental states.
- The safest first viewport is a command strip plus composer, not a table of old revisions.
- History, raw HTML, provider payloads, and variable JSON are evidence. They are not the main workflow.
- The screen fails if the operator can save a draft and believe customers are already receiving it, or publish without seeing the event binding impact.

Mail Marketing thinking:
- The user is making a recipient decision. Their first fear is contacting the wrong people.
- The UI must behave like a send control room: live preview, frozen snapshot, exclusions, template readiness, provider state, and delivery proof are separate mental states.
- The safest first viewport is a staged pipeline or wizard, not a giant automation dashboard.
- Analytics are secondary until send correctness is proven. Eligibility, consent, suppression, and provider-disabled proof come first.
- The screen fails if the operator cannot tell whether a number is live preview, frozen snapshot, blocked, skipped, eligible, or delivered.

Customer Portal thinking:
- The user is a buyer, not an internal operator. Their first need is account clarity.
- The UI must behave like an account desk: orders, invoices, reorderable items, active cart, and account-review outcomes are separate mental states.
- The safest first viewport is the next useful customer action, not a dump of Shopify or internal data.
- Order properties, invoice state, payment links, and reorder eligibility must be translated into customer-safe language.
- The screen fails if a customer thinks a review request is a checkout, a placeholder is a payable invoice, or an unavailable reorder item can still be bought.

Cross-module composition decision:
- Mail Template gets a release-workflow composition.
- Mail Marketing gets a recipient-control composition.
- Customer Portal gets a self-service account composition.
- Any feature that does not support the active composition moves behind detail, evidence, or advanced controls.
- Any label that comes from backend terminology must be translated before it appears on screen.
- Any destructive, paid, customer-contacting, or live-binding action needs visible pre-action proof.

#### Final Composition: Mail Template

Primary user:
- Admin/operator who is changing customer-facing email content.

Core job:
- Safely move a template from draft to tested, approved, published, and active state without accidentally changing live mail.

Screen composition:
- Top command strip: selected business event, active email version, draft version, approval state, test state, provider/send state.
- Main work area: rendered editor and preview for the draft.
- Side context: variables, missing fields, readiness checklist, publish impact.
- Lower evidence: revision history, approvals, test records, delivery proof.
- Advanced only: raw HTML, raw variable payload, provider response, internal ids.

Efficiency rule:
- The operator should not need to open history to know whether a template is safe to publish.
- The primary CTA changes by state: create draft, save draft, test, request approval, approve, publish, activate.
- These actions must not appear as equal-weight buttons at the same time.

Confusion removal:
- "Save draft" must never look like "change active email".
- "Published" and "active for event" must be visually different if they are separate backend states.
- Disabled provider mode must say "delivery will be recorded but no customer email will be sent".
- Critical transactional templates need a visible warning before publish/activation.

#### Final Composition: Mail Marketing

Primary user:
- Admin/marketing operator who decides who receives communication and why.

Core job:
- Build or select a recipient group, freeze the real send list, choose an approved template, review blockers, and queue/send or record disabled proof.

Screen composition:
- Top command strip: provider/send state, active campaigns, active flows, blocked/suppressed count, work needing action.
- Main work area: staged campaign or flow workspace, never one mixed generic automation page.
- Recipient review panel: total snapshot, missing email, unsubscribed, suppressed, frequency capped, provider disabled, final eligible.
- Evidence area: queued, sent, skipped, failed, disabled-recorded rows.
- Advanced only: raw flow JSON, webhook payload, per-recipient technical trace, debug counters.

Efficiency rule:
- Audience preview and campaign snapshot must be separate visual states.
- A send/queue action cannot appear before audience, snapshot, template, consent, suppression, and provider state are understandable.
- Long contact/audience lists must be search-first and paged/virtualized.

Confusion removal:
- Preview means live moving data. Snapshot means frozen campaign recipients.
- Provider disabled proof must not read like customer delivery.
- Consent, suppression, and frequency caps are business blockers, not debug logs.
- Campaigns and flows must not be merged into one vague screen if that hides what will happen next.

#### Final Composition: Customer Portal

Primary user:
- Customer/buyer managing their own account, orders, invoices, carts, and reorders.

Core job:
- Understand what was ordered, what can be reordered, what is owed or paid, and what needs account review.

Screen composition:
- Top command strip: account context, open invoice state, recent order state, active cart/review state.
- Main work area: orders, invoices, reorder cart, or account home based on entry point.
- Detail view: centered modal or full page for deep order/invoice/cart inspection.
- Evidence area: order timeline, invoice activity, payment/download records, cart outcome.
- Advanced/internal data is not shown to customers.

Efficiency rule:
- Customers should be able to reorder an eligible item from the order detail without decoding properties or opening support.
- A 6,000-customer or 6,000-order surface must never render all rows at once; search, pagination, and filters are mandatory.
- Item properties, design files, and reorder eligibility must be readable business data, not raw JSON.

Confusion removal:
- A review-only cart must not look like a completed checkout.
- A pseudo invoice must not look like a real payable invoice.
- A missing payment link must say online payment is not available for this invoice.
- Staff ownership, internal rules, task routing, marketing membership, provider state, and tenant/internal ids must never appear in customer copy.

#### Composition Review Questions

Before coding any screen in these modules, the implementer must answer:
- What is the single job of this screen?
- What is the one safest primary action?
- What exact backend state enables or disables that action?
- Which visible numbers are live, frozen, eligible, blocked, skipped, disabled, due, paid, or failed?
- What does the user see when the data is empty, loading, failed, or blocked?
- Which details are intentionally hidden until click?
- Which words are forbidden for this role?
- What screenshot proves the screen is readable in light mode, dark mode, and narrow laptop width?

## Non-Goals

Do not transfer these old-system parts implicitly:
- Old auth, team, account, company, or seller user model.
- Old fingerprint / visitor identity module as a subsystem.
- Old event bus subsystem as-is.
- Dittofeed.
- Old sales/commission logic that is not explicitly in the current ROADMAP scope.
- AI prompt registry. Prompt content must be written for this system, not copied.

Allowed reference use:
- Use old DTOs, controllers, queue behavior, and data model shape as evidence.
- Port behavior into the new service boundaries and terminology.
- Replace old `company` and `companyUser` assumptions with `Customer` and `CustomerUser`.

## Canonical Model Mapping

| Old concept | New pure logic concept | Notes |
| --- | --- | --- |
| `merchantId` / old merchant scope | `tenantId` | Every row must have `tenantId`; Prisma tenant extension enforces access. |
| `User` admin actor | `Member` | Mail admin/operator actions use `Member.id`. |
| `Company` | `Customer` | B2B account/company becomes customer aggregate. |
| `CompanyUser` | `CustomerUser` | Buyer/contact under a customer. |
| old customer account user | `CustomerUser` session | Must not bypass tenant/customer ownership. |
| old sub-contact / child login | `SubUser` | Only if the new accounts model exposes delegated users. |
| Shopify customer | Customer Shopify identity | Link by Shopify customer id/email/phone under tenant. |
| Old `Order` / Shopify order local mirror | `CommerceOrder` / current order model | Keep rich line item properties and design files. |
| Old `Invoice` | `CommerceInvoice` | Current pseudo invoice is not enough. |
| Old cart / reorder cart | `CommerceCart`, `CommerceCartItem` | Needed for item-level reorder and checkout. |
| Old mail contact | `MailContact` linked to `Customer` / `CustomerUser` | No old fingerprint subsystem transfer. |
| Old visitor identity | Optional external identity record only | Only email/phone/shopify/import identities; no fingerprint module. |
| Old `P.mailMarketing.*` | permission-based `Member` RBAC | Add granular mail permissions. |
| Old `create_sales_task` action | `create_followup_task` / workflow task | Staff UI must say purchase intent, customer request, follow-up; avoid "sales" copy. |

## UI/UX Composition Brainstorming

The transfer cannot be judged only by backend parity. These three modules are operational tools. If the screens are noisy, duplicated, or unclear, the user will lose trust even if every endpoint exists.

Core rule:
- Each screen must answer one primary question.
- Each card/table row must have one obvious next action.
- Advanced data must be available, but not placed in the first visual layer.
- Internal engineering words must stay out of customer and staff-facing copy.
- A disabled provider or blocked action must explain why and what can be done next.
- Empty, loaded, and error states must be designed as real states, not filler text.

Shared composition rules:
- Keep the first viewport calm: status summary, primary work area, and one action rail only.
- Do not mix setup, monitoring, editing, and history in the same visual block.
- Use progressive disclosure: summary first, detail on click, raw payload only in an advanced drawer/modal.
- Keep primary actions in a predictable place across screens.
- Use readable labels: "Ready to publish", "Needs approval", "Provider disabled", "No eligible recipients", "Test send queued".
- Do not expose enum names like `workflow`, `provider`, `queue`, `axis`, `sales`, `merchant`, or `tenant` in user-facing labels.
- Any bulk action must show recipient count, suppression count, skipped count, and provider state before confirmation.
- Any destructive action must require confirmation and explain the impact in business language.
- All long lists need search, filters, paging/virtualization, and a clear empty state.
- Every page must be usable on a narrow laptop viewport without hidden critical actions.

### UIX Brainstorming Outcome

The core design problem is not missing controls; it is too many competing mental models on the same screen. Mail templates are an approval/versioning workspace. Mail marketing is a recipient and campaign operations workspace. Customer portal is a self-service buying and billing workspace. If these three are composed with the same generic table/card pattern, users will confuse draft state with live state, preview counts with send lists, and customer-facing invoices with internal order math.

The UI must therefore be built around one dominant job per module:
- Mail Template: protect production email while allowing a draft to move through edit, test, approval, publish, and activation.
- Mail Marketing: prove who receives a message and why before any customer contact is queued.
- Customer Portal: let the buyer understand account history, invoice state, and reorder choices without seeing internal operations.

Cross-module composition decisions:
- The first viewport is a command surface, not a dashboard. It must show "what needs attention now" and the safest next action.
- Dashboards are secondary. Metrics help only when they explain a decision: can I publish, can I send, can I reorder, can I pay?
- Lists must not be decorative. A row exists because the user can inspect it, fix it, send it, publish it, download it, pay it, or reorder it.
- Each module has one primary verb at a time. Multiple strong buttons create doubt and slow work.
- Search/filter is part of the screen contract for every long list; it is not an enhancement.
- Advanced payloads, logs, raw Shopify data, raw variables, and provider traces are allowed only behind an explicit advanced detail area.
- Every disabled action must say what is missing in business language, for example "No approved draft", "Audience snapshot required", "Payment link not configured", or "Variant no longer reorderable".
- The same concept must keep the same wording everywhere. "Draft", "Published", "Active", "Snapshot", "Eligible", "Suppressed", "Due", and "Paid" cannot be renamed per page.
- Customer-facing screens must never expose tenant, provider, workflow, queue, axis, revision id, or staff-only terminology.
- Staff/admin screens may show technical evidence, but only after the operational explanation is visible.

Confusion budget:
- One screen may contain at most one primary workflow, one secondary evidence area, and one advanced/debug area.
- If a user must compare two states, place them side by side with labels, not in different tabs.
- If a state can harm customers, it needs a readiness strip before the action.
- If a list can exceed 50 rows, the default must be paged/virtualized and search-first.
- If a field is generated from live data, show its source in plain language.
- If a field is manually editable, show the edit owner and save state.
- If an action queues background work, show queued/processing/done/failed states on the same page.

Module layout principles:
- Mail Template uses an editor-first composition with version state pinned at the top. The user should never wonder which version is live.
- Mail Marketing uses a campaign/audience pipeline composition. The user should never wonder whether a count is a live preview or a frozen send list.
- Customer Portal uses account-history composition. The user should never wonder whether a button will create a real checkout/payment action or only a request for account review.

### Pre-Implementation Composition Brainstorming

This section must be read before implementation. The main acceptance condition is not only that data exists. The screens must be usable, orderly, and efficient. A user should not need project knowledge to understand what the page is asking them to do.

Design premise:
- These modules are not dashboards. They are decision workspaces.
- A decision workspace needs hierarchy: what is happening, what needs attention, what action is safe, and where proof lives.
- If every panel has equal weight, the user will scan randomly and lose trust.
- If internal terms leak into the first visual layer, the user will treat the product as unfinished even when the backend is correct.
- If the same data appears in three places with different wording, the user will assume the data is inconsistent.

The common composition formula:
1. Orient: show the page purpose and current state.
2. Prioritize: show the one thing that needs attention first.
3. Decide: show enough context to make the next decision.
4. Act: show one clear primary action and small secondary actions.
5. Prove: show evidence/history only after the action context is clear.
6. Recover: every loading, empty, disabled, and error state must tell the user what can happen next.

Screen anatomy for all three modules:
- Command header:
  - page title in business language;
  - current state summary;
  - one primary CTA if the page has an immediate action;
  - no raw enum/status jargon.
- Primary work area:
  - list, editor, wizard, or account history depending on module;
  - the user must be able to complete the core job here.
- Context rail or modal:
  - only for supporting information;
  - must not contain the primary action if the primary action belongs to the current workflow.
- Evidence area:
  - history, delivery proof, audit records, payments, and logs;
  - collapsed or lower on the page unless it is required to approve/ship/pay.
- Advanced/debug area:
  - raw payloads, provider traces, Shopify references, queue details;
  - never default-open;
  - never shown to customers.

Kafa karisikligi yaratacak patterns:
- Generic table with many columns and no next action.
- Cards that all look equally important.
- A modal that mixes edit controls, audit logs, raw JSON, and final submit.
- A button that says one thing but creates a different backend state.
- Counts that do not explain whether they are live, frozen, eligible, skipped, or disabled.
- Technical words in staff/customer copy: tenant, provider, workflow, queue, axis, payload, event key, revision id, source id.
- Customer pages that reveal staff ownership, task routing, internal rules, or marketing audience membership.
- Email pages where draft, published, active, and sent states are visually similar.

Required composition checks before coding each screen:
- What is the single sentence purpose of this screen?
- What is the safest primary action?
- What information must be visible before that action?
- What information can be hidden until click?
- What data source powers each visible number?
- What state makes each CTA disabled?
- What does the user see when there is no data?
- What does the user see when the backend fails?
- What must never be visible to this role?

### Three-Module UX Composition Contract

This contract is the bridge between parity work and product usability. The old system can be used for behavior discovery, but the new implementation must not copy confusing composition. The goal is a calm operational surface where each role knows what to do without learning backend concepts.

The main UX rule:
- The page must make the next safe action obvious before it exposes depth.
- The first visual layer is for orientation and decision.
- The second visual layer is for business context.
- The third visual layer is for evidence, history, and advanced details.
- Raw payloads, queue/provider traces, Shopify ids, and internal enums never belong in the first visual layer.

| Module | User mental model | First-viewport job | Primary action pattern | Hide until detail | Must never confuse |
| --- | --- | --- | --- | --- | --- |
| Mail Template | "I am changing a customer-facing email safely." | Show active email, draft change, approval/test readiness, provider mode. | State-driven CTA: create draft -> save -> test -> approve -> publish/activate. | revision history, raw HTML, delivery logs, provider config, raw variables. | draft vs active, test recorded vs sent, publish vs activate. |
| Mail Marketing | "I am deciding who gets contacted and why." | Show reachable audience, blocked/suppressed counts, pending campaign/flow work. | Wizard or staged action: audience -> snapshot -> template -> review -> queue/send/proof. | raw flow JSON, webhook payloads, per-recipient trace, debug counters. | live preview vs frozen snapshot, eligible vs suppressed, disabled proof vs real send. |
| Customer Portal | "I am managing my orders, invoices, and reorders." | Show recent orders, open invoices, reorder-ready items, active cart/review request. | Context action: view order, reorder item/order, download/pay invoice, continue cart. | internal activity audit, raw Shopify JSON, staff notes, integration state. | real invoice vs placeholder, real checkout vs review request, reorderable vs unavailable item. |

Cross-module composition decisions:
- One screen can have one dominant workflow only. If editing, monitoring, history, and settings are all needed, split them into tabs or lower sections with clear labels.
- Counts must explain their source and state. Examples: live preview, frozen snapshot, eligible, suppressed, provider-disabled, due, paid.
- The same state label must mean the same thing everywhere. "Draft", "Published", "Active", "Eligible", "Suppressed", "Queued", "Paid", and "Review required" cannot drift between pages.
- Long lists must be search-first and paged/virtualized by default. A 6,000-row customer list must never render as a full table.
- Every modal must start with the action/context summary, then show details. A modal must not open on raw history, raw addresses, JSON, or debug proof.
- Advanced evidence is allowed, but it must be intentionally opened. Evidence should build trust, not become the main workflow.
- If a role cannot act on a piece of information, it should not be in the primary layer.

Per-module UX gates before implementation:
- Mail Template is blocked until the designer/implementer can explain where active version, draft version, approval state, test proof, and publish action live.
- Mail Marketing is blocked until audience preview, audience snapshot, recipient exclusions, provider-disabled proof, and delivery evidence are visually distinct.
- Customer Portal is blocked until order detail, item-level reorder, cart outcome, invoice download, invoice pay state, and unavailable reasons are customer-safe and action-oriented.

Confusion removal rules:
- Replace backend labels with business labels before UI binding.
- Remove duplicated panels unless one is a summary and the other is a drill-down.
- Prefer one strong CTA and several quiet secondary controls.
- Prefer centered/full-page detail for deep customer/order/invoice views; avoid narrow side drawers for information-heavy flows.
- Never let an unavailable backend capability look like a working customer action.
- Never show customer-facing placeholders as production finance or checkout state.

#### Module 1 Brainstorm: Mail Template Workspace

Core problem:
- The operator is editing customer-facing email, so the screen must reduce fear of accidentally changing live mail.
- The user needs version clarity more than a large editor.
- The most dangerous confusion is mixing "saved draft" with "active production email".

First ten seconds should answer:
- Which business event is this email for?
- Which version is active right now?
- Is there a draft change?
- Is the draft tested?
- Is it approved?
- Can it be published safely?

Preferred composition:
- Left/top selector: event/category/template search.
- Center: draft editor and rendered preview.
- Top readiness strip: active version, draft version, test state, approval state, provider state.
- Right rail: variables and publish checklist, depending on current mode.
- Lower evidence: revisions, approvals, test sends, delivery history.

Interaction staging:
- If no draft exists, primary CTA is "Create draft".
- While editing, primary CTA is "Save draft".
- After save, primary CTA is "Preview and test".
- After successful test or disabled-mode proof, primary CTA is "Request approval" or "Approve".
- After approval, primary CTA is "Publish".
- After publish, activation must be explicit if binding changes are separate.

What should be visually quiet:
- Revision history.
- Delivery log.
- Raw HTML.
- Raw variable payload.
- Provider configuration.

What should be visually loud:
- Unresolved variables.
- Missing approval.
- Provider disabled state.
- Critical transactional template warning.
- Difference between active and draft.

Empty/loading/error rules:
- Empty: "No template exists for this event" plus create draft CTA.
- Loading: skeleton for selector, readiness strip, editor area.
- Error: show business impact, retry action, and whether active production email is still safe.
- Disabled provider: explain that publishing changes template configuration but does not send customer email.

Do not implement as:
- one huge template table with edit buttons;
- a source-code editor as first screen;
- publish/test/activate buttons all visible with the same weight;
- event binding hidden in raw JSON.

#### Module 2 Brainstorm: Mail Marketing

Core problem:
- The operator is deciding who receives communication. Recipient certainty is more important than visual creative.
- The biggest risk is sending to the wrong people or believing a live preview is the same as a frozen send list.
- The page must separate "build audience", "freeze snapshot", "choose template", "send/queue", and "prove delivery".

First ten seconds should answer:
- Is marketing sending enabled or intentionally disabled?
- Which work needs attention now?
- Are there campaigns waiting for approval/snapshot/template?
- Are there delivery failures or suppression issues?
- Are recipient counts live previews or campaign snapshots?

Preferred composition:
- Overview starts with operational risk, not decorative analytics.
- Contacts page is search-first.
- Audience page is condition-builder plus preview.
- Campaign page is a wizard with recipient review.
- Flow page is canvas plus inspector plus runtime evidence.
- Consent/suppression is its own visible area, not buried inside settings.

Campaign wizard composition:
1. Audience:
   - choose audience;
   - show live preview count;
   - show exclusions.
2. Snapshot:
   - freeze recipients;
   - show added, removed, unchanged;
   - show snapshot timestamp.
3. Template:
   - choose approved template;
   - show active/draft warning if needed.
4. Review:
   - total snapshot;
   - missing email;
   - unsubscribed;
   - suppressed;
   - frequency capped;
   - provider disabled;
   - final eligible count.
5. Schedule/queue:
   - one primary action;
   - proof mode copy if sending is disabled.
6. Delivery evidence:
   - queued, sent, skipped, failed, disabled-recorded.

What should be visually quiet:
- Raw flow JSON.
- Provider webhooks.
- Per-recipient technical trace.
- Debug counters.
- Attribution graphs until sending correctness is proven.

What should be visually loud:
- No eligible recipients.
- Snapshot missing/stale.
- Template not approved.
- Consent/suppression blockers.
- Provider disabled.
- Delivery failures.

Empty/loading/error rules:
- Empty contacts: show import/sync status and next sync action.
- Empty audience: show create audience CTA and examples in business language.
- Empty campaign: show create campaign CTA after at least one valid audience/template exists.
- Loading: distinguish "calculating preview" from "loading frozen snapshot".
- Error: show whether the campaign is blocked or only evidence failed to load.

Do not implement as:
- a single "automation" page where contacts, flows, campaigns, logs, and settings compete;
- a send button from a list row;
- analytics that imply delivery when provider is disabled;
- consent and suppression only in a log detail.

#### Module 3 Brainstorm: Customer Portal

Core problem:
- The customer wants self-service clarity: what they bought, what they owe, what they can reorder, and what needs staff help.
- The page must feel like an account desk, not a back-office system.
- The most dangerous confusion is pretending that an invoice/payment/reorder action is real when the backend only has a placeholder or review request.

First ten seconds should answer:
- Who is logged in / which account is being viewed?
- Are there open invoices?
- Are there recent orders?
- Are there reorder-ready items?
- Is there an active cart or review request?

Preferred composition:
- Account home gives the next useful customer action.
- Orders list is searchable and paginated.
- Order detail opens centered/full-page with order timeline, line items, properties, files, and reorder eligibility.
- Reorder page separates eligible and unavailable items.
- Invoice page separates due/paid/overdue/void and never makes pseudo invoices look payable.
- Cart page shows real persisted items, quantity, totals, checkout/review outcome.

Customer-facing wording:
- Use "Orders", "Invoices", "Reorder", "Cart", "Download", "Pay", "Contact billing", "Needs account review".
- Do not use tenant, provider, workflow, queue, task, internal owner, source, axis, marketing audience, or rule.
- If a backend reason is technical, translate it:
  - "missing variant id" -> "This item needs account review before reorder";
  - "payment url missing" -> "Online payment is not configured for this invoice";
  - "provider disabled" -> not shown to customer.

What should be visually quiet:
- raw Shopify ids;
- raw line item property JSON;
- internal invoice activity audit;
- internal staff notes unless explicitly customer-visible;
- integration/debug state.

What should be visually loud:
- open invoice due date;
- paid/overdue state;
- reorderable item;
- unavailable item reason;
- active cart;
- checkout unavailable/contact staff outcome.

Empty/loading/error rules:
- Empty orders: explain that no synced orders are available for this account and offer contact path.
- Empty invoices: say no invoices are due, not just "empty".
- Empty cart: show reorder/browse CTA.
- Loading: do not render large blank tables; use page skeleton and maintain layout height.
- Error: preserve navigation and give retry/contact action.

Do not implement as:
- a table that renders all customer records at once;
- a drawer that hides deep order detail;
- pseudo invoices that look legal/payable;
- reorder buttons without eligibility proof;
- customer pages with staff-only workflow/support/marketing labels.

#### Three-Module Composition Acceptance

A screen is acceptable only if:
- The user can describe what it is for in one sentence.
- The top area contains no more than one primary action.
- Every badge/status uses business language.
- The first viewport is not dominated by logs, raw data, or settings.
- A long list has search, filters, and pagination/virtualization.
- A disabled action explains the missing requirement.
- The loaded, empty, loading, and error states are visually distinct.
- The same state uses the same label across modules.
- Customer-facing screens never expose internal implementation vocabulary.
- Staff/admin screens show technical evidence only after the business meaning.

Implementation consequence:
- Backend parity is required, but not sufficient.
- UI implementation must start from this composition contract, then bind real APIs.
- If the old system has a feature but its UI pattern creates confusion, port the behavior and redesign the composition in the new pure logic style.
- If a feature cannot be expressed clearly in the first two visual layers, it belongs behind a detail modal, evidence panel, or advanced section.

### Mail Template Composition

Primary user:
- Admin or marketing operator who wants to edit, preview, test, approve, and publish a template without breaking transactional mail.

Primary question:
- "Which email is active for this event, and is the next version safe to publish?"

Recommended screen set:
- Template Library.
- Template Detail / Composer.
- Preview and Test.
- Approval and Publish.
- Delivery History.

Template Library composition:
- Left/top filters: category, event type, status, approval state, search.
- Main list: template name, event key, active version, draft status, last edited, last sent.
- Right or inline status: missing variables, needs approval, published, disabled provider.
- Primary CTA: create template or open selected template.
- Empty state: "No templates yet" with create CTA.
- Error state: backend error plus retry.

Template Detail composition:
- Header: template name, event/category, active version, draft version, provider state.
- Readiness strip: variables valid, approval status, test-send status, compliance footer, active binding.
- Main area:
  - Content tab for subject, preview text, and body.
  - Variables tab for available variables and unresolved variables.
  - Preview tab for rendered desktop/mobile preview.
  - Test tab for recipient and send result.
  - History tab for revisions and delivery evidence.
- Side panel:
  - Show variable help only while editing.
  - Show publish checklist when preparing to publish.
  - Do not show raw JSON by default.

Composer rules:
- Editing a published version creates a draft revision.
- The active production revision must always be visually separate from draft.
- Unresolved variables block publish.
- Marketing compliance footer must be shown in preview before publish.
- Critical transactional templates need a stronger warning before changing active binding.

Publish modal:
- Show exactly what changes: event binding, old version, new version, category, affected channel.
- Show test-send proof or say "No test send has been run".
- If provider is disabled, say "Publishing changes the active template; sending remains disabled".
- Primary action: publish.
- Secondary action: save draft.

Confusion risks to avoid:
- Do not place five actions with equal weight: save, test, approve, publish, activate must be staged.
- Do not show old variant/revision terminology without explaining active vs draft.
- Do not show source HTML as the default view for normal operators.
- Do not let "test skipped" look like "test passed".

### Mail Marketing Composition

Primary user:
- Admin or marketing operator who wants to target real customers, prepare a campaign or journey, and understand who will receive what.

Primary question:
- "Who will receive this, why are they eligible, and what will happen next?"

Recommended screen set:
- Overview.
- Contacts.
- Audiences.
- Campaigns.
- Flows.
- Delivery Log.
- Suppression and Consent.
- Settings.

Overview composition:
- First row: provider state, contacts reachable, active campaigns, active flows, blocked sends.
- Work queue: drafts needing approval, failed deliveries, audiences needing snapshot, suppressed spikes.
- Do not put graph-heavy analytics above operational issues.

Contacts composition:
- Search-first layout.
- Row shows name/company, email/phone, customer link, consent state, last delivery, last order.
- Contact detail modal shows identities, consent, suppressions, audience membership, recent deliveries, recent customer events.
- Raw identities or payloads belong in an advanced section.

Audience composition:
- Audience list shows name, source, current preview count, last snapshot count, owner, last snapshot time.
- Audience builder uses readable conditions: purchased product family, order count, last order age, Shopify segment, customer owner, consent state.
- Preview must show count and sample before save.
- Snapshot action must explain that campaign sends use the snapshot, not a moving live list.
- Snapshot diff must show added, removed, unchanged.

Campaign composition:
- Use a wizard, not a giant form:
  1. Choose audience.
  2. Choose template.
  3. Review recipients and exclusions.
  4. Schedule or queue.
  5. Watch delivery evidence.
- Review step must show total audience, suppressed, missing email, frequency-capped, provider-disabled, eligible.
- The send button must not be available until audience snapshot and template are valid.
- If provider is disabled, the action text should be "Queue disabled proof" or "Record disabled delivery", not "Send now".

Flow composition:
- Canvas is for structure; inspector is for details.
- Top summary must always answer:
  - Who enters this flow?
  - What happens first?
  - What stops the flow?
  - What is the worst-case recipient count?
- Node inspector must use business labels, not JSON.
- Publish requires validation, dry-run/simulation, and approval if configured.
- Runtime tab shows runs, enrollments, skipped reasons, and action logs.

Suppression and consent composition:
- Separate this from general settings.
- Make the state obvious: subscribed, unsubscribed, suppressed, bounced, complained.
- Every manual suppression needs reason and audit.
- Unsuppress must explain that consent is not automatically restored unless policy allows it.

Confusion risks to avoid:
- Do not merge campaigns and flows into one unlabeled "automation" page.
- Do not let audience preview and audience snapshot look identical.
- Do not hide suppression/consent skip reasons inside logs only.
- Do not show analytics as success if provider is disabled or sends were skipped.
- Do not expose internal action names like `create_sales_task` in UI.

### Customer Portal Composition

Primary user:
- Customer or buyer who wants to understand past orders, download/pay invoices, and reorder without calling staff.

Primary question:
- "What did I buy, what can I reorder, and what needs my attention?"

Recommended customer navigation:
- Home.
- Orders.
- Reorder.
- Invoices.
- Account.
- Support only if customer-initiated request handling is enabled.

Customer Home composition:
- First row: open invoices, recent orders, reorder-ready items, active cart.
- Main work area: recent orders and pending actions.
- Do not show internal owners, tenant names, queue names, provider state, or workflow labels.
- Empty state: guide the customer to browse orders or contact support.

Orders composition:
- Search and filters at top: order number, product, date, status.
- Paginated/virtualized list; never render thousands of records at once.
- Row shows order number, date, total, status, tracking state, reorder availability.
- Detail opens as a centered modal or full page, not a right-side drawer if it hides context.
- Detail first viewport:
  - order status/timeline,
  - total,
  - shipping/tracking,
  - line items,
  - reorder all button if eligible.
- Line item detail:
  - product name,
  - variant/SKU,
  - quantity,
  - properties,
  - design files,
  - item-level reorder button.

Reorder composition:
- Make it feel like a buying flow, not an admin resolver.
- Show reorderable items first.
- Show unavailable items separately with reason.
- Quantity changes must be immediate and visible.
- Checkout/review/contact-staff outcome must be explicit before the customer clicks.
- If checkout is unavailable, do not show a fake checkout CTA.

Invoices composition:
- List by status: due, paid, overdue, void.
- Detail shows invoice number, amount, due date, payment state, line items, download, pay if configured.
- If payment is not configured, CTA should be "Contact billing" or "Download invoice", not "Pay".
- Invoice history must show state changes and payment records.

Customer account extension composition:
- If Shopify Customer Account UI extension is added, it must be simpler than the full portal.
- Extension should show only high-frequency actions: recent orders, invoice status, reorder.
- Deep editing and support history can link to the full portal.

Confusion risks to avoid:
- Do not expose internal support/task/marketing words to customers.
- Do not mix staff-only invoice controls into customer screens.
- Do not let pseudo invoices look like legal invoices.
- Do not show reorder buttons when variant availability is unknown.
- Do not hide item properties/design files behind raw JSON.

### UI Acceptance Gate For All Three Modules

Before a module can be called production-ready:
- A user can explain the page's purpose within five seconds.
- The primary CTA is visually obvious.
- Loaded, empty, loading, and error states are distinct.
- Disabled actions explain the reason.
- Long lists are paginated or virtualized.
- No backend enum or internal jargon leaks into customer/staff copy.
- A first-time user can complete the core action without opening logs.
- The same data is not repeated in multiple panels unless one is summary and one is detail.
- Screenshots must be collected for light mode, dark mode, and a narrow laptop viewport.

### Composition Decision Record

This is the UI contract for implementation. Backend parity alone is not enough. Each module must be arranged so the user always understands where they are, what matters now, and what action is safe to take next.

#### 1. Mail Template Workspace

Desired mental model:
- "I am managing the email content for a known business event."
- "Published is live, draft is not live, and activation is separate from editing."
- "I can safely test and approve before customers receive anything."

Composition thesis:
- This screen must feel like a protected release lane, not a rich text playground.
- The operator should always see three states: live email, draft change, and publish readiness.
- Editing, previewing, testing, approval, and activation are one guided path; they should not compete as separate unrelated buttons.
- The screen must reduce fear: it should be obvious that saving a draft does not change live customer email.

Primary workflow:
1. Choose the business event/template.
2. Review live state and draft state.
3. Edit draft content and variables.
4. Preview with a real profile.
5. Send or record a test.
6. Approve.
7. Publish/activate with a clear change summary.

User confusion risks:
- If active and draft content appear in the same editor, users may think live mail changes immediately.
- If preview is detached from variables, unresolved variables are discovered too late.
- If "publish" and "activate" are presented as identical, an operator may ship the wrong event binding.
- If provider disabled state is hidden, users may think a test email was actually delivered.

Composition decision:
- The active version is read-only in the first layer.
- The draft version is editable in the main layer.
- Publish readiness is a persistent strip, not buried in a modal.
- Revision history and delivery history are evidence tabs, not default workspace content.
- Raw HTML/source can be opened, but the default view is rendered/email-operator friendly.

First viewport:
- Page title: Email Templates.
- One status strip with active binding health: active version, draft changes, approval state, provider state.
- Template/event selector on the left or top.
- Main editor/preview area.
- One primary action at a time based on state:
  - no draft: create draft;
  - draft dirty: save;
  - saved draft: send test;
  - tested draft: request approval or approve;
  - approved draft: publish;
  - published revision: activate for event.

Information hierarchy:
- Layer 1: template name, event, active version, draft status, readiness.
- Layer 2: subject, preview text, rendered body, variables.
- Layer 3: revision history, delivery history, raw variables, validation details.

Do not place on the first screen:
- Raw HTML as the default view.
- Delivery logs mixed into the editor.
- Multiple equally strong actions.
- Provider config controls.
- Internal event payload JSON.

Business-safe labels:
- Use "Active email", "Draft change", "Needs approval", "Ready to publish", "Test delivery recorded".
- Do not show "revision_id", "eventKey", "provider_id", "tenant", "workflow", or queue names unless the user opens an advanced technical detail panel.

Confusion guardrails:
- Editing a published email must visibly create a draft.
- A publish action must not also silently activate a different event unless the modal says it.
- Test send in disabled provider mode must say "Recorded as disabled delivery", not "Sent".
- Unresolved variables must be shown beside the field that caused the issue.
- Preview must always show desktop and narrow/mobile width before publish.

#### 2. Mail Marketing

Desired mental model:
- "I am choosing real recipients and deciding what communication will happen."
- "Audience preview is live estimation; campaign snapshot is the frozen send list."
- "Disabled sending can still prove the workflow without contacting customers."

Composition thesis:
- This screen must feel like a campaign control room, not a generic automation page.
- The operator must understand recipient eligibility before thinking about creative content.
- Every count must answer a business question: reachable, suppressed, missing email, frequency capped, provider blocked, eligible.
- A campaign can only move forward when audience, template, consent, and provider state are all understandable.

Primary workflow:
1. Select or build the audience.
2. Preview eligibility and exclusions.
3. Freeze a snapshot for the campaign.
4. Choose an approved template.
5. Review final recipients and blocked reasons.
6. Queue/schedule/send or record disabled proof.
7. Monitor delivery evidence and failed/skipped rows.

User confusion risks:
- If live audience preview and campaign snapshot look the same, users cannot reason about who actually receives the campaign.
- If suppressions are only visible in delivery logs, users will think the send silently failed.
- If flows and campaigns share one cluttered canvas, operators cannot tell whether they are building a journey or sending a campaign.
- If provider disabled mode still says "send", proof mode will be mistaken for customer delivery.

Composition decision:
- Audience and snapshot must be visually distinct.
- Campaign wizard is required for send/queue actions; direct send from a table row is not allowed.
- Consent and suppression are first-class review data, not debug data.
- Flow runtime evidence stays near the flow, while campaign delivery evidence stays near the campaign.
- Analytics are secondary until operational correctness is visible.

First viewport:
- Page title: Mail Marketing.
- Operational summary: reachable contacts, active campaigns, active flows, blocked/suppressed sends.
- One work queue: drafts needing review, failed deliveries, stale audience snapshots.
- Clear navigation tabs: Contacts, Audiences, Campaigns, Flows, Delivery, Consent.
- The page must not open on a blank analytics dashboard.

Information hierarchy:
- Layer 1: current operational risk and pending work.
- Layer 2: audiences/campaigns/flows requiring action.
- Layer 3: delivery logs, per-recipient trace, suppression reasons, raw event detail.

Audience builder composition:
- Conditions must read like business language:
  - bought product family,
  - has not bought in X days,
  - belongs to Shopify segment,
  - has valid email consent,
  - assigned customer owner.
- Preview must show total matches, excluded by consent, missing email, suppressed, eligible.
- Snapshot must show added, removed, unchanged and the snapshot time.

Campaign composition:
- Use a stepped flow:
  1. Audience.
  2. Template.
  3. Recipient review.
  4. Schedule/queue.
  5. Delivery evidence.
- Campaign detail must answer:
  - who receives it,
  - why they receive it,
  - which template is used,
  - what blocks sending,
  - what was recorded.

Flow composition:
- Canvas is only the map.
- Inspector explains the selected step in business terms.
- Runtime tab shows enrollments, actions, skips, and errors.
- Publish requires validation and simulation proof.

Do not place on the first screen:
- Raw flow JSON.
- Provider webhook payloads.
- Debug counters without business labels.
- A send button before audience, template, suppression, and provider state are resolved.

Confusion guardrails:
- Audience preview and campaign snapshot must look different.
- Suppressed and unsubscribed are different states and must not be merged.
- Provider disabled is not an error if disabled mode is intentional.
- Analytics must not imply customer delivery when sends were only recorded.
- Campaign and flow screens must never look like a staff task manager.

#### 3. Customer Portal

Desired mental model:
- "This is my account history and reorder workspace."
- "I can see exactly what I bought, download/pay invoices when available, and reorder eligible items."
- "If something cannot be reordered or paid, the system explains why."

Composition thesis:
- This screen must feel like a buyer account desk, not an internal admin panel.
- The buyer should see only decisions they can act on: view order, reorder item, download invoice, pay invoice, continue cart, contact staff.
- Internal reasons may power the decision, but the copy must be customer-safe and business-clear.
- Reorder and invoice flows must never pretend a real checkout or payment happened if the backend only created a review record.

Primary workflow:
1. Customer opens account home/orders/invoices.
2. System shows recent orders, open invoices, reorder-ready items, and any active cart.
3. Customer opens an order and sees line items, properties, design files, tracking, and invoice/payment links.
4. Customer reorders all eligible items or one item.
5. System creates a real persisted reorder cart or a clear account-review request.
6. Customer can return to the same cart/invoice/order without losing context.

User confusion risks:
- If invoice is derived from order total but looks legal/payable, customers may treat a placeholder as a real invoice.
- If item properties/design files render as raw JSON, buyers cannot verify what they are reordering.
- If unavailable variants appear beside eligible variants without reason, customers will think the system is broken.
- If staff-only transfer/task labels appear, customers will assume internal operations are part of their account state.

Composition decision:
- Customer portal uses centered modal/full-page detail, not a narrow right drawer for deep order/customer data.
- Orders, invoices, and reorder carts each have their own state model and visible state labels.
- Staff controls are excluded completely from customer sessions.
- Reorder eligibility is shown per item and for the whole order.
- Invoice payment/download actions are separated and only visible when real records/URLs exist.

First viewport:
- Page title: Account Home or Orders, based on entry point.
- Customer identity context only if useful: company/name, email, phone.
- Immediate cards:
  - recent orders,
  - open invoices,
  - reorder-ready items,
  - active cart or pending review.
- Primary CTA depends on context:
  - view recent order,
  - reorder eligible item,
  - download invoice,
  - continue cart.

Information hierarchy:
- Layer 1: order status, invoice state, reorder availability, cart state.
- Layer 2: line items, totals, shipping/tracking, payment records.
- Layer 3: item properties, design files, historical timeline, raw Shopify references.

Order detail composition:
- Header: order number, date, status, total.
- Timeline: placed, fulfilled, delivered, cancelled/refunded if applicable.
- Line item table: product, variant/SKU, quantity, price, reorder eligibility.
- Properties and design files must be readable, not dumped as raw JSON.
- Item-level reorder must sit on the item row, not only at the top.

Reorder composition:
- Split eligible and unavailable items.
- Unavailable items show reason: variant inactive, missing Shopify link, price unavailable, requires account review.
- Quantity and item selection must be clear before checkout/review.
- If checkout is not available, route to a real review/contact flow, not a fake success.

Invoice composition:
- Legal/finance status must be explicit: draft, due, paid, overdue, void.
- Pseudo invoices must not be shown as real payable invoices.
- Payment CTA appears only when payment is configured and allowed.
- Download and pay actions must be separated.

Do not place on the first screen:
- Internal staff owners.
- Workflow/task labels.
- Tenant/provider settings.
- Marketing audience membership unless it is translated into a useful customer-facing explanation.
- Raw Shopify JSON.

Confusion guardrails:
- Customer can only see records linked to their customer account and tenant.
- Staff-only controls must never appear in customer sessions.
- Reorder must never hide missing availability.
- Invoice state must not be inferred only from order total.
- A customer account extension must stay smaller than the full portal and link out for deep details.

## Source Inventory

### Old Mail Template

Backend:
- `backend/src/email-templates/email-templates.controller.ts`
- `backend/src/email-templates/email-templates.service.ts`
- `backend/src/email-templates/email-template-ai.service.ts`
- `backend/src/email-templates/email-template.catalog.ts`
- `backend/src/mail/mail.service.ts`
- `backend/src/mail/mail-center.controller.ts`
- `backend/src/mail/mail-settings.service.ts`
- `backend/src/mail/mail-settings.defaults.ts`
- `backend/src/mail/mail-category.helper.ts`
- `backend/src/mail/mail-outbound.worker.ts`

Admin UI:
- `admin/app/mail/page.tsx`
- `admin/app/mail/_tabs/TemplatesTab.tsx`
- `admin/app/mail/_tabs/DeliveryTab.tsx`
- `admin/app/mail/_tabs/SuppressionTab.tsx`
- `admin/app/mail/_tabs/HealthTab.tsx`
- `admin/app/mail/_tabs/SettingsTab.tsx`
- `admin/app/email-templates/page.tsx`

Important old capabilities:
- Template workspace by event key.
- Variant create/update/duplicate/activate.
- Revision create/update/duplicate/delete/publish.
- Preview rendering.
- Test send through delivery pipeline.
- Event binding and active variant/revision.
- Marketing compliance footer.
- Suppression and consent enforcement.
- Critical transactional event bypass rules.
- 60-second idempotency dedupe for event sends.
- Delivery log and failed retry handling.

### Old Mail Marketing

Backend:
- `backend/src/mail-marketing/mail-marketing.controller.ts`
- `backend/src/mail-marketing/mail-marketing.service.ts`
- `backend/src/mail-marketing/mail-marketing-templates.service.ts`
- `backend/src/mail-marketing/mail-marketing-flows.service.ts`
- `backend/src/mail-marketing/mail-marketing-analytics.service.ts`
- `backend/src/mail-marketing/mail-marketing-settings.service.ts`
- `backend/src/mail-marketing/mail-marketing.processor.ts`
- `backend/src/mail-marketing/mail-marketing-flow-events.listener.ts`
- `backend/src/mail-marketing/dto/*.ts`

Admin UI:
- `admin/app/mail-marketing/page.tsx`
- `admin/app/mail-marketing/templates/page.tsx`
- `admin/app/mail-marketing/flows/page.tsx`
- `admin/app/mail-marketing/audiences/page.tsx`
- `admin/app/mail-marketing/campaigns/page.tsx`
- `admin/app/mail-marketing/analytics/page.tsx`
- `admin/app/mail-marketing/settings/page.tsx`
- `admin/app/mail-marketing/components/*`

Important old capabilities:
- Overview and settings bootstrap.
- Contact inventory from company, company user, Shopify customer, and runtime event identities.
- Contact detail with identities, consent states, suppressions, and audience membership.
- Audiences with preview, create/update, snapshot, and snapshot diff.
- Template list/create/update/revision/test-send/approve/publish.
- Flow list/create/get/update/publish/pause/resume/replay.
- Flow runtime with trigger matching, graph validation, published versions, enrollments, runs, action logs, and queue jobs.
- Flow nodes: trigger, delay, condition/split, send email, update contact tag, add/remove audience, create task, webhook, internal event.
- Runtime send controls: provider enabled, marketing enabled, quiet hours, per-contact frequency caps, approval requirement, daily quota.
- Analytics endpoints for overview, campaign, template, audience, segment, funnel, cohort, and attribution.

### Old Customer Portal

Backend:
- `backend/src/customer-account/customer-account.controller.ts`
- `backend/src/customer-account/customer-account.service.ts`
- `backend/src/orders/orders.controller.ts`
- `backend/src/orders/orders.service.ts`
- `backend/src/carts/carts.controller.ts`
- `backend/src/carts/carts.service.ts`
- `backend/src/invoices/invoices.controller.ts`
- `backend/src/invoices/invoices.service.ts`

Customer UI and Shopify extension:
- `accounts/app/orders/page.tsx`
- `accounts/app/orders/[id]/page.tsx`
- `accounts/components/orders/ReorderComponents.tsx`
- `accounts/app/cart/page.tsx`
- `accounts/components/cart/*`
- `accounts/app/invoices/page.tsx`
- `accounts/app/invoices/[id]/page.tsx`
- `extensions/customer-account-extension/src/CustomerAccountPage.tsx`

Important old capabilities:
- Customer can see their own Shopify/order history.
- Customer can open order detail.
- Customer can see line item properties and design-file metadata.
- Customer can reorder the whole order.
- Customer can reorder one selected item.
- Reorder creates a cart/review/checkout path depending on resolver result.
- Customer can see invoices and payment state.
- Staff can generate/upload/update invoice records.
- Customer account extension exposes orders/invoices/reorder inside Shopify account.

## New Repository Inventory

### New Mail Backend

Files:
- `services/backend/src/modules/mail/mail.service.ts`
- `services/backend/src/modules/mail/mail.repository.ts`
- `services/backend/src/modules/mail/mail.controller.ts`
- `services/backend/src/modules/mail/mail-outbound.worker.ts`
- `services/backend/src/modules/mail-marketing/mail-marketing.service.ts`
- `services/backend/src/modules/mail-marketing/mail-marketing.repository.ts`
- `services/backend/src/modules/mail-marketing/mail-marketing.controller.ts`
- `services/backend/src/modules/email-templates/email-templates.service.ts`
- `services/backend/src/modules/email-templates/email-templates.repository.ts`
- `services/backend/src/modules/email-templates/email-templates.controller.ts`
- `packages/contracts/src/mail.ts`

Current good base:
- `MailDelivery` exists.
- Queue-backed transactional mail exists.
- Resend API key decrypt path exists.
- Mail health endpoint exists.
- Template, contact, audience, flow table shells exist.
- Marketing provider is intentionally disabled.
- `queued_disabled` exists in contract status enum.

Inventory status after this pass:
- Mail Center delivery log, suppression, DLQ, health proof, settings, and settings audit are implemented in the new mail module.
- Marketing campaigns and flows now create persisted proof in disabled/provider-safe mode instead of pretending to send customer email.
- Audience snapshots, campaign lifecycle, flow versioning/runtime/action logs, consent send controls, idempotency, and conservative analytics are implemented in the gap matrix sections below.
- `sendingEnabled: false` remains the safe default; live provider sending is a tenant setting and must not be implied by disabled proof.

Open production risks:
- Template authoring now has a release-lane first layer. Remaining proof is visual: light/dark/narrow screenshots and live tenant evidence.
- Live provider webhook ingestion is now implemented for Resend, but rollout signoff still needs a real tenant webhook configured in Resend and a live event proof row.
- Light/dark/narrow screenshots and live tenant evidence are still required before rollout signoff.

### New Admin UI

Files:
- `apps/admin/src/routes/system-mail.tsx`
- `apps/admin/src/routes/mail-marketing.tsx`
- `apps/admin/src/lib/api.ts`

Current good base:
- Admin routes exist.
- API client has basic mail and marketing calls.
- UI can show disabled provider state.

Inventory status after this pass:
- System Mail owns operational delivery infrastructure: delivery log, suppression, DLQ, provider/queue/category health, and settings audit.
- Mail Marketing owns the recipient decision room: contacts, audiences, campaigns, templates, flows, settings, and operational proof analytics.
- Template authoring is kept as a protected release lane inside the mail surfaces, not as a cosmetic standalone editor.
- Admin Mail Marketing and System Mail action buttons now match backend guard granularity instead of using one broad write flag.
- Admin template authoring now starts with a protected release-lane status panel instead of dropping the operator directly into raw source editing.

Open production risks:
- UIX screenshots for light, dark, and narrow layouts are still required.
- Bundle size warnings remain and should be handled as a later frontend performance task.

### New Customer Portal

Files:
- `services/backend/src/modules/accounts/accounts.controller.ts`
- `services/backend/src/modules/accounts/accounts.service.ts`
- `apps/accounts/src/routes/orders.tsx`
- `apps/accounts/src/routes/index.tsx`
- `apps/accounts/src/routes/reorder.tsx`
- `apps/accounts/src/routes/invoices.tsx`
- `apps/accounts/src/routes/products.tsx`
- `apps/accounts/src/lib/portal.ts`

Current good base:
- Customer profile/orders/reorder/invoices/products routes exist.
- Reorder templates are derived from recent order line items.
- Account portal uses new customer identity model.
- Current order module already extracts design files and line item properties for admin/order service use.

Inventory status after this pass:
- Customer portal no longer redirects `/` to addresses. The account home is now a real first viewport backed by live `/accounts/*` APIs.
- Account home shows recent orders, open invoices, reorder-ready templates, and active cart/review state before sending the customer into detail pages.
- Portal order detail endpoint exists and exposes scoped, property-rich order detail without dumping raw Shopify JSON.
- Whole-order reorder and item-level reorder are implemented against the current customer order scope.
- Reorder cart and Shopify draft-order checkout path exist; unavailable/review-required states are explicit and do not fake checkout success.
- Account invoice records now have a persistent lifecycle with detail, download/pay actions, payment records, and activities.
- Customer portal permission guards are split into own-order read, reorder, invoice read, and cart/checkout write permissions.

Open production risks:
- Shopify Customer Account UI extension is now implemented only as a thin customer-account entry surface. It does not duplicate account logic; it verifies the Shopify customer session, resolves the tenant/customer user, calls the existing `AccountsService`, and deep-links to the standalone `apps/accounts` portal for detail-heavy work.
- Customer portal screens still need live tenant evidence and light/dark/narrow screenshots before rollout signoff.
- Existing accounts build still reports a large chunk warning; this is a performance task, not a functional customer lifecycle blocker.

## Gap Matrix: Mail Template

### Database Gaps

Missing or incomplete target models:
- `EmailTemplateBinding`: event key -> active template/version binding, category, critical flag, fallback behavior.
- `EmailTemplateRevision` or extended `EmailTemplateVersion`: revision status, source html, text source, subject source, preview text, lint result, spam score, approval state, author member.
- `MailTemplateBlock`: reusable safe blocks.
- `MailTemplateSnippet`: reusable snippets.
- `MailTemplatePreviewProfile`: sample variable payloads for preview/test.
- `MailTemplateApproval`: approval history, approver, comment, timestamps.
- `MailSuppression`: global and scoped suppression.
- `MailConsentState`: customer/contact consent state by channel/category.
- `MailIdempotencyKey`: event send dedupe.
- `MailDlq`: failed delivery jobs and retry metadata.
- `MailSettingsAuditLog`: settings changes.

New schema has `EmailTemplate`, `EmailTemplateVersion`, `EmailTemplateBinding`, `MailTemplateApproval`, `MailTemplatePreviewProfile`, `MailTemplateSnippet`, and `MailTemplateBlock`.

Implementation added in this pass:
- Workflow mail now resolves the active `EmailTemplateBinding` for the event key and renders the bound published version.
- Explicit workflow `templateId`/slug can still be used, but only when that template has a published version.
- If no active published binding/template exists, workflow mail fails closed by creating a `queued_disabled` proof delivery with `failClosed=true`; it does not send arbitrary fallback HTML to the customer.
- Rule-engine `send_mail` traces now read the returned delivery status/metadata, so blocked template resolution is reported as fail-closed proof instead of a fake queued send.
- Template publish now runs a real lint/compliance gate before activating a revision: subject/html are required, script/form/inline JavaScript/javascript URLs are blocked, marketing/flow templates require `{{urls.unsubscribe}}`, declared variables are checked, and lint/spam evidence is written to the version row.
- Template release proof is now enforced at the backend boundary: test-send rejects unresolved preview variables, writes a structured `releaseProof` with source hash and variable hash into `MailDelivery.metadata`, approval requires a fresh matching proof, and publish requires both approval and the same fresh proof.
- Editing revision source now resets both `status` and `approvalState` to `draft`, so a previously approved revision cannot keep an approved UI/backend state after its subject/body/CSS/text/variables change.
- Template rendering now resolves variables in CSS as well as subject/html/text, so preview, disabled test proof, workflow mail, and flow mail do not leak raw `{{...}}` tokens from CSS.
- Old template render reference read from `C:\Users\mhmmd\Desktop\eagle-engine.dev\eagledtfprint\backend\src\email-templates\email-templates.service.ts`: the old renderer escaped variables inserted into HTML while leaving subject/text/CSS as text rendering, then injected marketing compliance footer after composition.
- Mail template render hardening now matches that safety boundary: preview/test proof, workflow mail, campaign mail, and flow mail escape variable values only when rendering HTML body content; subject, text fallback, and CSS stay text-rendered. Campaign proof mail also composes stored CSS into the rendered HTML instead of dropping it.
- Old marketing compliance reference read from the same old `email-templates.service.ts`: marketing mail always auto-injected unsubscribe/email-preferences footer after render, independent of whether the template author remembered footer markup.
- New marketing compliance hardening now generates `urls.unsubscribe`, `urls.preferenceCenter`, and `urls.preference_center` for template preview/test proof, campaign proof, and flow proof; it also injects an idempotent `data-mail-compliance-footer` block into marketing HTML/text output and records footer/link proof in delivery metadata.
- Public preference/unsubscribe is now a real backend contract, not a plain placeholder URL: footer links point to `/api/v1/mail-marketing/preferences` and `/api/v1/mail-marketing/preferences/unsubscribe` with an HMAC-signed recipient token carrying tenantId/email/contact/customer/source/expiry. The public unsubscribe endpoint verifies the token, runs inside that tenant context, resolves the contact by tenant-scoped contactId/email, writes `MailConsentState(state='unsubscribed', category='marketing', source='mail_preference_link')`, creates or reactivates a category-level `MailSuppression(scope='category', category='marketing', reason='unsubscribe')`, records a `contact.unsubscribe.public` marketing event, and returns a customer-readable HTML result page.
- Preview profiles now have real tenant-scoped coverage: list, create, update, delete, default-profile handling, template/event scoping, contract DTO, api-client methods, and an admin template-workspace UI for choosing/saving/updating/deleting preview data before test-send.
- Reusable snippets and blocks now have tenant-scoped Prisma models, migration, tenant enforcement, typed contracts, backend CRUD/archive endpoints, api-client methods, and admin template-workspace UI for listing, creating, selecting, editing, and archiving reusable content.
- Template revisions now expose source editing in the admin workspace: subject, preview text, HTML, CSS, and text fallback can be edited, saved through the real revision-source API, and rendered with the selected preview profile.
- Rendered preview now shows business proof before test-send: rendered subject/preview text, unresolved-variable warnings, desktop iframe preview, mobile-width iframe preview, and text fallback.
- `MailDelivery` now has structured nullable `templateId` and `templateVersionId` links, matching the old delivery-log lesson that test sends and runtime sends must be auditable by template/revision without parsing raw metadata.
- `MailDelivery` list filtering now accepts `templateId`, `templateVersionId`, and metadata `source` filters, so template workspaces can show only their own recent proof rows.
- Template test-send writes the structured template/revision link in addition to disabled-provider metadata.
- Campaign and flow disabled delivery proof also writes the structured template/revision link when a published template revision is used.
- Admin Mail Marketing template workspace now has a real "Delivery proof" panel: loading, empty, error, and loaded states are bound to `/mail/deliveries?templateId=...`, and test-send invalidates that proof list after a `queued_disabled` record is created.

Still open after this pass:
- Real provider test-send remains disabled unless tenant send provider is explicitly enabled.

### API Gaps

Old capabilities now covered in the new pure-logic surface:
- Duplicate variant.
- Duplicate revision.
- Update revision source.
- Delete draft revision.
- Activate variant for event.
- Publish revision with binding update.
- Approval endpoint.
- Preview with selectable profile data.
- Template lint/spam/compliance preview.
- Source editor and rendered desktop/mobile preview.
- Delivery log filtering by template, template version, and delivery source.

Still intentionally limited:
- Test send records provider-disabled delivery proof unless the tenant send provider is explicitly enabled.

### Render and Variable Gaps

The production template engine must support typed variable namespaces:
- `tenant`: name, logo, domains, brand colors.
- `recipient`: name, email, phone, unsubscribe state.
- `customer`: customer id, company/name, lifecycle, owner/member names.
- `customerUser`: buyer/contact name, role, email.
- `order`: order number, status, totals, line items, properties, design files, tracking.
- `invoice`: invoice number, status, due date, payment link.
- `cart`: reorder cart items, checkout/review link.
- `supportRequest`: request id, type, status, last update.
- `member`: sender/owner signature.
- `unsubscribe`: one-click and preferences links.

Required behavior:
- Variables must be validated before publish.
- Preview must show unresolved variable warnings.
- Marketing templates must include compliance footer unless explicitly configured by tenant policy.
- Transactional critical templates must bypass marketing suppression but still log delivery.
- Unknown event keys must fail closed, not send arbitrary HTML.

### UI Gaps

Admin template UI must include:
- Template list grouped by event/category.
- Event workspace with active binding.
- Revision source editor.
- Preview panel.
- Test recipient send.
- Approval state and history.
- Publish/activate controls with permission checks.
- Delivery history for that template.
- Empty state with CTA to create the first variant.
- Error state with backend message.

Implementation added in this pass:
- Admin template lifecycle now has a release-lane first layer showing active version, current work revision, test proof, approval, publish state, provider-safe proof mode, and one state-derived next action.
- The release lane now includes preview readiness as a first-class stage: render saved preview with the selected profile, resolve missing values, record disabled test proof, approve, publish, then activate.
- The release lane blocks the "draft saved means live email changed" confusion by explicitly stating that activation is the only event-binding change.
- The next action is derived from real template/version/proof state: record test proof, approve, publish, activate, or create a draft copy.
- The release lane uses existing `EmailTemplateDetail`, active binding, strict approval state, rendered preview state, and `MailDelivery.releaseProof` rows; it does not infer readiness from generic delivery rows or UI-only state.
- The admin template lifecycle screen now includes template-scoped delivery proof with loading, empty, error, and loaded states.
- Recent proof rows show subject, recipient, revision link, status, provider, source, delivery id, attempt count, timestamp, and error reason.
- Test-send success now refreshes the template proof list, so the operator can verify the test record without leaving the template workspace.

Verification evidence:
- `pnpm --filter @factory-engine-pro/admin exec tsc -p tsconfig.json --noEmit` passed after the release-lane UI pass.
- `pnpm --filter @factory-engine-pro/backend exec tsc -p tsconfig.json --noEmit` passed after the release-proof backend gate.
- `pnpm --filter @factory-engine-pro/backend exec tsc -p tsconfig.json --noEmit` passed after mail template HTML-variable escape hardening.
- `pnpm --filter @factory-engine-pro/backend exec tsc -p tsconfig.json --noEmit` passed after marketing compliance footer/link injection was added to template proof, campaign proof, and flow proof.
- `pnpm --filter @factory-engine-pro/backend exec tsc -p tsconfig.json --noEmit` passed after signed public mail preference/unsubscribe endpoints were added.
- `pnpm --filter @factory-engine-pro/admin exec tsc -p tsconfig.json --noEmit` passed after preview/test/approve/publish UI guard alignment.
- `pnpm --filter @factory-engine-pro/contracts build` passed.
- `pnpm --filter @factory-engine-pro/backend build` passed after Prisma client generation; sandbox had blocked Prisma copy, so the build was rerun with approved external access.
- `pnpm --filter @factory-engine-pro/admin build` passed after the Vite sandbox access retry; Vite reported only the existing large chunk warning.
- `git diff --check` passed for the changed mail/template files; only existing CRLF warnings were reported.

## Gap Matrix: Mail Marketing

### Contact and Consent Gaps

Old system built a marketing contact graph. New system now has a first production-shaped contact graph and a contact detail endpoint/panel. The detail path intentionally ports the old contact graph behavior without bringing the old fingerprint subsystem into the new model.

Required target behavior:
- `MailContact` must link to `Customer`, `CustomerUser`, or external imported contact.
- Each contact can have multiple identities: email, phone, Shopify customer id.
- Consent state must be category-aware: marketing, transactional, B2B account, product updates.
- Suppression must be global and scoped.
- Unsubscribe/preference changes must be logged.
- Contact detail must show identities, consent, suppression, audience memberships, recent deliveries, and recent events.

Do not port old fingerprint behavior. If an old contact came from visitor identity, map only safe explicit identities such as email/phone/shopify id when available.

Implementation added in this pass:
- Backend now exposes `GET /mail-marketing/contacts/:contactId`.
- The endpoint reads the live tenant contact, customer summary, customer users, email consent history, email suppression history, frozen audience snapshot memberships, recent delivery proof, recent marketing events, and flow activity.
- Identity display is explicit-only: mail contact id, email, phone, customer id, Shopify customer id, and customer-user emails. No old fingerprint identity is transferred.
- Admin Mail Marketing Contacts now opens a no-confusion detail panel beside the selected contact row instead of leaving the user with a shallow table.
- The panel has loading, error, empty/select, and loaded states. Loaded state starts with reachability and blocker context, then shows identities, consent/suppression, audience memberships, delivery proof, and recent activity.

Scoped suppression implementation added in this pass:
- `MailSuppression` now supports scoped policy instead of only one global contact/channel blocker.
- Supported scopes are `global`, `category`, `campaign`, `flow`, and `template`.
- Scope target fields are explicit: `category`, `campaignId`, `flowId`, `templateId`.
- `expiresAt` allows temporary suppression; expired suppressions are ignored by campaign/flow reachability guards.
- Global suppression still flips the contact to not sendable because it blocks all email to that contact.
- Category/campaign/flow/template suppression does not globally mark the contact unsendable; it only blocks matching marketing runtime context.
- Audience snapshot reachability considers global suppression and category-level marketing suppression only, so a campaign-specific block does not incorrectly remove the contact from unrelated audience proof.
- Campaign queue checks scoped suppression against `{ category: 'marketing', campaignId, templateId }`.
- Flow send-email nodes check scoped suppression against `{ category: 'marketing', flowId, templateId }`.
- System Mail UI can create scoped suppressions with the matching target and optional expiry, then list the active scope beside the suppressed contact.
- API client now forwards scope filters for suppression list queries, so admin UI can later filter by global/category/campaign/flow/template without inventing client-only state.
- Resend bounce/complaint/suppressed provider webhooks now always reactivate or create a `global` suppression row with no category/campaign/flow/template target. Provider events cannot accidentally overwrite scoped campaign/flow/template suppression rows.

Explicit contact identity implementation added in this pass:
- Added tenant-scoped `MailContactIdentity` with unique `(tenantId, entityType, entityKey)` and indexes for contact, customer, customer user, Shopify customer, email, and phone lookup.
- Added migration backfill from existing `mail_contacts`, `customers`, and `customer_users`.
- Backfilled identity types are only the safe explicit set: `mail_contact`, `email`, `phone`, `customer`, `customer_user`, and `shopify_customer`.
- Old `visitor_identity` and fingerprint identities are intentionally not ported.
- Customer import now uses upsert instead of `createMany(skipDuplicates)`, so an existing manual/suppression contact can be linked back to the real customer and identity graph when Shopify/customer data is available.
- Manual audience emails now write persistent `mail_contact` and `email` identity rows.
- Contact detail now reads `identities` from the persistent identity table; it only falls back to derived display rows for legacy contacts with no identity rows yet.

Still intentionally limited:
- The identity graph deliberately excludes old fingerprint/visitor identities because those modules are outside the current ROADMAP transfer scope.

Verification evidence for this scoped suppression pass:
- `pnpm --filter @factory-engine-pro/contracts build` passed after regenerating the updated suppression contract dist.
- `pnpm --filter @factory-engine-pro/contracts exec tsc -p tsconfig.json --noEmit` passed.
- `pnpm --filter @factory-engine-pro/api-client exec tsc -p tsconfig.json --noEmit` passed.
- `pnpm --filter @factory-engine-pro/backend exec tsc -p tsconfig.json --noEmit` passed.
- `pnpm --filter @factory-engine-pro/admin exec tsc -p tsconfig.json --noEmit` passed.
- `pnpm --filter @factory-engine-pro/backend exec prisma validate` passed with a dummy local `DATABASE_URL`.
- `pnpm --filter @factory-engine-pro/backend build` passed after adding the persistent contact identity table and provider global-suppression fix.

### Audience Gaps

Old system supports audience preview, create/update, snapshot, and diff. New system now carries the same core mental model: live audience counts are separate from immutable frozen snapshots.

Required target behavior:
- Audience criteria stored as typed JSON with zod validation.
- Supported criteria: customer segment, Shopify segment, order count, revenue, last order date, product/SKU/family purchased, email consent, customer owner/member, lifecycle, tags.
- Preview returns count and sample members without sending.
- Snapshot writes immutable membership rows.
- Snapshot diff shows added/removed/stayed.
- Campaigns and flows must use a snapshot for send consistency, not a moving query.
- Each row must include `tenantId`.

Implementation added in this pass:
- Added typed `MailAudienceSnapshotMemberQuery`, snapshot member response, and snapshot diff response contracts.
- Added `GET /mail-marketing/audiences/snapshots/:snapshotId` for tenant-scoped frozen member evidence.
- Added `GET /mail-marketing/audiences/snapshots/:snapshotId/diff` to compare frozen snapshot members against the current live audience and return added/removed/stayed counts.
- Snapshot diff uses existing tenant-scoped `MailAudienceSnapshotMember` rows and current `MailContact` audience matching; it does not infer recipients from UI state.
- Admin Mail Marketing audience screen now separates live audience counts from frozen snapshots, adds a "Freeze snapshot" action, shows frozen member reachability, and shows drift status before campaigns are queued.
- Audience filter DSL now accepts the old production source selectors and the new pure-logic business selectors: local segment ids/names, Shopify segment ids/names, manual customer lists, direct emails, tags, lifecycle, customer owner/member, assignment axis, order count, total spend, last order date, SKU, product name/family, product query, suppressed-contact inclusion, and unknown-consent inclusion.
- Backend audience preview, audience create/update, snapshot create, and snapshot diff now use the same live resolver. The resolver imports real Customer rows into MailContact, creates explicit manual-email contacts, enriches contacts from Customer, SegmentCustomerMembership, ShopifyCustomerSegmentMember, CustomerListItem, CustomerAssignment, and CommerceOrder, then matches from that context.
- Snapshot members now persist the actual marketing consent state and active suppression reason from the contact at freeze time instead of fabricating a subscribed/unknown state.
- Snapshot `reachableCount` now uses the same final sendability decision as snapshot member rows: contact sendability, marketing consent, and active suppression. It no longer over-counts contacts that are later blocked in the member table.
- Admin Mail Marketing audiences now include a real business-language audience builder. The operator can preview the live audience through `/mail-marketing/audiences/preview`, save that exact typed filter payload, then freeze a campaign snapshot from the saved audience.
- Snapshot member rows now expose a safe contact-detail handoff (`contactDetailAvailable`, `contactDetailPath`) instead of duplicating raw identity payloads. Admin frozen-member rows can open the existing contact detail panel, which already reads identities, consent, suppression, audience memberships, delivery proof, and flow activity from the real contact endpoint.

Still open after this pass:
- The old system's company group/company status/company-user-role filters are not copied directly because the new pure-logic customer model does not have those old company tables. Their new-system equivalents are customer tags, lifecycle/status, owner/member assignment, local segment, and manual customer list.

Verification evidence for this audience pass:
- `pnpm --filter @factory-engine-pro/contracts --filter @factory-engine-pro/api-client --filter @factory-engine-pro/backend --filter @factory-engine-pro/admin build` passed.
- `pnpm --filter @factory-engine-pro/contracts exec tsc -p tsconfig.json --noEmit` passed.
- `pnpm --filter @factory-engine-pro/api-client exec tsc -p tsconfig.json --noEmit` passed.
- `pnpm --filter @factory-engine-pro/backend exec tsc -p tsconfig.json --noEmit` passed.
- `pnpm --filter @factory-engine-pro/admin exec tsc -p tsconfig.json --noEmit` passed.
- `pnpm --filter @factory-engine-pro/backend exec tsc -p tsconfig.json --noEmit` passed after snapshot reachable-count was aligned with consent/suppression sendability.
- `pnpm --filter @factory-engine-pro/admin exec tsc -p tsconfig.json --noEmit` passed after campaign snapshot copy switched to eligible/blocked language.
- `pnpm --filter @factory-engine-pro/backend build` passed after the snapshot reachable-count fix.
- `pnpm --filter @factory-engine-pro/admin build` passed after the campaign eligible/blocked UI copy; Vite reported only the existing large chunk warning.
- `pnpm --filter @factory-engine-pro/contracts build` passed after adding the snapshot-member contact detail handoff contract.
- `pnpm --filter @factory-engine-pro/admin build` passed for the frozen-member contact-detail UI handoff; Vite reported only the existing large chunk warning.
- `git diff --check` passed for changed mail marketing audience files; only existing CRLF warnings were reported.

### Campaign Builder Gaps

ROADMAP item 31 explicitly includes campaign builder. New schema keeps `MailCampaign` as the one-off/broadcast lane and now has lifecycle state, pinned revision, counters, and disabled-proof queueing.

Target:
- Keep `MailCampaign` for one-off/broadcast sends.
- Keep `MailFlow` for automated journeys.
- Both use the same template engine, audience snapshot, suppression checks, and delivery queue.

`MailCampaign` minimum fields:
- `id`, `tenantId`, `name`, `status`.
- `templateId`, `templateVersionId`.
- `audienceId`, `snapshotId`.
- `subjectOverride`, `senderName`, `replyTo`.
- `scheduledAt`, `sentAt`, `pausedAt`.
- `createdByMemberId`, `approvedByMemberId`.
- counters: queued, sent, failed, skipped, suppressed.

Implementation added in this pass:
- Added additive `MailCampaign` lifecycle fields and migration: pinned `templateVersionId`, subject/sender/reply overrides, scheduled/approved/paused/sent timestamps, creator/approver member ids, and queued/sent/failed/skipped/suppressed counters.
- Added safe campaign member relations and DTO previews for creator/approver. Invalid cross-tenant or missing member ids are nulled by migration before foreign keys are attached, and the admin campaign table shows draft owner/approver names instead of raw member ids.
- Campaign create now requires a real audience and a published template, pins the published or selected approved/published revision, optionally stores subject override and scheduled time, and records `campaign.created` evidence.
- Added campaign lifecycle endpoints: approve, pause, cancel, and existing disabled-proof queue now requires approved/scheduled state.
- Campaign creation now requires a pre-frozen audience snapshot. The contract, backend runtime guard, and admin UI all reject campaign creation without `snapshotId`.
- Campaign approval now rejects legacy or malformed campaigns without a frozen snapshot.
- Campaign queue/proof now reuses the selected frozen snapshot only; it no longer silently creates a send snapshot at proof time.
- Campaign queue now uses the pinned revision, applies subject override, stores disabled delivery proof only, and records separate queued/skipped/suppressed counters.
- Admin Mail Marketing campaign UI now shows a staged operator flow: select audience -> select frozen send list -> create draft campaign -> approve/schedule -> record disabled delivery proof, with business status labels instead of raw enum-only workflow.
- Admin campaign rows now show "Blocked: no frozen snapshot selected" instead of implying that a moving live audience can be frozen later.
- Scheduled campaign execution now has its own BullMQ lane: `mail-marketing-campaign` / `queue-campaign`.
- Campaign approval rejects scheduled campaigns when the managed Redis queue is not configured, so the UI cannot imply a future send/proof that the backend cannot run.
- Approved scheduled campaigns enqueue a delayed tenant-scoped job with `tenantId`, `campaignId`, and the approved `scheduledAt`.
- The scheduled worker runs inside tenant context and calls the same `queueCampaign` path used by the manual proof action, so frozen snapshot, pinned template revision, consent, suppression, frequency cap, daily cap, quiet-hours, and provider-disabled guards are not bypassed.
- If a scheduled job arrives early, it requeues itself instead of producing proof early.
- If quiet hours are active at scheduled time, the job requeues after the quiet-hours window and records `campaign.schedule_requeued_quiet_hours`.
- If the campaign is paused, canceled, archived, or already queued before the job fires, the worker records `campaign.schedule_skipped` and does not create delivery proof.
- Admin campaign rows now explain that scheduled campaigns are handled by the worker and that "Record proof now" is an explicit manual override, not the normal scheduled path.

Still open after this pass:
- Live provider sending remains intentionally disabled.

Verification evidence for this campaign lifecycle pass:
- `pnpm --filter @factory-engine-pro/contracts exec tsc -p tsconfig.json --noEmit` passed after `snapshotId` became required.
- `pnpm --filter @factory-engine-pro/backend exec tsc -p tsconfig.json --noEmit` passed after the backend snapshot guard.
- `pnpm --filter @factory-engine-pro/admin exec tsc -p tsconfig.json --noEmit` passed after the admin frozen-send-list UI.
- `pnpm --filter @factory-engine-pro/admin build` passed after the frozen-send-list UI; Vite reported only the existing large chunk warning.
- `pnpm --filter @factory-engine-pro/contracts --filter @factory-engine-pro/api-client --filter @factory-engine-pro/backend --filter @factory-engine-pro/admin build` passed.
- `pnpm --filter @factory-engine-pro/contracts build` passed.
- `pnpm --filter @factory-engine-pro/api-client build` passed.
- `pnpm --filter @factory-engine-pro/contracts exec tsc -p tsconfig.json --noEmit` passed.
- `pnpm --filter @factory-engine-pro/api-client exec tsc -p tsconfig.json --noEmit` passed.
- `pnpm --filter @factory-engine-pro/backend exec tsc -p tsconfig.json --noEmit` passed.
- `pnpm --filter @factory-engine-pro/admin exec tsc -p tsconfig.json --noEmit` passed.
- `pnpm --filter @factory-engine-pro/backend exec tsc -p tsconfig.json --noEmit` passed after the scheduled campaign worker lane was added.
- `pnpm --filter @factory-engine-pro/admin exec tsc -p tsconfig.json --noEmit` passed after the scheduled worker UI copy was added.
- `pnpm --filter @factory-engine-pro/backend build` passed after the scheduled campaign worker lane was added.
- `pnpm --filter @factory-engine-pro/admin build` passed after the scheduled worker UI copy was added; Vite reported only the existing large chunk warning.
- `git diff --check` passed for changed campaign lifecycle files; only existing CRLF warnings were reported.
- Campaign member preview relation pass:
  - `pnpm --filter @factory-engine-pro/backend exec prisma validate` passed after `MailCampaign` creator/approver relations were added.
  - `pnpm --filter @factory-engine-pro/backend exec prisma generate` passed after Windows sandbox escalation refreshed the Prisma client.
  - `pnpm --filter @factory-engine-pro/contracts exec tsc -p tsconfig.json --noEmit` passed after `MailCampaignDto` gained creator/approver previews.
  - `pnpm --filter @factory-engine-pro/api-client exec tsc -p tsconfig.json --noEmit` passed after campaign API responses were typed.
  - `pnpm --filter @factory-engine-pro/backend exec tsc -p tsconfig.json --noEmit` passed after backend DTO mapping.
  - `pnpm --filter @factory-engine-pro/contracts build` passed after Windows sandbox escalation refreshed package dist.
- Campaign approval policy threshold pass:
  - `pnpm --filter @factory-engine-pro/contracts exec tsc -p tsconfig.json --noEmit` passed after `approvalPolicy` was added to the Mail Marketing settings contract.
  - `pnpm --filter @factory-engine-pro/backend exec tsc -p tsconfig.json --noEmit` passed after approval threshold enforcement and snapshot spend metrics were added.
  - `pnpm --filter @factory-engine-pro/contracts build` passed after Windows sandbox escalation refreshed package dist for admin type resolution.
  - `pnpm --filter @factory-engine-pro/admin exec tsc -p tsconfig.json --noEmit` passed after admin campaign/settings UI was bound to the approval policy.
  - `pnpm --filter @factory-engine-pro/api-client exec tsc -p tsconfig.json --noEmit` passed after the contract update.
  - `pnpm --filter @factory-engine-pro/admin exec tsc -p tsconfig.json --noEmit` passed after the campaign table switched to `MailCampaignDto`.
  - `pnpm --filter @factory-engine-pro/api-client --filter @factory-engine-pro/backend --filter @factory-engine-pro/admin build` passed after Windows sandbox escalation; admin Vite still reports the existing large chunk warning.
  - `git diff --check` passed for the campaign member relation files; only existing CRLF warnings were reported.

Campaign status:
- draft
- needs_approval
- approved
- scheduled
- sending
- queued_disabled (disabled provider proof recorded, not a sent customer email)
- paused
- sent
- canceled

### Flow Runtime Gaps

Old flow runtime is much deeper than the new shell.

Required target models:
- `MailFlowVersion`
- `MailFlowNode`
- `MailFlowRun`
- `MailFlowEnrollment`
- `MailFlowActionLog`

Implementation added in this pass:
- Added tenant-scoped `MailFlowVersion`, `MailFlowNode`, `MailFlowRun`, `MailFlowEnrollment`, and `MailFlowActionLog` schema plus migration.
- Flow create now writes an immutable version and normalized node rows instead of storing only opaque graph JSON.
- Flow update with graph changes creates a new draft version, matching the old system's versioned update behavior.
- Flow publish activates the latest version and writes `flow_published` action-log evidence.
- Flow pause/resume writes operational action-log and event evidence.
- Flow graph validation now blocks missing trigger/action nodes, duplicate node keys, unsupported node types, trigger mismatch, and broken next-node/route references.
- `GET /mail-marketing/flows/:flowId/runs` now reads real `MailFlowRun` rows with enrollment summaries instead of returning a stub.
- `GET /mail-marketing/flows/:flowId/events` now reads real `MailFlowActionLog` rows instead of returning a stub.
- Enrollment replay now checks the real enrollment row and records a disabled-mode replay log; missing enrollment returns `NotFound`.
- Admin Mail Marketing flow list now shows version/node count, run/event counts, disabled delivery state, and publish/pause/resume actions using real API calls.
- Added centralized BullMQ queue token and worker for `mail-marketing-flow` / `process-enrollment`.
- Added `POST /mail-marketing/flows/events` to ingest a typed domain event into published flow runtime.
- Added tenant-scoped `MailConsentState` with category/channel state and `POST /mail-marketing/contacts/:contactId/consent` for manual/API consent capture.
- Domain event ingest now finds published active-version flows by trigger type, matches trigger config, resolves explicit contact/customer/email identities, creates `MailFlowRun`, `MailFlowEnrollment`, and `trigger_received` action-log rows.
- Worker node processing now handles trigger handoff, delay, condition/split branching, send-email disabled proof, real contact-tag mutation, real audience direct-email add/remove mutation, real follow-up task creation for task nodes, and disabled proof logs for side effects that remain unsafe.
- `send_email` nodes now enforce sendability gates: missing email, `MailContact.isSendable`, latest category-aware `MailConsentState` when unsubscribed, and active `MailSuppression`.
- `send_email` nodes now read Mail Center `categoryMarketing` settings and skip when marketing or flow sends are disabled.
- `send_email` nodes now re-queue during quiet hours using the tenant Mail Center timezone instead of silently sending/recording proof.
- `send_email` nodes now enforce per-recipient marketing frequency caps from Mail Center settings against real `MailDelivery` rows.
- `send_email` nodes now enforce the tenant daily marketing cap from Mail Marketing settings against real `MailDelivery` rows.
- `send_email` nodes create real `MailDelivery(status=queued_disabled)` rows in provider-disabled mode instead of pretending a customer email was sent.
- Flow domain-event ingest now claims a tenant-scoped `MailFlowIdempotencyKey` before creating a run/enrollment, so duplicate webhook/domain-event retries for the same flow + target do not create duplicate journeys.
- Campaign queue now reads Mail Center marketing/campaign toggles before producing delivery proof and records a skipped event if campaign delivery is disabled.
- Campaign queue now blocks during quiet hours with a business error and records `campaign.queue_blocked_quiet_hours` evidence instead of creating customer-facing delivery proof at the wrong time.
- Campaign queue now checks snapshot sendability plus live contact sendability, latest consent, active suppression, per-recipient frequency caps, and tenant daily cap before creating disabled delivery proof.
- Campaign queue now stores skip reason counters in campaign metadata and `campaign.queued_disabled` event metadata.
- Campaign create/queue now requires a real published template revision. Draft/latest fallback is blocked.
- Admin Mail Marketing campaign UI now mirrors the same contract in its action guards: approval/proof actions require both a frozen send list and a pinned approved/published template revision, and provider-disabled proof is labeled as proof-only instead of external customer delivery.
- Admin campaign and frozen-snapshot rows now use eligible/blocked copy instead of ambiguous reachable-only language, so the operator sees how many frozen recipients can receive proof and how many are blocked by consent/suppression/sendability before approval or proof.
- Flow create-as-published and flow publish now validate action references before activation: `send_email` requires a published template, optional `revisionId` must be approved/published, audience mutations require a real active audience, follow-up task nodes reject non-`sales`/`account` axes and missing explicit assignees, webhook nodes require an active tenant-scoped `destinationId`, delay/condition/tag actions must have required config.
- Flow runtime no longer generates fallback email content from arbitrary node strings. A `send_email` node without a published template is skipped with action-log evidence.
- `create_sales_task`, `create_follow_up_task`, and `create_followup_task` nodes now create tenant-scoped `ServiceRequest` rows with `source='admin_created'`, `axis='sales'|'account'`, `category='mail_follow_up'`, and `mailFlowTaskKey` idempotency. `support` axis is rejected; automatic support cases remain forbidden.
- Follow-up task assignment resolves explicit member first, then the customer's primary member for the selected axis, then leaves the task unassigned with action-log proof if no safe assignee exists.
- Follow-up task nodes preserve old-system behavior intent without porting old company/sales/event-bus internals: the new proof is `ServiceRequest` + `MailFlowActionLog`, not old `salesCompanyNote`, old `salesAuditEvent`, or old `mail-marketing.domain.sales_handoff_signal`.
- Webhook action nodes are now first-class in the bootstrap node list, but remain disabled-proof only. Flow graph validation rejects raw webhook URLs, secrets, tokens, authorization headers, API keys, and credentialed/secret-query URLs inside the flow graph.
- Added an encrypted, tenant-scoped webhook destination registry for Mail Marketing flows:
  - `MailFlowWebhookDestination` stores destination name, slug, HTTPS URL, active/disabled status, auth type, optional encrypted header secret, timeout, and metadata.
  - Prisma tenant enforcement includes `MailFlowWebhookDestination`.
  - `GET /mail-marketing/flows/webhook-destinations` lists destination records.
  - `POST /mail-marketing/flows/webhook-destinations` creates a destination after URL/auth validation.
  - `PATCH /mail-marketing/flows/webhook-destinations/:destinationId` updates a destination without exposing stored secrets.
  - Publish validation requires `config.destinationId` and rejects missing/inactive destinations.
  - Runtime disabled-proof reads the destination registry again and logs only safe destination metadata (`id`, `slug`, `status`, `authType`, `executionMode`, `hasSecret`, `timeoutMs`) plus registry validation state. It does not log raw URLs, secret values, or secret headers, and it still sends no outbound request.
  - Destination records now separate selection state from execution intent: `status=active` means a published flow may reference the destination; `executionMode=proof_only` records action-log proof; `executionMode=live_requested` records that outbound execution was requested but remains blocked until an exact target allowlist is explicitly approved.
  - Admin Mail Marketing settings now has a real Webhook destination registry panel with loading, empty, error, and loaded states plus a create form bound to the backend API. The form exposes execution mode only for active destinations and explains that live outbound is not automatic.
- Disabled side-effect action logs now sanitize config payloads before persistence, so unsafe webhook/internal-event settings cannot leak secrets into `MailFlowActionLog`.
- `emit_internal_event` nodes now write a tenant-scoped `MailMarketingEvent(status='emitted', source='mail_flow')` plus `MailFlowActionLog(status='success')`. The new system does not port the old global event bus; it records the internal event in the module ledger with flow/run/enrollment/contact context.
- Flow node processing now ignores already failed enrollments, so worker retries cannot keep re-processing a failed node.

Still open after this pass:
- Live provider sending from flow runtime is intentionally not enabled.
- Outbound webhook execution is still recorded as disabled proof. Webhook execution must not be enabled from arbitrary flow graph URLs. A live outbound executor remains gated behind explicit exact destination allowlist approval; until then `live_requested` records proof and reason without data egress.

Closed now:
- `update_contact_tag` now mutates `MailContact.tags` with action-log proof.
- `add_to_audience` and `remove_from_audience` now mutate the target `MailAudience.filters.emails` direct-email list, recalculate live audience count, and write action-log proof.
- Follow-up task creation now produces a real `ServiceRequest` for `sales`/`account` only, records `MailFlowActionLog` success/skipped proof, and uses idempotency to avoid duplicate tasks on flow retries.
- Internal event emission now produces a real tenant-scoped `MailMarketingEvent` ledger row instead of a fake disabled proof or old-system event-bus dependency.
- Webhook disabled-proof logging is now redacted, and secret-bearing webhook config is rejected before flow save/publish.
- Webhook destination registry is no longer missing. The old raw-URL node behavior was read from `backend/src/mail-marketing/mail-marketing-flows.service.ts`; the new system intentionally keeps the node capability but moves destination/security configuration out of the flow graph.

Verification evidence for this flow side-effect pass:
- `pnpm --filter @factory-engine-pro/backend exec tsc -p tsconfig.json --noEmit` passed.
- `pnpm --filter @factory-engine-pro/backend build` passed after the expected Windows sandbox EPERM retry for Prisma generate.
- `git diff --check` passed for changed flow runtime files; only existing CRLF warnings were reported.

Required runtime behavior:
- Publish creates immutable version.
- Runtime only executes published current version.
- Graph validation before publish.
- Exactly one trigger node.
- At least one action node.
- Invalid template/action/audience references block publish.
- Enrollment idempotency prevents duplicate journeys.
- Queue jobs process node transitions.
- Delay nodes schedule future execution.
- Condition nodes branch.
- Send email nodes enforce consent, suppression, quiet hours, frequency caps, and provider state.
- Action logs explain every skip/send/fail.

Required nodes:
- trigger: event, segment enter, segment exit, manual audience, date-based.
- delay: duration or scheduled date.
- condition: customer/order/contact/template/delivery fields.
- send email.
- update contact tag.
- add/remove audience.
- create follow-up task.
- webhook disabled by default unless tenant explicitly enables outbound webhooks.
- emit internal event.

Staff/customer terminology:
- Do not expose `sales` as a staff-facing label.
- Staff-facing copy should say purchase intent, reorder opportunity, customer request, follow-up, account care.
- Internal workflow may retain machine enums only if UI translations are strict.

### Send Control Gaps

Old system had layered send control. The new system keeps provider mode disabled by design, but now enforces the operational gates before proof records are created.

Required target controls:
- Provider mode: disabled, test, live.
- Category settings: transactional, account, marketing.
- Critical event lock: critical transactionals cannot be disabled casually.
- Marketing flow runtime enabled flag.
- Campaign runtime enabled flag.
- Quiet hours per tenant.
- Per-contact daily/weekly frequency caps.
- Daily tenant quota.
- Approval required threshold.
- Suppression rules.
- Retry policy.
- Bounce/complaint handling placeholders.
- Settings audit log.

Current flow-runtime coverage:
- Mail Center now has a tenant setting `providerMode` with explicit `disabled`, `test`, and `live` states. The default is `disabled`.
- `deliverQueued` enforces provider mode before contacting Resend:
  - `disabled` marks delivery as `queued_disabled` with send-control metadata.
  - `test` allows only explicit System Mail test deliveries; every other delivery becomes `queued_disabled`.
  - `live` can send only after category, subevent/type, suppression, consent, quota, and idempotency gates pass.
- Category, subevent, and marketing type gates are enforced at delivery time. Blocked category/type decisions mark the delivery `skipped` with structured send-control metadata instead of silently disappearing.
- Critical events bypass category/subevent toggles, but they do not bypass provider mode. A critical event still cannot leave proof-only mode until the tenant explicitly switches provider mode to `live`.
- System Mail UI exposes the same provider mode as an operator control: `Disabled proof only`, `Test messages only`, and `Live delivery enabled`.
- Old reference read before implementation: `backend/src/mail/mail-category.helper.ts`, `backend/src/mail/mail-settings.defaults.ts`, `backend/src/mail/mail-settings.service.ts`, and `backend/src/mail/mail.service.ts`.
- Provider stays disabled and writes `queued_disabled` proof.
- Marketing category and flow-type toggles are read from Mail Center settings.
- Active suppression, `isSendable=false`, and latest `MailConsentState(state='unsubscribed')` skip the enrollment with an action log.
- Quiet hours re-queue the same send node until the configured end time.
- Per-recipient day/week/30-day frequency caps count real marketing `MailDelivery` records.
- Tenant daily marketing cap counts real marketing `MailDelivery` records.
- Flow idempotency keys dedupe repeat domain events for 24 hours per flow/version/trigger/target/source event.
- Workflow mail now has a tenant-scoped `MailIdempotencyKey` guard. The same event + recipient + template + variable payload returns the previous delivery for 60 seconds instead of creating duplicate mail proof/sends.

Current campaign-runtime coverage:
- Campaign queue uses immutable audience snapshots and never sends from a moving live audience query.
- Campaign queue requires approved/scheduled campaign state; draft campaigns cannot create delivery proof.
- Campaign queue refuses to run if Mail Center marketing/campaign toggles are disabled.
- Campaign queue refuses to run during quiet hours and records a queue-blocked event.
- Campaign member delivery proof is skipped for not-sendable, unsubscribed, suppressed, frequency-capped, or tenant-daily-capped recipients.
- Eligible campaign recipients create `MailDelivery(status=queued_disabled)` proof only; live provider sending remains off.
- Approved scheduled campaigns enqueue a tenant-scoped BullMQ job and the scheduled worker records provider-disabled proof at scheduled time through the same campaign queue path.
- Scheduled jobs requeue for early arrival or active quiet hours, and skip without delivery proof when the campaign is no longer in `scheduled` state.

Current campaign-builder coverage:
- Campaigns pin an approved/published template revision at creation time.
- Template revisions still require approval/publish before campaign use.
- Campaign approval/schedule state is explicit before proof queueing.
- Campaign counters split queued proof, skipped, suppressed, sent, and failed.
- Campaign approval now has a real numeric policy gate, not only a generic approval state:
  - Mail Marketing settings exposes typed `approvalPolicy` with `maxReachableRecipients`, `maxSnapshotMembers`, and `maxEstimatedAudienceSpendUsd`.
  - The policy is stored in tenant-scoped `MailMarketingSetting.metadata.approvalPolicy` and returned as typed settings data.
  - Audience snapshot creation records matched order count and matched total spend in snapshot `sourceSummary`, derived from the same customer/order context used by the audience resolver.
  - `approveCampaign` re-reads the tenant settings and frozen snapshot, then blocks approval with `BadRequestException` plus a `campaign.approval_blocked_threshold` event when eligible recipients, frozen list size, or configured audience spend exceeds the policy.
  - The admin campaign UI reads the same policy, shows the approval block before the backend call when recipient/list thresholds are exceeded, and the settings screen has a real form for updating the policy without enabling provider sending.

Still open after this pass:
- Live/test provider mode exists in code and UI, but live provider mode must not be enabled for a tenant until tenant credential, bounce/complaint webhook, unsubscribe, and sender-domain contracts are verified.
- Public one-click unsubscribe/preference endpoint has backend coverage now: signed links are generated at render time, public HTML endpoints verify the token, and unsubscribe mutates tenant-scoped `MailConsentState` plus category-level `MailSuppression`. Remaining rollout proof before enabling live provider mode is live-domain browser/curl evidence against the deployed API and sender-domain/webhook verification.

Disabled mode rule:
- If provider is disabled, the system must still create the delivery, flow/campaign log, and UI evidence.
- Delivery status must be `queued_disabled` or another explicit disabled status.
- Nothing should silently disappear.

### Analytics Gaps

Old endpoints included overview, campaign, template, audience, segment, funnel, cohort, and attribution analytics.

Old-system detail read:
- `backend/src/mail-marketing/dto/analytics.dto.ts` accepted `startDate`, `endDate`, `campaignId`, `templateId`, `audienceId`, `segmentId`, `source`, `trafficChannel`, `consentState`, and `limit`.
- `backend/src/mail-marketing/mail-marketing-analytics.service.ts` exposed overview, campaign, template, audience, segment, funnel, cohort, and attribution methods.
- Old attribution depended on old `mailAttribution`, fingerprint/session, and audience health snapshot tables. Those are not copied because the new system has no approved fingerprint/event-bus lane and fake marketing attribution is forbidden.

Required target:
- Delivery counters by template/campaign/flow/category.
- Open/click placeholders only if provider/webhook source exists.
- Suppressed/skipped counters.
- Revenue/order attribution should be conservative and explicit: only link when customer/order identity is known.
- No fake marketing metrics.

Implementation added in this pass:
- Added typed analytics query contract: `mailMarketingAnalyticsQuerySchema` with `days`, `limit`, `campaignId`, `templateId`, `audienceId`, and `flowId`.
- Added real backend endpoints:
  - `GET /mail-marketing/analytics/overview`
  - `GET /mail-marketing/analytics/campaigns`
  - `GET /mail-marketing/analytics/templates`
  - `GET /mail-marketing/analytics/audiences`
  - `GET /mail-marketing/analytics/flows`
- Analytics reads only persisted tenant data:
  - `mail_deliveries`
  - `mail_provider_events`
  - `mail_campaigns`
  - `mail_audience_snapshots`
  - `mail_suppressions`
  - `mail_flow_action_logs`
  - `commerce_orders`
- Overview returns:
  - delivery proof count
  - queued/queued_disabled/sent/failed/skipped breakdown
  - active suppression count
  - recent snapshot count
  - flow action count
  - verified provider event count
  - verified delivered/opened/clicked/bounced/complained event counts
  - top campaigns/templates/audiences/flows
  - daily proof series
- Conservative revenue/order attribution is implemented only when:
  - a delivery metadata payload has `customerId`;
  - a `commerce_order.customerId` matches;
  - the order date is after the recorded delivery date inside the selected reporting window.
- No email-only, phone-only, fingerprint, or session-based attribution is used.
- Open/click metrics are shown only when verified Resend webhook rows exist in `mail_provider_events`; there is no guessed engagement.
- Added `POST /webhooks/resend/:tenantSlug` as a public but signed Resend webhook endpoint:
  - verifies raw body with Svix `svix-id`, `svix-timestamp`, and `svix-signature`;
  - requires tenant-scoped `resendWebhookSecret` or `RESEND_WEBHOOK_SECRET`;
  - deduplicates by `(tenantId, provider, providerEventId)`;
  - links events to `mail_deliveries` using the Resend email id and the outbound `delivery_id` tag;
  - stores safe webhook headers without persisting the raw signature;
  - updates `MailDelivery.metadata.providerEvents` counters/timestamps;
  - automatically suppresses recipients for `email.bounced`, `email.complained`, and `email.suppressed`.
- Added `resend_webhook_secret_encrypted` to `tenant_configs`; System Mail settings now separates the Resend API key from the webhook signing secret so send capability and event-verification capability are not confused.
- Admin Mail Marketing overview now has an "Operational proof" composition:
  - delivery proof
  - blocked/skipped
  - verified opens/clicks
  - safe revenue link
  - flow actions
  - top campaign proof table

Evidence from local verification:
- `pnpm --filter @factory-engine-pro/contracts build` passed after analytics/webhook contract fields were added.
- `pnpm --filter @factory-engine-pro/contracts exec tsc -p tsconfig.json --noEmit` passed.
- `pnpm --filter @factory-engine-pro/backend exec tsc -p tsconfig.json --noEmit` passed after `MailProviderEvent`, raw-body webhook, and suppression handling were added.
- `pnpm --filter @factory-engine-pro/admin exec tsc -p tsconfig.json --noEmit` passed after System Mail secret split and verified opens/clicks KPI were added.
- `pnpm --filter @factory-engine-pro/contracts build` passed after EPERM-required escalated dist write.
- `pnpm --filter @factory-engine-pro/api-client build` passed after EPERM-required escalated dist write.

Still intentionally not implemented:
- Fingerprint/session attribution from the old system.
- Funnel and cohort analytics that would imply provider events not present in the new data model.
- Open/click charts that infer engagement without verified `mail_provider_events`.
- Segment analytics as an old standalone report; audience analytics covers the new recipient-control room. Segment ownership remains in Operations/Commerce segmentation, not Mail Marketing analytics.

### Admin UI Gaps

Admin UI must have production screens:
- Overview.
- Contacts.
- Audiences.
- Campaigns.
- Templates.
- Flows.
- Delivery log.
- Suppression list.
- Settings.
- Health and DLQ.

Current UI ownership after this pass:
- Mail Marketing owns the recipient decision room:
  - Overview with operational proof analytics.
  - Contacts with consent/suppression/audience/delivery proof detail.
  - Audiences with live preview, typed filters, snapshots, snapshot member search, and drift diff.
  - Campaigns with draft -> approval/schedule -> disabled proof lifecycle.
  - Templates with revision, reusable snippet/block, preview profile, approval, publish, bind, duplicate, test-send proof actions.
  - Flows with versioned graph, publish/pause/resume, event trigger, run/event proof.
  - Settings with disabled provider state and safe configuration.
- System Mail owns operational delivery infrastructure:
  - Delivery log.
  - Suppression management.
  - DLQ retry/discard.
  - Provider/queue/category health.
  - Mail settings audit.
- Delivery log, suppression, health, and DLQ should not be duplicated inside Mail Marketing as separate primary tabs. Duplicating them would make the operator choose between two sources for the same delivery proof. Mail Marketing may link to System Mail details, but System Mail remains the owner of provider/queue operations.
- Mail Template is not a standalone cosmetic editor. It is a protected release lane inside Mail Marketing and System Mail template surfaces:
  - draft/edit
  - preview with real variables
  - lint/render proof
  - approval
  - publish
  - event binding
  - test-send disabled/live proof depending on provider state
- Customer Portal owns buyer-facing order/invoice/reorder behavior. It must not expose admin marketing analytics, flow internals, provider debug, or suppression/DLQ operations.

Every screen must have:
- Empty state.
- Loaded state.
- Error state.
- No mock rows.
- Real API actions.
- Meaningful error messages.

## Gap Matrix: Mail Center

Old Mail Center was not only templates. It was an operational mail console.

Old endpoint parity now covered in the new Mail Center:
- `GET /mail/delivery-log` is added as an alias over the tenant-scoped `MailDelivery` list.
- `GET /mail/delivery-log/:id` is added as an alias over the tenant-scoped delivery detail.
- `GET /mail/suppression`, `POST /mail/suppression`, and `POST /mail/suppression/:id/unsuppress` are implemented.
- `GET /mail/dlq`, `POST /mail/dlq/:id/retry`, and `POST /mail/dlq/:id/discard` are implemented.
- `GET /mail/settings`, `PATCH /mail/settings`, `POST /mail/settings/reset`, and `GET /mail/settings/audit` are implemented.

Implementation added in this pass:
- `MailListQuery` now supports category filtering so delivery proof can be filtered by system/account/marketing behavior instead of only event/recipient/status.
- `/mail/health` now returns provider state plus operational proof: outbound BullMQ job counts, DLQ status counts, and last-24h delivery counts by status and category.
- Provider-missing or provider-error states now include a business-facing disabled/blocking reason while still returning queue/DLQ/delivery proof.
- Admin System Mail health UI now shows the operational proof block instead of exposing only a provider ping.

Required production behavior:
- Failed mail jobs are visible.
- Retry/discard is explicit.
- Suppression can be managed with audit trail.
- Settings changes are audit logged.
- Health exposes provider state, queue state, and disabled reason.

## Gap Matrix: Customer Portal

### Account Home and First Viewport

Old behavior:
- Customer account area led buyers toward orders, invoice-like documents, and reorder/account actions without requiring staff explanation.

Pre-implementation gaps found:
- New `apps/accounts` root route redirected to `/addresses`, so the first screen did not answer what the buyer should do next.
- Recent orders, open invoices, reorder-ready items, and active cart/review state were split across separate pages with no customer-safe decision layer.

Implementation added in this pass:
- `apps/accounts/src/routes/index.tsx` now renders a real account home instead of redirecting.
- The home screen reads from existing scoped APIs only:
  - `fetchBuyerOrders({ status: 'all', limit: 3 })`
  - `fetchInvoices({ status: 'all', limit: 5 })`
  - `fetchReorderTemplates()`
  - `fetchActiveCart()`
- The first viewport chooses one state-derived primary action:
  - review/pay open invoices;
  - review active cart;
  - start reorder;
  - open orders.
- The screen separates recent orders, official invoices, reorder options, and active cart/review request so order receipts do not look like payable invoices and unavailable checkout does not look successful.
- Sidebar now exposes `Home` as the default account entry; `/` no longer makes `Addresses` the mental model of the whole customer portal.
- Home has separate loading, empty, error, and loaded states for orders, invoices, reorder templates, and active cart.

Required target:
- The customer portal first screen must show the customer's next useful action before history/debug/detail.
- The first screen must be powered by tenant/customer-scoped APIs, not mock or static data.
- The first screen must distinguish orders, official invoices, reorder availability, checkout-ready cart, and review-required cart.
- Empty states must explain what is missing and link to a safe next action.

### Order List and Detail

Old behavior:
- Customer sees scoped order list.
- Customer can open order detail.
- Detail shows status, totals, shipping, tracking, line items, item properties, and design files.
- Filters include pickup/design file status in old account controller.

Pre-implementation gaps found:
- Account portal has order list, but not production order detail.
- `BuyerOrder` contract is minimal.
- Property-rich line item detail is not exposed to customer portal.
- Design file metadata exists in new order service but is not fully bound to accounts UI.

Implementation added in this pass:
- `GET /accounts/orders/:orderId` with tenant/customer-scoped order detail.
- `GET /accounts/orders` now accepts customer-portal query params: `search`, `status`, `limit`, `cursor`, `pickupOnly`, and `hasDesignFiles`.
- Order list now returns `{ data, meta }`, where `meta.count`, `meta.pageCount`, and `meta.nextCursor` make the UI paged instead of rendering a long unbounded list.
- Order search is resolved on the backend inside the customer-owned order scope; search never widens visibility beyond `customerId`, `customerUserId`, or `shopifyCustomerId`.
- Detail normalizes line item properties and design files instead of dumping raw Shopify JSON.
- Order matching includes the current customer id and the customer's Shopify customer id, mirroring the old system's important ownership lesson without introducing loose email matching.
- Accounts UI opens order detail inline and keeps item-level reorder on the item row.
- Accounts UI adds order search, status tabs, page-size selector, previous/next paging, and page-aware KPI labels so the customer does not confuse visible-page totals with lifetime totals.
- Customer portal order list pagination now matches the UIX contract: default remains 10 rows, and deliberate expansion options are 50, 100, and 150. The contract allows small summary requests for the account home, but long-list browsing no longer offers the old 25-row option or caps at 100.

Required target:
- `GET /accounts/orders`
- `GET /accounts/orders/:id`
- `GET /accounts/orders/:id/line-items` or equivalent line item detail inside order detail
- All responses are tenant and customer scoped.
- Customer can only see own customer/customer-user orders.
- Every line item includes normalized properties, design files, product/variant identity, SKU, quantity, price, fulfillment/tracking where available.
- Long order lists are search-first and paginated at the API boundary.

### Reorder

Old behavior:
- Whole order reorder.
- Single line item reorder.
- Resolver checks product/variant availability.
- Adds reorderable items to cart.
- Returns checkout/review/contact-support action.

Pre-implementation gaps found:
- Reorder pages exist but buttons are disabled.
- `reorderTemplates` are display-only.
- No customer cart endpoint.
- No item-level reorder action.
- No checkout/review outcome.

Implementation added in this pass:
- `POST /accounts/orders/:orderId/reorder`.
- `POST /accounts/orders/:orderId/line-items/:lineItemId/reorder`.
- Persistent `AccountReorderCart` and `AccountReorderCartItem`.
- Resolver checks current catalog variant by Shopify variant id or SKU.
- If checkout cannot be confirmed, the result is `review_portal_cart`, not fake checkout success.
- Reorder page and order detail buttons call real API actions.
- Active cart lifecycle endpoints now exist for customer portal review carts.
- Catalog "Add to cart" now writes to the real active cart API instead of showing a disabled/static checkout button.
- Cart page reads the active cart, supports quantity update, item removal, and checkout-review request with no fake checkout URL.
- Accounts checkout now mirrors the old customer-account reorder behavior more closely: after a reorder cart is created, the backend attempts to create a Shopify draft order through tenant-scoped Shopify Admin credentials and stores the returned invoice checkout URL only when Shopify confirms it.
- `POST /accounts/cart/:cartId/checkout` also attempts Shopify draft-order checkout before falling back to account review.
- Failed checkout creation is not presented as success. The cart stays `review_required`, `checkoutError` is persisted, and the customer sees a review/contact outcome.
- Order detail now shows a real checkout link when the reorder response includes one, or a cart review link when checkout falls back to review.
- Reorder resolution now requires a current `CatalogVariant` match and `availableForSale=true` before an item is treated as reorderable. A historical order line with only an old SKU or Shopify variant reference is not accepted as confirmed availability by itself.
- Reorder cart pricing now uses the current matched catalog variant price, not the historical order line price. Unmatched or unavailable items stay in the cart proof with a readable review/unavailable reason and are excluded from checkout subtotal.
- Customer-facing reorder result panels now provide the next safe action immediately: proceed to the confirmed checkout URL, review the created cart, or read why the item was not reorderable.
- Active cart UI follows the same distinction: an existing checkout URL opens the real checkout directly without re-submitting a checkout request; review carts show a separate account-review request action; unavailable carts disable checkout and keep the blocker visible.
- Persistent `AccountReorderCartActivity` now records customer-safe cart/reorder events: cart created, item added, quantity changed, item removed, checkout ready, checkout unavailable, or account review requested.
- Active cart responses include the latest cart activity records so the buyer sees a concise cart timeline beside checkout/review actions. This is not a raw audit/debug feed; labels and details are generated by backend domain actions.
- `AccountReorderCartActivity` is tenant-scoped, customer-scoped, cart-scoped, and covered by the central Prisma tenant model list.

Required target:
- `POST /accounts/orders/:id/reorder`
- `POST /accounts/orders/:id/line-items/:lineItemId/reorder`
- `GET /accounts/cart/active` implemented.
- `POST /accounts/cart` implemented.
- `POST /accounts/cart/:id/items` implemented.
- `PATCH /accounts/cart/:id/items/:itemId` implemented.
- `DELETE /accounts/cart/:id/items/:itemId` implemented.
- `POST /accounts/cart/:id/checkout` implemented.

Resolver outcomes:
- `checkout`: Shopify returned a confirmed draft order invoice URL.
- `review_cart`: cart exists but checkout is not confirmed.
- `account_review`: customer explicitly requested checkout/review and Shopify checkout still could not be created.
- `unavailable`: no reorderable item can be confirmed.

No fake checkout links. If Shopify checkout cannot be created, return review/contact action with reason.

Evidence from local verification for reorder activity pass:
- `AccountReorderCartActivity` Prisma model added with `tenantId`, `cartId`, `customerId`, action, label/detail, actor, metadata, and created-at indexes.
- `services/backend/src/shared/prisma.service.ts` includes `AccountReorderCartActivity` in the tenant-enforced Prisma model list.
- Accounts backend writes activity rows for cart create, catalog item add/update/remove, order reorder cart creation, checkout-ready, checkout-unavailable, checkout-reopened, and account-review outcomes.
- Active cart API response includes latest activity rows; `apps/accounts/src/routes/cart.tsx` renders them as a buyer-facing "Cart timeline".
- `pnpm --filter @factory-engine-pro/backend exec prisma validate --schema prisma/schema.prisma` passed with a dummy local `DATABASE_URL`.
- `pnpm --filter @factory-engine-pro/contracts exec tsc -p tsconfig.json --noEmit` passed.
- `pnpm --filter @factory-engine-pro/backend exec tsc -p tsconfig.json --noEmit` passed.
- `pnpm --filter @factory-engine-pro/accounts exec tsc -p tsconfig.json --noEmit` passed.
- `pnpm --filter @factory-engine-pro/accounts build` passed after sandbox escalation for Vite config access; remaining output is the existing large chunk warning.

### Invoices

Old behavior:
- Staff creates/uploads invoices.
- Customer sees invoices.
- Payment state is computed.
- Invoice detail and payment actions exist.

Pre-implementation gaps found:
- Account invoices are pseudo-derived from orders.
- No persistent invoice model was found for customer portal parity.
- No payment state event history.
- No upload/download/payment action parity.

Implementation added in this pass:
- Persistent tenant-scoped `AccountInvoice`.
- Persistent tenant-scoped `AccountInvoicePayment` and `AccountInvoiceActivity` for payment and state-change evidence.
- `GET /accounts/invoices` now reads persisted invoices only and accepts customer-portal query params: `search`, `status`, `limit`, and `cursor`.
- Invoice list now returns `{ data, meta }`, where `meta.count`, `meta.pageCount`, and `meta.nextCursor` make invoice browsing paged/search-first.
- `GET /accounts/invoices/:invoiceId` returns invoice detail, line items, payment/download state, and clear `contact_billing` fallback.
- `GET /accounts/invoices/:invoiceId/download` returns a real download action only when a persistent invoice file exists.
- `POST /accounts/invoices/:invoiceId/pay` returns paid, payment-link, or contact-billing state without inventing payment links.
- Customer invoice detail now exposes customer-safe payment history and invoice timeline labels without staff ids or raw activity metadata.
- Accounts UI explicitly says order receipts are not shown as payable invoices.
- Accounts UI adds invoice search, status tabs, page-size selector, previous/next paging, and page-aware KPI labels so visible-page totals are not mistaken for all-time account finance totals.
- Accounts UI separates "Pay invoice" from "Download invoice"; file links are not shown as payment methods.
- Customer portal invoice list pagination now matches the UIX contract: default remains 10 rows, and deliberate expansion options are 50, 100, and 150.
- Admin order detail now has an invoice operations panel for create, file/payment link update, manual payment record, paid/void status update, and duplicate.
- Admin invoice endpoints now cover list, detail, order-scoped list, create, file update, status update, payment record, duplicate, and mark-overdue.
- Admin invoice creation now mirrors the old production guard: a non-draft invoice cannot be created twice for the same order, and an explicitly selected customer must match the selected order's customer.
- Issued invoice files are immutable: once a non-draft invoice has a file URL, the backend rejects replacing or clearing that file; staff must duplicate or void before attaching a different file.
- Invoice file/payment URLs are backend-validated as `http://` or `https://` before they can become customer or admin actions.
- Customer portal invoice APIs hide draft invoices completely, so a staff draft cannot appear to buyers as an unpaid/payable invoice.
- Invoice status is normalized from payment state on create/status/payment mutations, so partial and paid invoices cannot remain displayed as unpaid after staff records payment.

Required target:
- `AccountInvoice` now exists for customer portal invoice records.
- `AccountInvoicePayment` and `AccountInvoiceActivity` now exist so staff actions are not hidden in derived order math.
- `GET /accounts/invoices` implemented.
- `GET /accounts/invoices/:id` implemented.
- `GET /accounts/invoices/:id/download` implemented with missing-file error instead of fake file output.
- `POST /accounts/invoices/:id/pay` implemented with payment-link output only when `externalPaymentUrl` is configured; otherwise it returns `contact_billing`.
- Long invoice lists are search-first and paginated at the API boundary.

Admin/staff side:
- Create invoice.
- Upload invoice file.
- Mark paid/void/overdue.
- Record payment.
- Duplicate invoice.
- Audit state changes.

Admin/staff endpoints implemented in the new target:
- `GET /orders/invoices`
- `POST /orders/invoices`
- `POST /orders/invoices/mark-overdue`
- `GET /orders/invoices/:invoiceId`
- `POST /orders/invoices/:invoiceId/status`
- `POST /orders/invoices/:invoiceId/file`
- `POST /orders/invoices/:invoiceId/record-payment`
- `POST /orders/invoices/:invoiceId/duplicate`
- `GET /orders/:id/invoices`

### Customer Account Extension

Old Shopify customer account extension showed orders, invoices, and reorder inside Shopify customer account.

Decision for this transfer:
- Keep the standalone `apps/accounts` portal as the only customer order, invoice, reorder, cart, document, and account-detail surface.
- Do not port the old `extensions/customer-account-extension` as-is. It includes out-of-scope old-system surfaces such as discounts, loyalty, quotes, wishlist, support, addresses, team management, and analytics.
- Shopify Customer Account UI is allowed only as a thin entry surface backed by the same `AccountsService` logic. It cannot become a second order, invoice, cart, document, support, quote, loyalty, wishlist, team, analytics, or address system.
- The new backend now owns the verified Shopify customer-session bridge at `/customer-account/*`: it verifies the Shopify session token with the tenant-scoped Shopify API secret, resolves the Shopify customer id to the tenant-scoped `Customer`, resolves one active `CustomerUser`, sets customer-role permissions in `TenantContextService`, and then calls the existing account lifecycle service.
- The extension must stay visually smaller than the standalone portal: first viewport summary, recent orders, open invoices, reorder-ready templates, active cart state, and portal deep links. Deep order detail, files, invoice payment, cart review, and documents remain in `apps/accounts`.

Why this is the correct pure-logic choice:
- The old extension authenticated against an old `/customer-account` API with Shopify `sessionToken`; the new bridge keeps that verified Shopify-session boundary but maps it to the new `Tenant -> Customer -> CustomerUser` model.
- Guessing identity is still forbidden. If the token shop domain, tenant config, API secret, Shopify customer id, linked `Customer`, or active `CustomerUser` cannot be proven, the bridge rejects the request with a customer-safe authorization error.
- Keeping `AccountsService` as the execution owner preserves tenant enforcement, customer scoping, customer-role permissions, and the new order/invoice/reorder lifecycle already implemented in `apps/accounts` and `AccountsController`.
- No first-party JWT is minted for the extension in this pass. The session token is verified per request, then the request-scoped tenant/principal context is set before existing account methods run.

## Permission Gaps

Old gap:
- Broad `settings.read` / `settings.write` permissions were not enough for Mail Template, Mail Center, Mail Marketing, and Customer Portal work. A member who can edit tenant settings should not automatically be able to publish templates, approve campaigns, retry DLQ jobs, or change suppression state.

Implemented in this pass:
- Added granular member permission constants:
- `mail.template.read`
- `mail.template.write`
- `mail.template.approve`
- `mail.template.publish`
- `mail.delivery.read`
- `mail.delivery.retry`
- `mail.suppression.read`
- `mail.suppression.write`
- `mail.settings.read`
- `mail.settings.write`
- `mail.marketing.contact.read`
- `mail.marketing.contact.write`
- `mail.marketing.audience.read`
- `mail.marketing.audience.write`
- `mail.marketing.campaign.read`
- `mail.marketing.campaign.write`
- `mail.marketing.campaign.approve`
- `mail.marketing.campaign.publish`
- `mail.marketing.flow.read`
- `mail.marketing.flow.write`
- `mail.marketing.flow.publish`
- Added migration `202607041930_mail_permission_split` to backfill those mail permissions into existing `owner` and `admin` system roles.
- `DEFAULT_MEMBER_ROLES` now grants the mail permission family to owner/admin on bootstrap.
- Admin sidebar now shows System Mail from `mail.delivery.read` and Mail Marketing from `mail.marketing.contact.read`, not generic settings permission.
- Backend guard split:
  - Mail Center delivery/health/DLQ read routes use `mail.delivery.read`.
  - Retry/discard uses `mail.delivery.retry`.
  - Suppression read/write uses `mail.suppression.*`.
  - Mail settings read/write uses `mail.settings.*`.
  - Email template read/write/approve/publish routes use `mail.template.*`.
  - Mail Marketing contact/audience/campaign/flow routes use their own `mail.marketing.*` permissions.
  - Campaign queue/proof requires `mail.marketing.campaign.publish`; campaign approval requires `mail.marketing.campaign.approve`.
  - Flow event trigger/replay/resume/publish requires `mail.marketing.flow.publish`.
- Admin Mail Marketing and System Mail write buttons no longer depend only on `settings.write`; they check mail-specific permission families.
- Fine-grained per-button UI hiding is now split to match the backend guards:
  - Mail Template UI: create/update/test/profile/snippet/block/source actions use `mail.template.write`; approval uses `mail.template.approve`; publish/activate uses `mail.template.publish`.
  - Mail Marketing Audience UI: save audience and freeze snapshot use `mail.marketing.audience.write`; preview remains read-only.
  - Mail Marketing Campaign UI: create/pause/cancel use `mail.marketing.campaign.write`; approve uses `mail.marketing.campaign.approve`; queue/proof uses `mail.marketing.campaign.publish`.
  - Mail Marketing Flow UI: create/pause use `mail.marketing.flow.write`; publish/resume use `mail.marketing.flow.publish`.
  - System Mail UI: test mail uses `mail.template.write`; Resend key and send controls use `mail.settings.write`; suppression add/restore uses `mail.suppression.write`; delivery/DLQ retry/discard uses `mail.delivery.retry`.
- Verification for the granular admin permission UI pass:
  - `pnpm --filter @factory-engine-pro/admin exec tsc -p tsconfig.json --noEmit`
  - `pnpm --filter @factory-engine-pro/admin build` passed; Vite reported only the existing large chunk warning.

Still intentionally limited:
- Customer Portal permissions below remain customer-role permissions and are not managed through member mail permissions.

Customer portal permission keys aligned in this pass:
- `accounts.order.read_own`
- `accounts.order.create_own`
- `accounts.order.reorder_own`
- `accounts.invoice.read_own`
- `accounts.cart.write_own`
- Added migration `202607041945_customer_portal_permission_split` to backfill those permissions into existing `b2b_admin` and `b2b_user` system roles.
- Backend Accounts routes now split guards:
  - order list/detail/tracking/pickup/template reads use `accounts.order.read_own`;
  - whole-order and item-level reorder use `accounts.order.reorder_own`;
  - cart active/create/update/remove/checkout use `accounts.cart.write_own`;
  - invoice list/detail/download/pay use `accounts.invoice.read_own`.

Admin/staff UI must hide unavailable actions by permission, but backend must still enforce every permission.

Evidence from local verification:
- `git diff --check` passed; only existing CRLF conversion warnings were reported.
- `pnpm --filter @factory-engine-pro/contracts exec tsc -p tsconfig.json --noEmit` passed.
- `pnpm --filter @factory-engine-pro/backend exec tsc -p tsconfig.json --noEmit` passed.
- `pnpm --filter @factory-engine-pro/admin exec tsc -p tsconfig.json --noEmit` passed after rebuilding contracts dist.
- Selected production build passed after Windows EPERM-required dist write escalation: `pnpm --filter @factory-engine-pro/contracts --filter @factory-engine-pro/api-client --filter @factory-engine-pro/backend --filter @factory-engine-pro/admin build`.
- Customer portal permission split verification passed: `pnpm --filter @factory-engine-pro/contracts --filter @factory-engine-pro/api-client --filter @factory-engine-pro/backend --filter @factory-engine-pro/admin --filter @factory-engine-pro/accounts build`.
- Build warning remaining: Vite reports the admin and accounts bundle chunks are larger than 500 kB; this is not a permission split failure, but should be tracked as a later frontend performance task.

## Required Migrations

Mail center:
- Add suppression table.
- Added consent state table for contact/channel/category state.
- Add DLQ table.
- Add mail settings audit table.
- Added mail idempotency table for duplicate transactional/workflow delivery prevention.
- Added flow idempotency table for duplicate domain-event enrollment prevention.
- Added `provider_mode` to `mail_center_settings` with default `disabled` so provider send mode is explicit tenant state, not an environment-only side effect.
- Extend `MailDelivery` for category, event key, template/version/campaign/flow references, disabled reason, provider response, retry metadata.

Mail template:
- Add template binding table.
- Add block/snippet/profile tables.
- Add approval table.
- Extend template version for source, rendered metadata, lint/spam result, approval state.

Mail marketing:
- Add contact identity table.
- Add audience snapshot and snapshot member tables.
- Add campaign tables.
- Add flow version/node/run/enrollment/action log tables.
- Add analytics rollup and attribution tables.

Customer portal:
- Added persistent account invoice table for customer-facing records.
- Added reorder cart and cart item tables.
- Added reorder cart activity table for checkout/review/cart mutation outcomes.
- Extended customer order API surface for property-rich detail.
- Reorder activity is customer-safe and must not expose raw Shopify/admin/provider internals.

All tables:
- Must include `tenantId`.
- Must have tenant-scoped unique indexes.
- Must use new id prefixes where applicable.
- Must not rely on old merchant/company ids as primary identity.

## Implementation Order

1. Contracts and schema
   - Add zod DTOs and enums first.
   - Add tenant-scoped Prisma models.
   - Add explicit disabled-provider statuses.

2. Mail center foundation
   - Settings, suppression, consent, DLQ, delivery log.
   - Keep provider disabled-safe.
   - Add UI tabs and evidence.

3. Email template system
   - Event bindings.
   - Revision lifecycle.
   - Preview profiles.
   - Publish/approval.
   - Test send through real delivery queue with disabled-safe result.

4. Marketing contacts and audiences
   - Contact graph from current `Customer`, `CustomerUser`, Shopify customer, and order identity.
   - Audience criteria/preview/snapshot/diff.

5. Campaign builder
   - One-off campaign draft/approval/schedule.
   - Audience snapshot required before send.
   - Disabled provider logs deliveries as `queued_disabled`.

6. Flow runtime
   - Flow versions/nodes/runs/enrollments/action logs.
   - Queue-backed node processing.
   - Delay and condition support.
   - Send controls.

7. Customer portal commerce lifecycle
   - Order detail.
   - Item-level reorder.
   - Cart/checkout/review/contact-support path.
   - Real invoice lifecycle.
   - Thin Shopify Customer Account UI entry surface after verified Shopify session-token bridge; deep account work remains in the standalone portal.

8. UI binding and proof
   - Admin mail/template/marketing pages.
   - Customer portal order/invoice/reorder pages.
   - Three UI states per screen.
   - No mock data.

## Acceptance Gates

Mail Template:
- Template event workspace loads from DB.
- Create variant works.
- Create/update/duplicate/delete revision works.
- Preview renders with selected profile.
- Publish requires valid variables and permission.
- Test send creates a real `MailDelivery`.
- Disabled provider creates `queued_disabled`, not fake success.
- Delivery log shows the test send.

Mail Marketing:
- Contacts are populated from real customer/order/shopify identity data.
- Audience preview returns real count/sample.
- Audience snapshot persists members.
- Campaign cannot be drafted, approved, or queued from a moving live audience; it must use a selected frozen snapshot.
- Campaign can be drafted, approved, and queued only after snapshot selection.
- Flow can be drafted, validated, published, and simulated.
- Flow execution creates run/enrollment/action-log rows.
- Suppressed/unsubscribed contacts are skipped with reason.
- Quiet hours/frequency caps are enforced.
- Disabled provider still writes delivery evidence.

Customer Portal:
- Customer lands on account home first, not an unrelated address page.
- Account home shows recent orders, open invoices, reorder-ready items, and active cart/review state from real scoped APIs.
- Customer sees only their own orders.
- Order and invoice lists are API-paginated/search-first; UI does not fetch unbounded customer history.
- Customer opens order detail with line item properties and design files.
- Customer can reorder whole order.
- Customer can reorder one line item.
- Unavailable variants return a clear action.
- Cart persists.
- Cart shows a customer-safe activity timeline for cart creation, item changes, checkout-ready, unavailable, and account-review outcomes.
- Checkout/account-review result is real and does not look like checkout success unless a confirmed checkout URL exists.
- Invoices are real persisted records, not order-derived placeholders.
- Customer can open invoice detail/download/pay only when configured.
- Customer portal copy uses customer-safe account review language; internal review wording is not shown in the normal buyer cart/reorder path.
- Order detail shows item-level reorder readiness and unavailable reason in the row, not only as hidden tooltip text.

Evidence required before marking done:
- `pnpm --filter @factory-engine-pro/contracts exec tsc -p tsconfig.json --noEmit`
- `pnpm --filter @factory-engine-pro/backend exec tsc -p tsconfig.json --noEmit`
- `pnpm --filter @factory-engine-pro/admin exec tsc -p tsconfig.json --noEmit`
- `pnpm --filter @factory-engine-pro/accounts exec tsc -p tsconfig.json --noEmit`
- Prisma schema validation with dummy local `DATABASE_URL`.
- `pnpm --filter @factory-engine-pro/accounts build` passes; current remaining warning is only the existing large bundle warning.
- DB query showing new rows and tenant isolation.
- API calls for happy path and permission-denied path.
- Queue job proof for mail/flow/reorder side effects.
- Resend webhook proof: signed event accepted, duplicate `svix-id` ignored, `mail_provider_events` row linked to a delivery, bounce/complaint creates active suppression.
- Admin UI screenshots for empty/loaded/error states.
- Customer portal screenshots for order detail, reorder, cart, invoice.
- Provider-disabled mail proof with `queued_disabled`.

Latest local verification evidence:
- `pnpm --filter @factory-engine-pro/accounts exec tsc -p tsconfig.json --noEmit` passed after the campaign DTO/contracts update.
- `pnpm --filter @factory-engine-pro/accounts build` passed after Windows sandbox escalation; Vite still reports the existing large chunk warning.
- `pnpm --filter @factory-engine-pro/backend exec tsc -p tsconfig.json --noEmit` passed after invoice lifecycle hardening.
- `pnpm --filter @factory-engine-pro/admin exec tsc -p tsconfig.json --noEmit` passed after invoice lifecycle hardening.
- `pnpm --filter @factory-engine-pro/accounts exec tsc -p tsconfig.json --noEmit` passed after invoice lifecycle hardening.
- `git diff --check` passed for the invoice lifecycle hardening files; only existing CRLF conversion warnings were reported.
- `pnpm --filter @factory-engine-pro/backend build` passed after Windows sandbox escalation for Prisma client generation.
- `pnpm --filter @factory-engine-pro/accounts build` passed after Windows sandbox escalation; Vite still reports the existing large chunk warning.
- Customer portal UIX hardening: cart, order detail, and reorder result alerts now separate confirmed checkout (`success`) from review-required cart (`info`), account review copy replaces old internal review copy in buyer-facing paths, and item-level reorder blockers are visible in order detail rows.
- `pnpm --filter @factory-engine-pro/accounts exec tsc -p tsconfig.json --noEmit` passed after customer portal UIX hardening.
- `git diff --check` passed for the customer portal UIX hardening files; only existing CRLF conversion warnings were reported.
- `pnpm --filter @factory-engine-pro/accounts build` passed after Windows sandbox escalation; Vite still reports the existing large chunk warning.
- System Mail UI now exposes provider-disabled proof as a separate "Proof only" KPI and labels `queued_disabled` as "Disabled proof recorded", so proof records are not visually counted as sent mail.
- `pnpm --filter @factory-engine-pro/admin exec tsc -p tsconfig.json --noEmit` passed after System Mail proof-only UIX hardening.
- `git diff --check` passed for the System Mail proof-only hardening files; only existing CRLF conversion warnings were reported.
- Mail Marketing UI copy no longer exposes `queued_disabled` or "managed Redis worker" in operator-facing guidance; it uses proof-only delivery and scheduled proof-run language while keeping enum handling in code.
- `pnpm --filter @factory-engine-pro/admin exec tsc -p tsconfig.json --noEmit` passed after Mail Marketing proof-copy hardening.
- `git diff --check` passed for the Mail Marketing proof-copy hardening files; only existing CRLF conversion warnings were reported.
- `pnpm --filter @factory-engine-pro/admin build` passed after Windows sandbox escalation; Vite still reports the existing large chunk warning.
- Customer portal checkout hardening: backend checkout failures no longer expose staff-routing wording, Shopify credential, missing variant id, or draft-order technical messages through buyer-facing `checkoutError`; public responses use account-review language while the raw reason is retained only as `checkoutInternalError` metadata for proof/debug.
- Customer portal checkout action terminology now uses `account_review`, and cart/order/reorder UI labels use "Account review cart saved", "Open cart", and "saved cart" so review state cannot look like checkout success or internal routing.
- System Mail KPI tone hardening: `.sr-kpi.info` now maps to the info token, so provider-disabled proof count has a distinct non-sent visual treatment in the operational proof strip.
- Customer portal source search returned no legacy staff-routing or manual-cart terminology after the checkout terminology pass.
- `pnpm --filter @factory-engine-pro/backend exec tsc -p tsconfig.json --noEmit` passed after customer-safe checkout error mapping.
- `pnpm --filter @factory-engine-pro/accounts exec tsc -p tsconfig.json --noEmit` passed after the `account_review` action update.
- `git diff --check` passed for the customer checkout terminology, System Mail KPI tone, and accounts backend hardening files; only existing CRLF conversion warnings were reported.
- `pnpm --filter @factory-engine-pro/accounts build` passed after Windows sandbox escalation; Vite still reports the existing large chunk warning.
- `pnpm --filter @factory-engine-pro/admin build` passed after Windows sandbox escalation; Vite still reports the existing large chunk warning.
- Old Resend webhook reference read from `C:\Users\mhmmd\Desktop\eagle-engine.dev\eagledtfprint\backend\src\webhooks\handlers\resend.handler.ts`: the old system resolved delivery by provider message id, deduped webhook events in the merchant scope, and created contact suppressions for bounce/complaint events.
- Resend webhook tenant/idempotency hardening: the new handler now explicitly scopes `mail_provider_events` duplicate detection and race-condition duplicate handling by `tenantId`, resolves tagged/provider-message deliveries inside the same tenant, updates linked delivery metadata inside the same tenant, and suppresses provider-bounced/complained recipients through tenant-scoped `mail_contacts` and `mail_suppressions`.
- Resend webhook signature/parsing logic is now extracted into a dedicated helper so the Svix raw-body contract can be tested without constructing the full mail service. The regression test covers exact raw-body HMAC verification, mutated raw-body rejection, `email_id`/recipient/subject/timestamp parsing, required `svix-id`, and safe header storage without persisting the raw signature.
- Mail center operational proof hardening: suppression management, DLQ list/retry/discard, mail center settings/audit, provider key lookup, workspace brand lookup, DLQ recording, and 24h delivery/DLQ health counts now include explicit tenant scope in the service queries instead of relying only on the Prisma tenant extension.
- `pnpm --filter @factory-engine-pro/backend exec tsc -p tsconfig.json --noEmit` passed after Resend webhook tenant/idempotency hardening.
- `pnpm --filter @factory-engine-pro/backend run test:resend-webhook` passed after extracting the Resend webhook helper.
- `pnpm --filter @factory-engine-pro/backend exec tsc -p tsconfig.build.json --noEmit` passed after excluding `**/*.test.ts` from the production build config.
- `git diff --check` passed for the mail webhook/mail center tenant-scope hardening files; only existing CRLF conversion warnings were reported.
- Old customer order/address reference read from `C:\Users\mhmmd\Desktop\eagle-engine.dev\eagledtfprint\accounts\app\orders\[id]\page.tsx` and `accounts\app\tracking\page.tsx`: customer-facing order detail rendered shipping address as individual fields (`name`, `company`, `address1`, `address2`, `city`, `province`, `zip`, `country`) instead of exposing raw Shopify address payloads.
- Customer portal raw-payload hardening: account order detail now parses JSON-string Shopify address/property payloads, normalizes shipping/billing address fields into customer-readable `formatted` lines, rejects raw structured `formatted` payloads, renders object/array line item property values as readable field text instead of raw JSON or `[object Object]`, and no longer returns raw `fulfillments` / `refunds` Shopify arrays from the customer order-detail API.
- `pnpm --filter @factory-engine-pro/backend exec tsc -p tsconfig.json --noEmit` passed after customer portal address/property formatting hardening.
- `pnpm --filter @factory-engine-pro/accounts exec tsc -p tsconfig.json --noEmit` passed after customer portal address/property formatting hardening.
- Three-module UIX composition contract was tightened in `docs/migration/three-module-uix-composition.md`: the canonical brainstorming section now names the separate confusion risk for Mail Template, Mail Marketing, and Customer Portal, limits first-viewport density, and requires decision -> context -> proof composition before code.
- Three-module UIX composition contract was tightened again for the current product requirement: the top authoritative board now requires a written usability brainstorm before UI work, defines Mail Template as a release lane, Mail Marketing as a recipient control room, and Customer Portal as a buyer account desk, and blocks routes that are feature-rich but confusing, dense, or unclear about the next safe action.
- Three-module UIX composition contract now has a mandatory pre-code worksheet: each route must name the role, one job, most dangerous misunderstanding, state that prevents it, one safe next action, and lower/proof details before implementation. The brainstorm pins Mail Template to accidental-release prevention, Mail Marketing to live-vs-frozen/proof-vs-delivery prevention, and Customer Portal to customer-safe action-vs-review-state prevention.
- Mail Center provider-mode enforcement: `mail_center_settings.provider_mode` defaults to `disabled`; `deliverQueued` blocks disabled/test provider modes before Resend, writes `queued_disabled` proof for provider-mode blocks, writes `skipped` proof for category/subevent/type blocks, and keeps critical-event bypass below provider-mode safety.
- System Mail UI now exposes provider send mode from the real Mail Center settings API instead of an environment-only assumption.
- `pnpm --filter @factory-engine-pro/backend exec prisma validate --schema prisma/schema.prisma` passed with a dummy local validation URL.
- `pnpm --filter @factory-engine-pro/backend exec prisma generate --schema prisma/schema.prisma` passed after Windows sandbox escalation.
- `pnpm --filter @factory-engine-pro/contracts exec tsc -p tsconfig.json --noEmit` passed after provider-mode contract update.
- `pnpm --filter @factory-engine-pro/contracts build` passed after Windows sandbox escalation to refresh package dist declarations used by admin.
- `pnpm --filter @factory-engine-pro/backend exec tsc -p tsconfig.json --noEmit` passed after provider-mode send-control enforcement.
- `pnpm --filter @factory-engine-pro/admin exec tsc -p tsconfig.json --noEmit` passed after System Mail provider-mode UI wiring.
- `git diff --check` passed for the touched UIX/provider-mode files; only existing CRLF conversion warnings were reported.
- `pnpm --filter @factory-engine-pro/admin build` passed after Windows sandbox escalation; Vite still reports the existing large chunk warning.
- Old Mail Marketing flow reference re-read from `C:\Users\mhmmd\Desktop\eagle-engine.dev\eagledtfprint\backend\src\mail-marketing\mail-marketing-flows.service.ts`, `mail-marketing.controller.ts`, and `dto/flow.dto.ts`: the old system validates graph structure during create/update and validates publishable references before publish; it does not expose a separate standalone HTTP simulate endpoint.
- Mail Marketing flow validation/simulation acceptance gate was closed in the new pure-logic surface: contracts now define `validateMailFlowSchema`, `simulateMailFlowSchema`, `MailFlowValidationResponse`, and `MailFlowSimulationResponse`; backend exposes `POST /mail-marketing/flows/:flowId/validate` and `POST /mail-marketing/flows/:flowId/simulate`.
- Flow validation now returns issue/warning proof for the selected latest/active version while preserving the existing strict publish exception path. Publish still blocks on the same graph/reference rules.
- Flow simulation is proof-only by design: it reads the saved tenant-scoped flow version, returns a node-by-node "would do" plan, and does not create enrollments, deliveries, service requests, audience membership mutations, internal events, queue jobs, or outbound webhooks.
- Admin Mail Marketing Flow tab now has real API-backed Validate and Simulate actions plus an operator proof panel showing issues, warnings, provider mode, checked version, and simulation steps before publish/resume/pause decisions.
- Quiet-hours and frequency-cap acceptance was re-checked against the old flow reference before moving on. Old `mail-marketing-flows.service.ts` delays `send_email` during quiet hours, skips on per-recipient day/week/30-day caps, and skips on hourly/daily quota. The new pure-logic runtime mirrors that contract with tenant Mail Center quiet-hours requeue, per-recipient `MailDelivery(category='marketing')` counts, tenant daily marketing cap counts, and campaign queue blocking before proof records are created.
- New campaign runtime evidence points: `queueCampaign` refuses disabled marketing/campaign sends, blocks active quiet hours with `campaign.queue_blocked_quiet_hours`, skips not-sendable/unsubscribed/suppressed/frequency-capped/tenant-daily-capped snapshot members, and records `skippedReasons` on `campaign.queued_disabled`.
- New flow runtime evidence points: `processSendEmailNode` skips missing email/template/sendability, skips disabled marketing/flow settings, requeues the same node during quiet hours, skips per-recipient frequency cap and tenant daily cap, and only then writes `MailDelivery(status='queued_disabled', category='marketing')` proof.
- Repository proof points: `countMarketingDeliveriesForRecipientSince` and `countTenantMarketingDeliveriesSince` both count only tenant-scoped marketing deliveries with statuses `queued`, `queued_disabled`, `sending`, or `sent`, so transactional/system mail cannot consume marketing frequency budget.
- `pnpm --filter @factory-engine-pro/contracts exec tsc -p tsconfig.json --noEmit` passed after flow validate/simulate contracts.
- `pnpm --filter @factory-engine-pro/api-client exec tsc -p tsconfig.json --noEmit` passed after flow validate/simulate API client wiring.
- `pnpm --filter @factory-engine-pro/backend exec tsc -p tsconfig.json --noEmit` passed after flow validate/simulate backend wiring.
- `pnpm --filter @factory-engine-pro/admin exec tsc -p tsconfig.json --noEmit` passed after flow proof UI wiring.
- `git diff --check` passed after flow validate/simulate wiring; only existing CRLF conversion warnings were reported.
- `pnpm --filter @factory-engine-pro/admin build` passed after sandbox escalation; Vite still reports the existing large chunk warning.
- Old customer file reference re-read from `C:\Users\mhmmd\Desktop\eagle-engine.dev\eagledtfprint\accounts\app\orders\[id]\page.tsx`: the old customer order detail exposed order-level design files for buyer reuse, so the new portal cannot treat documents as only tax/contracts/licenses.
- Customer portal Documents/files acceptance was closed in the new pure-logic surface: `GET /accounts/documents` now returns a tenant/customer-scoped, paginated, searchable file desk combining account request files, real invoice file links, and current customer's order design files.
- Documents UI composition now follows the route-level UIX rule: first viewport exposes file counts, invoice/design/account-doc split, category tabs, search, page size 10/50/100/150, empty/error/loading states, and a single safe open/download action per file. Raw Shopify/storage payloads stay hidden.
- `pnpm --filter @factory-engine-pro/contracts exec tsc -p tsconfig.json --noEmit` passed after customer documents/files contracts.
- `pnpm --filter @factory-engine-pro/backend exec tsc -p tsconfig.json --noEmit` passed after customer documents/files API wiring.
- `pnpm --filter @factory-engine-pro/accounts exec tsc -p tsconfig.json --noEmit` passed after customer documents/files UI wiring.
- `pnpm --filter @factory-engine-pro/api-client exec tsc -p tsconfig.json --noEmit` passed after customer documents/files API client wiring.
- `pnpm --filter @factory-engine-pro/accounts build` passed after Windows sandbox escalation; Vite still reports the existing large chunk warning.
- Old Mail Center delivery-log reference re-read from `C:\Users\mhmmd\Desktop\eagle-engine.dev\eagledtfprint\backend\src\mail\mail-center.controller.ts` and `backend\src\mail\mail.service.ts`: the old system treated delivery log, provider health, suppression, and DLQ proof as operational mail-center responsibilities, with merchant-scoped filters and id-scoped detail reads.
- Delivery log parity is now hardened in the new pure-logic surface: `GET /mail/delivery-log` returns a typed paginated response with status, recipient, event key, category, template, source, and free-search filters; default page size is 10 with deliberate 50/100/150 operator choices. The older `/mail/deliveries` array endpoint stays compatible for existing dashboard/template proof readers.
- `MailDeliveryRepository` no longer relies only on the Prisma tenant extension for critical delivery proof reads and state transitions. List, paged list, detail, idempotency lookup, and sending/sent/failed/skipped/queued-disabled updates now include explicit `tenantId` scope.
- Admin System Mail now reads the paginated delivery-log API, shows "showing X of Y" proof, exposes page-size control plus previous/next cursor navigation, and preserves loading, empty, error, retry, detail, and disabled-provider evidence states. Delivery proof remains in System Mail; Mail Marketing links to it conceptually but does not duplicate it as a separate source of truth.
- `pnpm --filter @factory-engine-pro/contracts exec tsc -p tsconfig.json --noEmit` passed after delivery-log contracts.
- `pnpm --filter @factory-engine-pro/api-client exec tsc -p tsconfig.json --noEmit` passed after delivery-log API client wiring.
- `pnpm --filter @factory-engine-pro/backend exec tsc -p tsconfig.json --noEmit` passed after delivery-log backend paging and tenant-scope hardening.
- `pnpm --filter @factory-engine-pro/contracts build` passed after Windows sandbox escalation to refresh package dist declarations.
- `pnpm --filter @factory-engine-pro/api-client build` passed after Windows sandbox escalation to refresh package dist declarations.
- `pnpm --filter @factory-engine-pro/admin exec tsc -p tsconfig.json --noEmit` passed after delivery-log UI wiring.
- `pnpm --filter @factory-engine-pro/admin build` passed after Windows sandbox escalation; Vite still reports the existing large chunk warning.
- Old Email Templates reference re-read from `C:\Users\mhmmd\Desktop\eagle-engine.dev\eagledtfprint\backend\src\email-templates\email-templates.controller.ts`, `email-templates.service.ts`, and `email-template.catalog.ts`: the old controller passed `merchantId` into every workspace, event, variant, revision, publish, activate, preview, and test-send operation.
- Email template tenant-isolation hardening now mirrors that discipline in the new pure-logic repository: template list/detail/event reads, revision reads/updates/publish/delete, event binding activation, preview-profile CRUD/default clearing, snippet CRUD/key checks, block CRUD/key checks, slug uniqueness, version numbering, and template counts all include explicit `tenantId` scope instead of relying only on the Prisma tenant extension.
- `pnpm --filter @factory-engine-pro/backend exec tsc -p tsconfig.json --noEmit` passed after email-template tenant-scope hardening.
- Mail Marketing tenant-isolation hardening now extends the same discipline to the recipient-control room: settings, contact list/detail/import, audience lists, frozen snapshots, campaign reads/state changes, flow reads/publish/pause/resume, flow idempotency, flow runtime processing, analytics, webhook destinations, and public preference/unsubscribe contact resolution all include explicit `tenantId` scope instead of relying only on the Prisma tenant extension.
- `pnpm --filter @factory-engine-pro/backend exec tsc -p tsconfig.json --noEmit` passed after Mail Marketing repository tenant-scope hardening.
- Mail Marketing webhook destinations now expose a typed execution mode: `proof_only` is the default and `live_requested` is only a recorded intent. The backend persists this in tenant-scoped destination metadata, rejects disabled destinations with live intent, includes safe execution-mode proof in flow action logs, and still forbids arbitrary URL/secrets in flow graph config.
- Admin Mail Marketing settings now shows the webhook registry as guarded outbound instead of pretending live execution is available. The destination form separates status from execution mode and explains that external calls require an exact allowlist before customer data can leave the tenant runtime.
- `pnpm --filter @factory-engine-pro/contracts exec tsc -p tsconfig.json --noEmit` passed after webhook execution-mode contract changes.
- `pnpm --filter @factory-engine-pro/contracts build` passed after Windows sandbox escalation to refresh package dist declarations.
- `pnpm --filter @factory-engine-pro/backend exec tsc -p tsconfig.json --noEmit` passed after webhook execution-mode backend changes.
- `pnpm --filter @factory-engine-pro/admin exec tsc -p tsconfig.json --noEmit` passed after guarded webhook registry UI changes.
- Mail Marketing `emit_internal_event` runtime now validates `eventName`, rejects secret-bearing configs, writes a tenant-scoped `MailMarketingEvent(status='emitted', source='mail_flow')`, and records a success action log with the generated event id. This is the pure-logic replacement for the old system's global `EventEmitter2` path.
- `pnpm --filter @factory-engine-pro/backend exec tsc -p tsconfig.json --noEmit` passed after internal event ledger runtime changes.
- Old Mail Marketing flow builder/reference behavior re-read from `C:\Users\mhmmd\Desktop\eagle-engine.dev\eagledtfprint\backend\src\mail-marketing\dto\flow.dto.ts` and `mail-marketing-flows.service.ts`: the old system accepted typed nodes with `nodeKey/nodeType/config`, required one trigger and at least one action, and blocked publish when action references were missing (`templateId`, `audienceId`, webhook URL in old system, `eventName`, or task body/title warning).
- Admin Mail Marketing Flow tab no longer creates a fixed static disabled `send_email` draft. It now has a controlled flow builder that creates a real publishable draft from a business trigger, optional delay, and one supported action: approved template email, follow-up task, contact tag update, audience add/remove, guarded webhook destination, or internal event ledger entry.
- The new builder uses real backend references already present in the page: published templates, saved audiences, and active guarded webhook destinations. It blocks creation in the UI when the selected action is missing the same reference that backend publish validation will require.
- The graph payload stays pure-logic and safe: UI sends `trigger -> optional delay -> action` nodes; webhook nodes store only `destinationId`, not raw URL/secrets; follow-up task nodes only expose sales/account axis in backend config while admin copy presents purchase/account business wording.
- `pnpm --filter @factory-engine-pro/admin exec tsc -p tsconfig.json --noEmit` passed after the Mail Marketing flow builder replacement.
- Old flow trigger/node reference was re-read again from `C:\Users\mhmmd\Desktop\eagle-engine.dev\eagledtfprint\backend\src\mail-marketing\mail-marketing.constants.ts`, `dto\flow.dto.ts`, and `mail-marketing-flows.service.ts` before extending the builder/runtime beyond the one-action draft.
- Admin Mail Marketing Flow builder now supports the controlled graph shape required by the inventory without exposing raw JSON: business trigger, duration delay, scheduled-date delay, optional condition gate, and one supported action. False condition branches stop the enrollment; true branches continue to the selected action.
- Mail Marketing backend now accepts scheduled-date delay nodes as real runtime delay targets, validates `delayMinutes` or `scheduledAt` before publish, and logs/fails invalid delay nodes instead of silently continuing.
- Manual-audience flow events now resolve `audienceId` or `snapshotId` payloads into tenant-scoped audience contacts/snapshot members before enrollment. Single-contact event payloads still work through the existing contact/customer/email resolver.
- Mail Marketing bootstrap now exposes the migrated marketing trigger/node inventory used by the builder: segment enter/exit, Shopify order placed, order completed, customer created, abandoned cart, form submitted, high buyer intent, repeated product views, no-order-for-days, clicked-without-order, purchase handoff, and manual entry. The old support-ticket trigger remains intentionally outside this transfer.
- `pnpm --filter @factory-engine-pro/admin exec tsc -p tsconfig.json --noEmit` passed after condition/scheduled-delay builder wiring.
- `pnpm --filter @factory-engine-pro/backend exec tsc -p tsconfig.json --noEmit` passed after scheduled-delay and manual-audience runtime wiring.
- Old Email Template starter/lifecycle reference re-read from `C:\Users\mhmmd\Desktop\eagle-engine.dev\eagledtfprint\backend\src\email-templates\email-template.starters.ts`, `email-templates.controller.ts`, and `email-templates.service.ts`: the old system creates drafts from configured event/starter data, then gates customer-facing release through preview, test send, publish, and activate actions.
- Admin Mail Template creation no longer writes the same static "Workflow Follow-up" template for every click. The Template Library now starts with a configured draft composer for name, event key, template type, folder, subject, preview text, variables, HTML, and text body.
- Template draft creation now blocks obvious publish-time failures earlier in the UI: missing name/event/subject/html, script/form/inline-JS/javascript URL HTML, and marketing templates without `{{urls.unsubscribe}}`.
- New template draft payloads are still draft-only and carry `metadata.source = admin_mail_template_draft_composer`; customer-facing release remains controlled by the existing release lane: preview -> disabled test proof -> approval -> publish -> activation.
- `pnpm --filter @factory-engine-pro/admin exec tsc -p tsconfig.json --noEmit` passed after replacing the static template CTA with the configured draft composer.
- Mail Marketing overview shortcuts no longer create hidden assets from stale/default form state. The empty state and guided-builder panel now route operators to Template, Audience, or Flow builder tabs first, so creation always happens from a visible configured form with blocker reasons.
- `pnpm --filter @factory-engine-pro/admin exec tsc -p tsconfig.json --noEmit` passed after replacing overview direct-create shortcuts with builder navigation.
- Customer Portal order/reorder/invoice behavior was re-checked against the old account portal references `accounts/app/orders/[id]/page.tsx`, `accounts/lib/api-client.ts`, and old invoice/reorder account surfaces. The new backend already owns tenant/customer-scoped persisted invoices, item-level reorder, reorder cart, checkout-link fallback, and cart activity proof; no old customer model or tenant model was copied.
- Accounts invoice list now exposes the safe next action directly on each row before detail expansion: paid/no-action, secure payment link ready, download/contact billing, or contact billing. Issued/due dates are formatted for buyers instead of showing raw backend strings.
- Accounts reorder review and active cart checkout review no longer depend on a narrow sticky right rail for the customer decision layer. The selected reorder review and cart checkout review render as full-width decision sections, with explicit ready/review counts and copy that prevents account-review carts from looking like confirmed checkout.
- `pnpm --filter @factory-engine-pro/accounts exec tsc -p tsconfig.json --noEmit` passed after customer portal UIX hardening. `git diff --check` passed for the touched account files with only existing CRLF conversion warnings.
- Old Shopify Customer Account extension and old `/customer-account` guard were re-read from `C:\Users\mhmmd\Desktop\eagle-engine.dev\eagledtfprint\extensions\customer-account-extension` and `backend\src\customer-account`. The old behavior verified Shopify session tokens by shop domain, API secret, and Shopify customer id, but also included out-of-scope wishlist/support/quotes/address/team/analytics surfaces.
- New Customer Account extension bridge is implemented without copying old customer models: `ShopifyCustomerSessionGuard` verifies the Shopify session token against tenant-scoped Shopify API secret, resolves the Shopify customer id to a tenant-scoped `Customer`, resolves one active `CustomerUser`, sets account permissions in `TenantContextService`, and lets the existing `AccountsService` serve orders, invoices, reorder templates, active cart, and checkout actions.
- `extensions/customer-account-extension` now contains a small Shopify Customer Account UI entry surface for account summary, recent orders, open invoices, reorder-ready templates, active cart state, customer-safe loading/empty/error states, and standalone portal deep links. It does not expose old discounts, loyalty, quotes, wishlist, support, addresses, team management, analytics, raw Shopify payloads, or internal routing data.
- Backend CORS now keeps the existing admin/person/accounts origins, accepts configured Shopify extension origins via `SHOPIFY_CUSTOMER_ACCOUNT_ORIGINS` / `SHOPIFY_EXTENSION_ORIGINS`, and mirrors the old customer-account runtime by allowing secure `.myshopify.com` origins for the verified Shopify session bridge.
- `pnpm --filter @factory-engine-pro/backend exec tsc -p tsconfig.json --noEmit` passed after the Shopify customer-session bridge.
- `pnpm --filter @factory-engine-pro/customer-account-extension exec tsc -p tsconfig.json --noEmit` passed after the Shopify Customer Account extension scaffold.
- React type drift was closed at the workspace boundary: the Shopify Customer Account extension now uses React 18 type definitions, `pnpm-workspace.yaml` overrides `@types/react` to `18.3.31` and `@types/react-dom` to `18.3.7`, the extension `node_modules/@types/react` link resolves to the React 18 package, and package/lockfile search shows no remaining React 19 type references.
- Bundle-size/performance follow-up was closed for the current admin/accounts build gate: admin and accounts Vite configs now enable TanStack Router `autoCodeSplitting` and deliberate vendor chunks instead of one uncontrolled app bundle. Final escalated builds passed with no large-chunk warning and no circular chunk warning.
- Admin build proof after the performance pass: `pnpm --filter @factory-engine-pro/admin build` passed; largest chunks were `assets/index-CuWNtEMU.js` at 482.55 kB / 134.22 kB gzip, `vendor-react-CLQAgv46.js` at 228.06 kB / 71.60 kB gzip, and `mail-marketing-Cya4pC9Q.js` at 117.55 kB / 25.90 kB gzip.
- Accounts build proof after the performance pass: `pnpm --filter @factory-engine-pro/accounts build` passed; largest chunks were `assets/index-BhuhBkmO.js` at 424.53 kB / 119.52 kB gzip and `vendor-react-CnNz3GxE.js` at 142.25 kB / 45.59 kB gzip.
- Customer Account extension type proof after the React type boundary fix: `pnpm --filter @factory-engine-pro/customer-account-extension typecheck` passed.
- Three-module UIX route gate was hardened in `docs/migration/three-module-uix-composition.md`: each route now requires the pre-code worksheet plus a route-level acceptance gate that enforces one dominant business state, one safe action, no raw proof-first screens, no confusing repeated numbers, visible blocker reasons, role-safe terminology, centered/full-page critical detail, and preserved hierarchy in light/dark/laptop/mobile layouts.
- Old Mail Marketing analytics reference was re-read from `C:\Users\mhmmd\Desktop\eagle-engine.dev\eagledtfprint\backend\src\mail-marketing\mail-marketing-analytics.service.ts` and `dto\analytics.dto.ts`: the old system exposed overview, campaign, template, audience, segment, funnel, cohort, and attribution analytics, but its deeper attribution depended on old fingerprint/session tables that remain forbidden in the new pure-logic model.
- Mail Marketing analytics now closes the safe funnel/cohort surface without copying old fingerprint/session behavior: contracts define typed funnel and cohort responses; backend exposes `GET /mail-marketing/analytics/funnel` and `GET /mail-marketing/analytics/cohorts`; API client exposes both; admin overview renders proof funnel and customer/order cohorts from real tenant data only.
- Funnel proof is calculated from saved audience snapshots, reachable snapshot members, mail delivery proof rows, verified provider webhook events, suppression/blocker counts, and conservative customer/order matches. Disabled-provider proof is counted as proof/blocker, not customer delivery.
- Cohort proof is calculated only from `customerId`-matched orders that occur after a recorded delivery; email-only, phone-only, fingerprint, and session attribution remain blocked.
- `pnpm --filter @factory-engine-pro/contracts exec tsc -p tsconfig.json --noEmit`, `pnpm --filter @factory-engine-pro/api-client exec tsc -p tsconfig.json --noEmit`, and `pnpm --filter @factory-engine-pro/backend exec tsc -p tsconfig.json --noEmit` passed after the analytics funnel/cohort contracts and backend wiring.
- `pnpm --filter @factory-engine-pro/admin exec tsc -p tsconfig.json --noEmit` passed after the admin proof funnel/cohort UI wiring.
- `pnpm --filter @factory-engine-pro/contracts build` and `pnpm --filter @factory-engine-pro/api-client build` passed after Windows sandbox escalation refreshed package dist declarations.
- `pnpm --filter @factory-engine-pro/backend build` passed after Windows sandbox escalation for Prisma client generation.
- `pnpm --filter @factory-engine-pro/admin build` passed after Windows sandbox escalation; the production build finished without the Vite large-chunk warning.

## High-Risk Areas

1. Old contact graph is broad.
   - Do not port fingerprint/visitor tracking.
   - Only explicit customer/contact/order/shopify identities should be used.

2. Old campaign/flow system mixes marketing automation with task creation.
   - New staff-facing terminology must avoid "sales" and internal workflow jargon.
   - Use purchase intent, account care, customer request, and follow-up wording.

3. A disabled/proof-only mail marketing screen may look complete in UI.
   - Treat skipped or proof-only execution as explicit business state, not as quiet success.
   - A disabled provider is acceptable only if the system still persists real operational evidence.

4. Pseudo invoices are dangerous.
   - They are acceptable for a placeholder page only, not for production customer finance workflow.
   - Real invoice lifecycle must be persisted.

5. Reorder must not create fake checkout success.
   - Resolver must return exact outcome and reason.
   - Unavailable variants and missing Shopify linkage must be explicit.

6. Tenant isolation is non-negotiable.
   - Every mail/contact/template/campaign/cart/invoice query must be tenant scoped.
   - Customer portal queries must also be customer scoped.

## Final Cut List

Transferred in this pass:
- Mail settings, settings audit, suppression management, delivery log, health, and DLQ ownership now live in System Mail.
- Template binding, revision source editing, preview profiles, reusable snippets/blocks, lint/compliance, disabled test proof, approval, publish, and activation gates now live in the protected release lane.
- Marketing contact identity, consent, suppression, audience preview, frozen snapshots, snapshot diff, campaign lifecycle, flow versioning/runtime/action logs, idempotency, conservative analytics, and disabled-provider proof are implemented without pretending live sends occurred.
- Queue-backed campaign/flow work records proof-only outcomes when provider mode or category controls block live delivery.
- Customer portal now has scoped order detail, line item properties, design files, whole-order reorder, item-level reorder, persisted cart/review/checkout path, real invoice records, invoice detail, invoice download, invoice payment state, and customer-safe blocked/review copy.
- Shopify Customer Account UI now exists as a thin entry surface backed by the same account lifecycle service and verified Shopify customer-session bridge; out-of-scope old extension modules were not ported.
- Three-module UIX composition is now a mandatory pre-code gate: Mail Template is a protected release lane, Mail Marketing is a recipient decision room, and Customer Portal is a buyer account desk. Route implementation must prove role, one job, confusion risk, protective state, one safe action, and proof placement before layout work.
- Admin/accounts bundle follow-up is no longer on the remaining list: TanStack route code splitting plus controlled vendor chunks brought both production builds below the Vite large-chunk warning threshold in the current verification pass.
- Mail Marketing safe analytics now includes proof funnel and customer/order cohorts. It uses only stored tenant delivery/snapshot/provider-event/suppression/order records and preserves the hard ban on old fingerprint/session attribution.
- Mail Marketing webhook destination registry now has a typed exact-target live approval gate. Admins can request live mode, approve or revoke the exact tenant destination URL, and see approval proof in the registry. The approval is stored in destination metadata, invalidated by URL/status/execution-mode changes, and never stores raw secrets in flow graph config. External runtime execution remains disconnected until the high-risk data-egress connector receives explicit approval.
- AI-assisted template editing is now transferred as a proposal-only release-lane assistant. The old implementation was re-read from `email-template-ai.service.ts`, `email-templates.service.ts`, `email-templates.controller.ts`, and `dto/template.dto.ts`, but the old prompt registry was not copied. The new endpoint uses this system's own prompt, tenant/env Anthropic key resolution, bounded max tokens, timeout/kill switch controls, strict JSON extraction, release validator proof, and never saves, approves, publishes, activates, or sends the proposed draft.
- System Mail now exposes typed provider webhook proof through `GET /mail/provider-events`, API client wiring, rollout harness coverage, and an admin proof panel. It lists tenant-scoped stored Resend events, delivery match status, processing state, and safe payload/header key proof without making raw provider JSON the primary work surface.
- System Mail now also has a repeatable signed Resend webhook proof tool: `pnpm evidence:resend-webhook`. It creates a Svix-compatible signed provider event for the tenant webhook endpoint, verifies that the backend stores a tenant-scoped `mail_provider_events` row, and by default fails unless that row matches a real `MailDelivery`. This mirrors the old Mail Center behavior of tying provider events back to delivery proof while keeping the new tenant-scoped pure-logic storage model.
- Mail Marketing outbound webhook readiness now has a read-only proof tool: `pnpm evidence:mail-webhook-readiness`. It reads the tenant webhook destination registry, redacts URLs to hashes, and classifies each destination as ready, blocked, proof-only, or disabled based on status, execution mode, exact URL approval, secret readiness, and `MAIL_MARKETING_OUTBOUND_WEBHOOKS_ENABLED`. It does not call external destinations.
- Three-module UIX now has a concrete pre-code composition brainstorm in `docs/migration/three-module-uix-composition.md`: Mail Template is mapped as a protected release lane, Mail Marketing as a recipient decision room, and Customer Portal as a buyer account desk, with route-level first viewport, primary action, hidden detail, empty/error, long-list, and role-vocabulary decisions before code.

Remaining rollout proof before signoff:
- Live tenant evidence for Mail Template, Mail Marketing, System Mail, and Customer Portal routes.
- Light, dark, narrow/mobile screenshots for the production UIX contract.
- Real Resend webhook verification against a configured tenant webhook and at least one stored `mail_provider_events` row.

Repeatable evidence harness:
- `pnpm evidence:mail-rollout` now runs the non-mutating rollout proof harness in `scripts/mail-rollout-proof.mjs`.
- `pnpm evidence:resend-webhook` runs the explicit signed-webhook proof in `scripts/resend-webhook-proof.mjs`. This tool intentionally posts one signed Resend/Svix event to the configured tenant webhook endpoint and then verifies the stored provider-event row through the admin API.
- `pnpm evidence:mail-webhook-readiness` runs the non-mutating outbound destination readiness proof in `scripts/mail-webhook-readiness-proof.mjs`.
- `pnpm evidence:mail-signoff` runs the final evidence manifest checker in `scripts/mail-rollout-signoff.mjs`. It reads the same evidence directory and fails if `manifest.json`, `resend-webhook-proof.json`, or `mail-webhook-readiness-proof.json` are missing, incomplete, skipped, unmatched, or otherwise too weak for rollout signoff.
- Required live proof inputs stay outside git:
  - `FACTORY_ENGINE_API_URL`
  - `FACTORY_ENGINE_ADMIN_URL`
  - `FACTORY_ENGINE_ACCOUNTS_URL`
  - `FACTORY_ENGINE_TENANT_ID`
  - `FACTORY_ENGINE_ADMIN_SESSION_JSON` or `FACTORY_ENGINE_ADMIN_ACCESS_TOKEN`
  - `FACTORY_ENGINE_ACCOUNTS_SESSION_JSON` or `FACTORY_ENGINE_ACCOUNTS_ACCESS_TOKEN`
  - `FACTORY_ENGINE_CUSTOMER_ACCOUNT_SESSION_JSON` or `FACTORY_ENGINE_SHOPIFY_CUSTOMER_ACCOUNT_SESSION_TOKEN`
- Final signoff treats these as live-evidence inputs, not optional labels. The rollout manifest must show HTTPS non-local API/Admin/Accounts URLs, a non-default tenant id, browser proof not skipped, and admin/accounts/Shopify Customer Account sessions present during proof collection. Localhost, private-network URLs, default test tenants, missing session flags, or skipped browser proof can produce a useful diagnostic manifest but cannot pass final signoff.
- The harness writes `docs/evidence/mail-rollout/<run-id>/manifest.json`.
- The final signoff checker writes `docs/evidence/mail-rollout/<run-id>/mail-rollout-signoff.json`.
- Customer-facing copy proof is part of the same manifest. It scans account-portal i18n strings, account route/component visible JSX copy, Shopify Customer Account extension copy/error text, and the rendered browser body text for Customer Portal screenshots. It fails if customer-facing UI exposes tenant, provider, workflow, queue, source, routing, axis, rule, suppression, metadata, staff-notes, debug, raw-payload, or marketing-audience vocabulary. This protects the UIX composition rule: the buyer sees account/order/invoice/reorder/cart language, not backend architecture.
- API proof covers System Mail settings/health/delivery log/provider events/suppression/DLQ, Mail Template workspace/templates, Mail Marketing overview/settings/audiences/campaigns/flows/webhook destinations/funnel/cohorts, Customer Portal orders/invoices/reorder/cart/documents, and Shopify Customer Account extension context.
- The provider-events probe has a hard assertion: HTTP 200 is not enough. It fails unless the response proves at least one stored `mail_provider_events` row for the tenant.
- Customer Portal API probes have a hard customer-safe payload assertion. HTTP 200 is not enough: orders, invoices, reorder templates, active cart, and documents fail rollout proof if the JSON exposes raw Shopify payloads, tenant/provider/workflow/routing/source internals, staff-only notes, secrets, debug fields, or raw fulfillment/refund arrays. Customer payloads must use business-safe names such as `documentKind`, `addedAs`, and `originOrderNumber`; `source`, `sourceType`, and any `source*` response key are blocked even when their values look harmless. String values are also checked, so a safe-looking field such as `checkoutError` cannot carry internal copy like tenant/provider/workflow/source, Shopify Admin credentials, draft-order, raw Shopify gid, request id, token, secret, or debug text. The proof records only leaked key/value paths and reasons, never customer values.
- Customer Portal order and invoice list probes now also run dependent read-only detail probes. If the list has a live record, `GET /accounts/orders/:id` and `GET /accounts/invoices/:id` must load and pass the same customer-safe payload assertion. If no live record exists for detail proof, rollout proof is incomplete rather than silently treated as production-ready.
- Shopify Customer Account UI extension proof is part of the same rollout gate. `GET /customer-account/context` must pass with a real Shopify Customer Account session token and the same customer-safe payload assertion, proving the thin extension bridge uses the existing account lifecycle service instead of a disconnected or mock surface.
- The signed-webhook proof writes `docs/evidence/mail-rollout/<run-id>/resend-webhook-proof.json`.
- The webhook readiness proof writes `docs/evidence/mail-rollout/<run-id>/mail-webhook-readiness-proof.json`.
- Additional webhook-readiness inputs stay outside git:
  - optional `MAIL_MARKETING_OUTBOUND_WEBHOOKS_ENABLED` to show whether the runtime kill switch is enabled.
  - optional `FACTORY_ENGINE_WEBHOOK_READINESS_REQUIRE_READY=1` to fail when any `live_requested` destination is not fully ready.
- Additional signoff inputs stay outside git:
  - optional `FACTORY_ENGINE_EVIDENCE_RUN_ID` or `FACTORY_ENGINE_EVIDENCE_DIR` to select an explicit evidence run.
  - optional `FACTORY_ENGINE_SIGNOFF_SKIP_RESEND_WEBHOOK=1` only when Resend webhook proof is explicitly deferred; final signoff also requires `FACTORY_ENGINE_SIGNOFF_RESEND_WEBHOOK_DEFER_REASON` and `FACTORY_ENGINE_SIGNOFF_RESEND_WEBHOOK_DEFER_APPROVED_BY`, otherwise the skip is treated as a failed bypass.
  - optional `FACTORY_ENGINE_SIGNOFF_SKIP_WEBHOOK_READINESS=1` only when outbound destination readiness is explicitly deferred; final signoff also requires `FACTORY_ENGINE_SIGNOFF_WEBHOOK_READINESS_DEFER_REASON` and `FACTORY_ENGINE_SIGNOFF_WEBHOOK_READINESS_DEFER_APPROVED_BY`, otherwise the skip is treated as a failed bypass.
  - optional `FACTORY_ENGINE_SIGNOFF_REQUIRE_OUTBOUND_WEBHOOK_READY=1` to require all `live_requested` destinations to be ready and at least one destination to be live-ready.
- Additional signed-webhook inputs stay outside git:
  - `FACTORY_ENGINE_TENANT_SLUG`
  - `FACTORY_ENGINE_RESEND_WEBHOOK_SECRET`
  - `FACTORY_ENGINE_RESEND_PROOF_PROVIDER_MESSAGE_ID`, or `FACTORY_ENGINE_RESEND_PROOF_DELIVERY_ID` when that delivery has a stored provider message id
  - optional `FACTORY_ENGINE_RESEND_PROOF_DELIVERY_ID` to require an exact delivery match
  - optional `FACTORY_ENGINE_RESEND_PROOF_EVENT_TYPE` (defaults to `email.delivered`)
  - optional `FACTORY_ENGINE_RESEND_PROOF_ALLOW_UNMATCHED=1` only for storage-only proof; delivery-matched proof is the default requirement.
- Browser proof covers admin System Mail, admin Mail Template release lane, admin Mail Marketing recipient room, and Customer Portal orders/reorder/invoices/cart/documents in light, dark, desktop, and mobile variants. Final signoff now requires every mandatory surface to have all four captures (`light.desktop`, `light.mobile`, `dark.desktop`, `dark.mobile`) plus an existing screenshot file for each capture. Customer Portal browser captures also scan the rendered text for customer-facing vocabulary violations, so live API values cannot quietly reintroduce backend terms.
- The three-module UIX gate now requires a written pre-code composition memo before route implementation. For Mail Template, Mail Marketing, and Customer Portal, the memo must define the user's job, the most dangerous misunderstanding, the state that prevents it, the one safe next action, and the proof/details that move below the decision layer. This prevents feature-dense screens from passing just because the backend is complete.
- The harness is deliberately read-only: it does not send mail, create templates, create campaigns, trigger flows, execute outbound webhooks, or mutate customer portal state.
- The signed-webhook proof is not read-only by design: it posts one provider event to the tenant webhook endpoint. It does not send customer mail, create templates, create campaigns, trigger flows, execute outbound webhooks, or mutate customer portal state.
- The webhook readiness proof is read-only by design: it does not execute outbound webhooks, decrypt secrets, send customer data, or mutate flows.
- The signoff checker is read-only by design: it only reads existing evidence manifests and writes a consolidated signoff manifest.
- Static Customer Portal contract proof is also part of the same manifest. It scans the account portal public response helper/type surface, the shared account contract surface, and the Shopify Customer Account context type before live API proof. It fails if those customer-facing TypeScript surfaces accept `source*`, tenant/provider/workflow/routing/source internals, raw payload fields, secrets/tokens, debug fields, staff-only notes, or request ids. This catches regressions before a live endpoint has to be exercised.
- The signoff checker also requires the Customer Portal and Shopify Customer Account customer-safe payload assertions to be present and clean, including the dependent order detail and invoice detail probes, and it requires both the customer-facing copy proof and the static customer response contract proof to pass.
- A manifest with skipped API/browser proof is not signoff evidence. It is a useful failure report only.

Can be deferred only with explicit approval:
- Live outbound webhook execution connector for mail flows. The encrypted tenant-scoped registry and exact allowlist approval gate exist; the final fetch connector still requires explicit risk approval before customer data can leave the tenant runtime. Arbitrary URL execution from flow graph config is forbidden.

Must not be silently ported:
- Old fingerprint module.
- Old auth/team/company model.
- Old abandoned cart subsystem unless a later ROADMAP item explicitly requires it.
- Old prompt registry.
