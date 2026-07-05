# Three-Module UIX Composition Contract

Date: 2026-07-04

Scope:
- Mail Template
- Mail Marketing
- Customer Portal

This is the canonical UIX contract for the three-module transfer. The old system is a behavior reference, not a screen-composition reference. The new system must be more orderly, more usable, faster to scan, and harder to misunderstand than the old system.

## Non-Negotiable UIX Outcome: Order, Speed, No Confusion

This is the highest acceptance rule for Mail Template, Mail Marketing, and Customer Portal. The goal is not to expose every feature, count, raw field, and backend state. The goal is a disciplined composition where the correct role sees the correct business state, understands the next safe action, and can finish the job without project knowledge.

The screen is not production-ready if any user has to ask:
- Is this live, draft, disabled proof, blocked, payable, reorderable, or only a review request?
- Which number should I trust?
- Which action is safe?
- Why is this button disabled?
- Am I looking at customer-facing truth, operator proof, or internal debug data?

The composition rule is:
1. Decision first: one screen, one job, one current state, one next safe action.
2. Context second: show only the records/details needed to explain that action.
3. Proof third: logs, raw payloads, provider traces, revision diffs, and audit history stay below the work surface or behind detail.

Anything that increases density without reducing confusion is moved down, hidden behind detail, or removed from the primary screen.

## 2026-07-05 Product Composition Brainstorm: Useful, Ordered, Efficient

This is the latest product-composition decision. It exists because the hardest requirement is not "add more UI." The hardest requirement is to make the three modules usable under real work pressure, without forcing the user to decode the backend. The implementer must brainstorm the work composition first, then add UI. A route that has correct data but creates confusion is still incomplete.

The composition standard for all three modules:
- The first viewport must answer what is happening now, why it matters, and what the safest next action is.
- A count, card, badge, table column, tab, or modal section is allowed only when it reduces the user's next decision cost.
- Every module has one dominant mental model. Do not mix release work, recipient work, and buyer self-service into the same visual rhythm.
- The primary screen is for work. Proof, history, raw source, provider traces, internal ids, and debug evidence are required, but they sit after the decision layer.
- If the same number appears twice with different meanings, collapse it into one decision number and move the rest to detail.
- If two CTAs compete visually, the route has not been composed yet.
- If a customer, operator, or admin must open a modal to understand the basic page state, the first viewport failed.
- Empty, loading, error, disabled, long-list, light mode, dark mode, laptop, and narrow/mobile states are part of the composition, not polish.

The three-module brainstorming lock:

| Module | Composition target | First viewport must make obvious | Primary action rule | What moves down or behind detail |
| --- | --- | --- | --- | --- |
| Mail Template | Protected release lane | Active customer email, draft-only changes, readiness blockers, rendered preview, test/approval/publish state, provider mode. | Show exactly one next release action for the current state: create draft, save, test, approve, publish, or activate. | Raw HTML/CSS, variable JSON, revision diff, provider trace, old delivery proof, audit history. |
| Mail Marketing | Recipient decision room | Who qualifies, who is blocked, whether the list is live preview or frozen snapshot, final eligible count, approved template, delivery mode. | Show exactly one next pipeline action: preview, freeze, choose template, review blockers, queue proof, or send only when enabled. | Raw flow graph, webhook body, provider payload, per-recipient debug trace, broad analytics, old execution history. |
| Customer Portal | Buyer account desk | Recent orders, open/payable invoices, reorder-ready items, active cart or review request, readable blocker reasons, customer-safe next action. | Show exactly one customer-safe next action: view order, reorder, continue cart, pay/download invoice, or contact staff. | Raw Shopify JSON, tenant/provider/source/routing words, staff notes, marketing internals, debug proof. |

Route-level brainstorming must happen before layout work:
1. Write the sentence: "This route exists so [role] can [one job] without confusing [dangerous state] with [safe state]."
2. Choose the one first-viewport business state that prevents that confusion.
3. Choose the one primary action that follows from that state.
4. Remove or demote every metric, field, section, tab, or modal panel that does not help that action.
5. Define how loading, empty, error, disabled, and long-list states keep the same hierarchy.
6. Define what the user must never see in that role's primary surface.

The practical UIX test:
- Can a first-time user explain the page and the next action in five seconds?
- Can they complete the main job without opening raw proof, logs, source, or history?
- Can they tell the difference between draft/live, preview/snapshot, proof/sent, payable/placeholder, checkout/review, and eligible/blocked?
- Does the page still read correctly in light mode, dark mode, laptop width, and narrow/mobile width?

If any answer is no, do not add more features to the route. Recompose the screen first.

## 2026-07-05 Authoritative UIX Decision Board: Useful Before Rich

This section is the current decision record. It is intentionally placed near the top because the file contains multiple brainstorming passes below. When there is any doubt, this board wins.

The strict condition for all three modules is not visual decoration and not feature density. The strict condition is that the UI is orderly, usable, efficient, and does not create user confusion. Every route must be composed before code is changed. The route is not ready if the user has to decode backend structure, compare repeated numbers, guess which action is safe, or open a detail view to understand the page.

The composition process before implementation is:
1. Name the role using the screen.
2. Name the one job the route exists to finish.
3. Name the most expensive misunderstanding the route must prevent.
4. Choose the business state that prevents that misunderstanding.
5. Put that state and one safe next action in the first viewport.
6. Move proof, raw payloads, history, source, and advanced controls below the decision layer.

### 2026-07-05 UIX Composition Operating Rule: Regular Work, Not Feature Dump

Before any code or layout change, the implementer must add or update a short markdown composition memo for the route. This is not optional documentation after the fact. It is the thinking step that decides whether the screen will be orderly, usable, efficient, and hard to misunderstand.

The memo must answer these questions in plain business language:
- What is the user trying to finish on this screen?
- What is the one misunderstanding that would create the most business damage?
- Which state, number, or blocker prevents that misunderstanding?
- Which one action is the safe next action from that state?
- Which useful details would slow the user down and must move lower, behind detail, or into proof?

The common screen rhythm for all three modules is:
1. State strip: the current business state and consequence.
2. Action strip: one dominant next action, with disabled reasons shown beside unavailable actions.
3. Work surface: the smallest complete set of records needed to act.
4. Context surface: customer/template/audience/order details that explain the decision.
5. Proof surface: logs, raw provider proof, source, revision history, webhook proof, and audit.

Do not invert that order. A proof-first route is a backend console, not a product screen.

The route fails UIX review when:
- the same count appears in multiple places with unclear meaning;
- two primary buttons look equally important;
- disabled actions do not explain the blocker;
- technical vocabulary appears before business vocabulary;
- the first useful action is hidden behind a modal;
- a long list renders without search, page size, grouping, or virtualization;
- dark mode, light mode, laptop, or narrow/mobile changes the screen hierarchy;
- small pale metadata carries the main meaning for phone, total, order id, customer state, invoice state, reorder state, or blocker reason.

Three-module composition memo:

| Module | Why the user opens it | Main confusion to remove | First useful composition | Efficient route behavior |
| --- | --- | --- | --- | --- |
| Mail Template | To safely change a customer-facing email. | Draft/test/approval/publish/active states looking like equal actions. | Active binding, draft/revision state, rendered preview, readiness blockers, provider mode, test/approval proof, one release CTA. | Release step is staged; source, diff, variables, provider payload, and audit live below the preview/release decision. |
| Mail Marketing | To decide who can be contacted and whether execution is proof-only or live. | Live preview, frozen snapshot, blocked recipients, proof-only, and real delivery looking like one number. | Delivery mode, audience definition, live preview, frozen snapshot, blocked/suppressed count, final eligible count, approved template, one pipeline CTA. | Recipient truth comes before analytics; raw graph, webhook body, provider payload, and per-recipient trace stay in proof/detail. |
| Customer Portal | To let the buyer self-serve orders, invoices, reorder, cart, files, and review states. | Review request looking like checkout success, placeholder invoice looking payable, or blocked reorder looking broken. | Recent orders, payable invoices, reorder-ready items, active cart/review state, readable blockers, one customer-safe CTA. | Customer-safe language only; raw Shopify payloads, tenant/provider/source/routing words, staff notes, and marketing internals never appear in the buyer work surface. |

### 2026-07-05 Final Composition Lock: No-Confusion Route Shape

This is the implementation lock for the next UI pass. Do not start from old screens, table names, endpoint lists, or "all fields we have." Start from the user's mental load. Each route must make one decision obvious, then show enough context to trust that decision, then expose proof only after the work surface is already understandable.

The route is not acceptable if a first-time user must open a modal, compare repeated counters, read raw provider/source data, or understand internal implementation words before knowing what to do.

| Module | User's real question | First viewport composition | One primary action | Demoted below/behind detail |
| --- | --- | --- | --- | --- |
| Mail Template | "Will this change the email customers receive?" | Event/template identity, active binding, draft state, rendered preview, readiness blockers, test proof, approval/publish state, provider mode. | The next release step only: create draft, save draft, test, approve, publish, or activate. | Raw HTML/CSS, variables JSON, revision diff, provider trace, old delivery proof, audit history. |
| Mail Marketing | "Who will receive this, who is blocked, and is delivery real?" | Delivery mode, live audience preview, frozen snapshot, blocked/suppressed/invalid count, final eligible count, approved template, current pipeline state. | The next pipeline step only: preview, freeze, choose template, review blockers, queue disabled proof, or send when enabled. | Raw flow graph, webhook body, provider payload, per-recipient trace, broad analytics, old execution history. |
| Customer Portal | "What can I do now with orders, invoices, reorder, cart, files, or review?" | Account context, recent orders, payable invoices, reorder-ready items, active cart/review state, readable blocker reasons. | The next customer-safe action only: view order, reorder item/order, continue cart, pay/download invoice, or contact staff. | Raw Shopify JSON, tenant/provider/source/routing words, staff notes, marketing internals, debug proof. |

### 2026-07-05 Concrete Composition Brainstorm: Think Before Adding UI

This is the required brainstorming output before new UI is added in the three modules. It is not a design polish note. It is the product composition that prevents user confusion. The implementer must start with the user's job, then decide what belongs in the first viewport, then decide what is proof/detail. Do not start from old routes, backend model names, or every field that exists.

Shared composition hypothesis:
- Users do not want "mail", "marketing", or "portal" complexity. They want to release an email safely, contact the right people safely, or complete an account action safely.
- Every first viewport has one "now" state, one blocker story, and one next safe action.
- Every module uses the same rhythm: Now, Context, Proof.
- A feature that adds information but does not reduce confusion is moved lower or behind detail.
- Tables are allowed only when the user is choosing from a list. They are not the default composition for account-critical or release-critical work.

#### Mail Template Brainstorm: Protected Release Lane

The operator's mental load is release safety. The screen must make accidental production change feel impossible.

| Screen | User question | First viewport | Primary action | Hidden/lower detail |
| --- | --- | --- | --- | --- |
| Template library | "Which customer email needs work?" | Search, event family, active/draft/test/approval state, last meaningful change, readiness blocker. | Open the template that needs the next release step. | Old revisions, raw delivery proof, internal event ids. |
| Template detail | "Will this change what customers receive?" | Active version, draft version, rendered preview, variable readiness, test proof, approval state, provider mode, event binding target. | Exactly one state-derived action: create draft, save, test, approve, publish, or activate. | Raw HTML/CSS, variable JSON, revision diff, provider trace, audit. |
| Test and approval proof | "Can I trust this before activation?" | Test recipient/profile, rendered subject/body result, missing variables, approval result, activation summary. | Approve or return to draft with reason. | Raw provider response and historical tests. |

Composition decisions:
- Rendered preview is primary; source editing is secondary.
- Draft, test, approval, publish, and activation cannot look like equal buttons.
- Active binding must be read-only until the release step explicitly changes it.
- Empty state explains that creating a draft does not affect live customer mail.
- Error state names the failed business step: preview render, test proof, approval, publish, or activation.

#### Mail Marketing Brainstorm: Recipient Decision Room

The operator's mental load is recipient truth. The screen must make it impossible to confuse a moving preview, a frozen snapshot, blocked recipients, and real delivery.

| Screen | User question | First viewport | Primary action | Hidden/lower detail |
| --- | --- | --- | --- | --- |
| Marketing overview | "What needs attention before anyone is contacted?" | Provider mode, work queue, stale snapshots, missing approved templates, blocked/suppressed count, failed/skipped proof. | Open the next unsafe/unready item. | Broad analytics, raw events, old execution history. |
| Audience builder | "Who qualifies and who is excluded?" | Business-language criteria, live preview count, exclusion reasons, consent/suppression summary, sample recipients. | Freeze snapshot when preview is acceptable. | Raw query, flow graph, per-recipient debug. |
| Campaign send lane | "Who will actually receive this?" | Frozen snapshot, final eligible count, blocked count, selected approved template, provider mode, delivery readiness. | Queue disabled proof or send only when all blockers are clear and sending is enabled. | Provider payload, delivery trace, deep analytics. |
| Flow/webhook lane | "What will this automation do, and is outbound data allowed?" | Business nodes, trigger, approved template/action, destination readiness, proof-only/live-requested state. | Validate or request exact live approval. | Webhook body, secret proof, raw flow JSON, provider event payload. |

Composition decisions:
- Live preview and frozen snapshot must have different visual treatment.
- Blocked, suppressed, unsubscribed, invalid, and frequency-capped people are never counted as reachable.
- Disabled-provider proof cannot use copy that suggests a customer email was sent.
- Analytics is useful after eligibility and delivery mode are understood, not before.
- Empty state points to the next setup step: contacts, audience, approved template, or provider mode.
- Error state names the failed business step: preview, snapshot, blocker review, queue, send, or webhook readiness.

#### Customer Portal Brainstorm: Buyer Account Desk

The buyer's mental load is account action. The screen must not expose staff operations, raw Shopify payloads, or fake success states.

| Screen | User question | First viewport | Primary action | Hidden/lower detail |
| --- | --- | --- | --- | --- |
| Account home | "What can I do now?" | Open invoices, recent orders, reorder-ready items, active cart/review state, readable blockers. | Continue the one most useful account action. | Staff notes, marketing internals, raw Shopify payload. |
| Orders | "Where is my order and what happened?" | Search, page size, recent order rows, status, total, tracking/payment hint, reorder eligibility. | View order or reorder eligible item/order. | Full timeline, raw fulfillment/refund payloads, internal ids. |
| Order detail | "Can I trust this order detail and reorder from it?" | Status, total, fulfillment/tracking, line items, item properties, files/proofs, invoice/payment state, reorder reason. | Reorder eligible item/order or contact staff when blocked. | Audit proof, internal reconciliation, raw properties JSON. |
| Invoices | "Can I pay or download this invoice?" | Payable/paid/overdue/void state, amount, due date, download/pay availability, blocker reason. | Pay or download only when backed by real persisted state. | Provider/payment trace, internal finance proof. |
| Reorder/cart | "Will this create a real checkout or a review request?" | Eligible items, unavailable reasons, persisted cart state, checkout URL state, review-request state. | Continue cart, checkout, or request review with clear consequence. | Cart activity proof and internal Shopify response. |
| Documents | "Which file can I safely open?" | File type split, search, page size, invoice/design/account-doc grouping, safe open/download action. | Open/download one allowed file. | Storage metadata, raw file source payload. |

Composition decisions:
- The portal is customer-facing. It never shows tenant, provider, source, workflow, queue, routing, campaign, suppression, staff note, or raw Shopify JSON terms.
- Review request, checkout success, payable invoice, placeholder invoice, eligible reorder, and blocked reorder must look different.
- Order, invoice, reorder, and customer-account detail uses centered modal or full page, not a narrow side drawer.
- Lists default to 10 rows and expose intentional page-size choices: 50, 100, 150.
- Empty state gives a useful account step: search another order, browse products, contact staff, or check account email.
- Error state names the failed business step: order load, invoice load, reorder eligibility, cart creation, checkout creation, or file download.

#### Cross-Module Composition Decisions

- Top KPI cards are allowed only when each number changes the next action. Decorative metrics are removed.
- Repeated numbers are collapsed into one decision number plus drill-down.
- A modal opens with the recommended action and why, then context, then proof.
- Primary actions keep a consistent location inside each route family.
- Secondary actions are quiet and cannot visually compete with the primary action.
- Long lists must have server-backed search, paging, grouping, or virtualization before real volume is rendered.
- Empty, loading, error, disabled, and loaded states are designed before API binding is considered complete.
- Light mode, dark mode, laptop width, and narrow/mobile width must preserve the same hierarchy.

#### Composition Brainstorm Sequence

Before implementation, write this in the task note or PR for every route:

1. The screen exists so `[role]` can `[one job]` without confusing `[dangerous wrong state]` with `[safe/current state]`.
2. The first viewport must answer `[current state]`, `[safe next action]`, and `[blocker reason]`.
3. The page must not need `[raw proof/detail]` to explain the action.
4. The longest list on the page uses `[search/page size/grouping/virtualization]` before rendering real volume.
5. The empty state points to `[first valid action]`; the error state names `[failed business step]`.

If any bracket cannot be filled with plain business language, the route is not ready for UI work.

#### Module-Specific Composition Shape

Mail Template uses a protected release-lane shape:
- Header: selected event/template family, active version, draft version, provider mode.
- Decision strip: readiness blockers, test proof, approval state, activation target.
- Main area: rendered customer preview first; source editing and variables second.
- Proof tray: revisions, diffs, delivery proof, provider trace, audit.

Mail Marketing uses a recipient-control-room shape:
- Header: delivery mode, campaign/flow state, live preview, frozen snapshot, blocked count, eligible count.
- Decision strip: approved template, consent/suppression readiness, pipeline blocker.
- Main area: the active pipeline step owns the page: audience, snapshot, template, blockers, queue/proof, delivery evidence.
- Proof tray: per-recipient trace, flow config, provider events, analytics drilldown.

Customer Portal uses a buyer-account-desk shape:
- Header: account identity only when it helps the action.
- Decision strip: open invoices, recent orders, reorder-ready items, active cart or review state.
- Main area: action cards and searchable/paged business lists, not raw history dumps.
- Proof/detail: order timeline, invoice activity, cart outcome, document/file proof.

#### Usability Failure Conditions

Stop and recompose the route when any of these are true:
- two CTAs look equally important;
- the same number appears in multiple places with different meanings;
- a disabled button does not explain its blocker beside the button;
- a customer-facing screen exposes internal words or raw payloads;
- an operator must read logs/source/history before understanding the primary action;
- light mode, dark mode, laptop width, or narrow/mobile layout changes the information hierarchy;
- the page is feature-rich but the user cannot explain the next action in five seconds.

### 2026-07-05 Brainstorming Mandate: Compose The Work, Not The Data

This is the required product-thinking pass before adding or changing any screen in the three modules. The system can have deep backend behavior, but the user must never experience that depth as confusion. The UIX target is ordered, usable, efficient work composition. A feature is not complete when it exists; it is complete when the correct user can use it without guessing.

Before coding, the implementer must write the composition as a short work story:

> This screen exists so [role] can [finish one job] without confusing [dangerous wrong state] with [safe/current state].

If that sentence is not clear, implementation pauses. Adding tables, counters, buttons, tabs, modals, or advanced controls before this sentence is a product bug.

#### Three-Module Composition Brainstorm

| Module | Work story | First user question | Main confusion to prevent | Correct first viewport |
| --- | --- | --- | --- | --- |
| Mail Template | Admin protects a customer-facing email release. | "Will this change what customers receive?" | Draft, test, approval, publish, and activation looking like the same consequence. | Active binding, draft state, rendered preview, test proof, approval/publish blockers, provider mode, one next release action. |
| Mail Marketing | Operator controls who can be contacted and whether execution is proof-only or live. | "Who will receive this, who is blocked, and is this real?" | Moving preview being mistaken for frozen recipients; proof-only execution being mistaken for delivery. | Delivery mode, live preview, frozen snapshot, blocked/suppressed count, final eligible count, approved template, one next pipeline action. |
| Customer Portal | Buyer self-serves orders, invoices, reorder, cart, files, and review states. | "What can I do now?" | Review request looking like checkout success; placeholder invoice looking payable; unavailable reorder looking broken. | Recent orders, payable invoices, reorder-ready items, active cart/review state, readable blockers, one customer-safe action. |

#### Composition Rules For Usability

- First viewport is a work surface, not a database report.
- Each visible number must change a decision; decorative KPI cards are removed or moved lower.
- Each row/card must explain what the user can do with it; passive data dumps are not accepted.
- A long list starts with search, grouping, paging, or virtualization. Rendering thousands of records is not a feature.
- A modal opens with "what to do now" and "why", then context, then proof. It never opens with raw JSON, raw provider data, raw Shopify payload, or internal routing terms.
- One primary CTA is visually dominant. Secondary actions are useful but quiet.
- Disabled actions show the blocker beside the action, not only in logs.
- Light mode, dark mode, laptop width, and narrow/mobile width must preserve the same hierarchy and readable contrast.

#### What Must Stay Out Of The Primary Surface

Mail Template:
- raw HTML/CSS source before rendered preview;
- variable JSON before readiness blockers;
- provider trace before the release decision;
- revision history before active/draft state.

Mail Marketing:
- raw flow graph JSON before recipient readiness;
- webhook payloads before destination safety state;
- provider event payloads before delivery/proof status;
- analytics depth before eligibility, blocker, and delivery-mode truth.

Customer Portal:
- raw Shopify JSON;
- tenant/provider/source/routing language;
- staff notes or marketing internals;
- side-drawer deep detail for order, invoice, reorder, cart, or customer-account decisions.

#### Route Acceptance Sentence

Every route must pass this sentence before implementation:

> A first-time user can understand the current state, the safe next action, and the blocker/reason in the first viewport without opening proof, history, source, logs, or raw payloads.

If this sentence is false, the route is incomplete even if backend parity, contracts, and API calls are finished.

### Mandatory Pre-Code Composition Worksheet

Before any UI work in these three modules, write the screen composition first. This is not a cosmetic note. It is the product safety layer that prevents a powerful feature set from becoming confusing. A route is blocked until the following worksheet can be answered in plain business language:

| Question | Required answer |
| --- | --- |
| Who is using this screen? | Admin operator, marketing operator, buyer, customer user, or subuser. |
| What one job are they trying to finish? | A single business job, not a list of backend capabilities. |
| What mistake would hurt most? | Accidental release, wrong recipient list, fake checkout success, non-payable invoice, unavailable reorder, or another concrete confusion. |
| Which state prevents that mistake? | Active/draft, live/frozen, eligible/blocked, payable/unpayable, reorderable/unavailable, checkout/review. |
| What is the one safe next action? | The primary CTA derived from the current state. |
| What must move lower? | Raw payload, source code, provider trace, audit, debug, history, or advanced controls. |

The composition must be written before layout changes. If the answer is "show all fields and let the user decide," the screen is not ready.

#### Route-Level Acceptance Gate

For every route in Mail Template, Mail Marketing, and Customer Portal, the worksheet above must be committed as the first design artifact before implementation. The route cannot pass review when the implementation has endpoints, tables, and buttons but the composition answer is still vague.

The route-level gate is:
- The first viewport has one dominant business state and one safe next action.
- The user can understand the state without reading logs, raw payloads, source, audit history, or provider traces.
- Repeated numbers are collapsed into decision numbers only; supporting counts move below the work surface.
- Disabled actions explain the blocker beside the action.
- Internal implementation words are hidden from the role that should not see them.
- Detail views are centered or full-page when the decision is important; narrow side drawers cannot carry account-critical or release-critical decisions.
- Light mode, dark mode, laptop width, and mobile width preserve the same hierarchy.

If this gate conflicts with a feature request, the composition wins first. The feature can still exist, but it must sit in the correct layer: decision, context, or proof.

#### Repeatable Proof Gate

UIX signoff cannot depend on one person saying the page looked acceptable. Every meaningful change in these three modules must be backed by repeatable proof:

- API proof that the surface is using real tenant data, not mock or static rows.
- Light mode screenshot.
- Dark mode screenshot.
- Desktop/laptop-width screenshot.
- Narrow/mobile screenshot.
- A manifest that records which route, theme, viewport, and surface was checked.

The current harness is `pnpm evidence:mail-rollout`. It writes a manifest under `docs/evidence/mail-rollout/<run-id>/` and treats skipped browser/API proof as incomplete, not passed.

The proof gate exists for the same reason as the composition gate: a powerful module can still fail if it is visually confusing, unreadable in dark mode, unusable on a narrow screen, or secretly disconnected from live data.

#### Three-Module Brainstorm Before UI

Mail Template:
- Role: admin/operator protecting customer-facing email.
- One job: move one email template through draft, proof, approval, publish, and active binding without accidental release.
- Dangerous confusion: saving source, sending a test, approving, publishing, and activating appear to have the same consequence.
- First viewport composition: event/template identity, active version, draft/selected revision, rendered customer preview, readiness blockers, test proof, approval state, provider mode, and one staged release CTA.
- Detail placement: raw HTML/CSS, variable JSON, revision diff, delivery proof, provider response, and audit history sit below the release decision or behind centered/full-page detail.
- Usability test: the operator can say "this is live" or "this is still draft/proof" in five seconds.

Mail Marketing:
- Role: admin/marketing operator deciding whether customers can be contacted.
- One job: prove who will be contacted, who is blocked, which approved template is attached, and whether execution is proof-only or live-enabled.
- Dangerous confusion: a moving audience preview looks like the final frozen send list, or disabled-provider proof looks like real customer delivery.
- First viewport composition: delivery mode, audience/campaign/flow identity, live preview count, frozen snapshot count, blocked/suppressed/invalid count, final eligible count, approved template, and one pipeline CTA.
- Detail placement: flow graph JSON, webhook payload, provider event body, per-recipient trace, analytics depth, and old delivery history sit below the recipient decision.
- Usability test: the operator can say "this many are eligible, this many are blocked, this is proof-only/live" without opening debug detail.

Customer Portal:
- Role: buyer, customer user, or subuser self-serving account work.
- One job: act on orders, invoices, reorderable items, carts, design files, and review states without seeing staff operations.
- Dangerous confusion: review request looks like checkout success, placeholder invoice looks payable, unavailable reorder looks broken, or raw Shopify data looks customer-facing.
- First viewport composition: recent orders, payable invoices, reorder-ready items, active cart/review state, latest shipment/payment context when relevant, blocker reasons, and one customer-safe CTA.
- Detail placement: staff notes, internal routing, campaign membership, tenant/provider/source fields, raw Shopify payload, and proof/debug data never lead the customer screen.
- Usability test: the customer can identify "I can do this now" versus "staff must review this" without support explanation.

#### Composition Grammar

Use the same grammar in all three modules so the product feels regular:

1. Orientation: where am I, which object is selected, and what state matters?
2. Decision: what is safe now, what is blocked, and what is the one next action?
3. Work context: what preview, recipient sample, order, invoice, reorder, or cart detail explains the decision?
4. Proof: what audit, provider trace, revision, raw payload, delivery log, or history proves it after the user already understands the decision?

This order is mandatory. Proof cannot be the first screen. Raw data cannot be the work surface. A detail view cannot be required just to understand the primary action.

### Composition Brainstorm: Usability Before Capability

The central product condition is disciplined composition. A module is not good because it has many controls, dense tables, or every old-system field visible. It is good only when the user can scan the page, understand the current business state, and complete the next safe action without confusion.

This is the required thinking before any UI change in all three modules:

1. What is the user actually trying to finish?
2. What would they misunderstand if the page is too dense?
3. Which state or blocker removes that misunderstanding?
4. What is the one next action that should be visually dominant?
5. Which useful but distracting details must move lower, behind a modal, or into proof?

The answer must be written before layout or code work. If the screen cannot be explained as a clean work composition, do not add another button, table column, badge, statistic, or tab.

#### Three-Module Composition Outcome

| Module | First thought before UI | Correct composition | What must not happen |
| --- | --- | --- | --- |
| Mail Template | The operator is protecting a customer-facing email from accidental release. | Release lane: active version, draft version, rendered preview, test proof, approval, provider mode, blockers, and one next release action. | A draft, test, approval, publish, and activation action cannot look equal or interchangeable. |
| Mail Marketing | The operator is deciding who can be contacted and whether this is proof-only or real delivery. | Recipient control room: live preview, frozen snapshot, blocked/suppressed count, final eligible count, approved template, delivery mode, and one next pipeline action. | A moving preview cannot look like a frozen send list; blocked people cannot look reachable; proof-only cannot sound like customers were contacted. |
| Customer Portal | The buyer is trying to self-serve orders, invoices, reorder, carts, files, and review states. | Buyer account desk: recent orders, payable invoices, reorder-ready items, active cart/review state, readable blockers, and one customer-safe action. | Review request cannot look like checkout success; placeholder invoice cannot look payable; raw Shopify/internal data cannot appear as customer content. |

#### First Viewport Composition Contract

Every first viewport must be useful before it is rich:

- Show one role-safe title and one business-state sentence.
- Show only three to five numbers, and each number must explain its consequence.
- Show one dominant primary action derived from the current state.
- Show blocker reasons beside disabled actions, not hidden in logs.
- Show a readable work surface, not a generic data dump.
- Keep raw source, raw payload, revision diff, provider event, audit history, and unbounded lists below the decision layer.

The route fails UIX review when:
- the user must compare repeated numbers to know which one matters;
- the primary action is one of many equal-looking buttons;
- a customer sees internal terms such as provider, tenant, workflow, source, suppression, queue, raw payload, or Shopify JSON;
- an operator must open proof/debug detail to understand the page;
- long lists render before search, grouping, pagination, or page-size control;
- dark mode, narrow layout, or laptop width breaks the hierarchy.

#### Module-Specific Brainstorm Boards

Mail Template board:
- The user asks: "Will this change the email customers receive?"
- The first screen must separate active, draft, tested, approved, published, and activated.
- The preview and readiness checklist are the center of gravity.
- Raw HTML/CSS is an advanced editing surface, not the first mental model.
- The safest dominant CTA is the next release step only.

Mail Marketing board:
- The user asks: "Exactly who will be contacted, who is blocked, and is this real?"
- The first screen must separate live preview from frozen snapshot.
- Audience and blocker meaning come before campaign analytics.
- Template selection must require an approved/published template when customer delivery is at stake.
- The safest dominant CTA is the next pipeline step only.

Customer Portal board:
- The user asks: "What can I do now with my account?"
- The first screen must separate payable, paid, review-required, reorderable, unavailable, and blocked states.
- Order, invoice, reorder, and cart details must be readable business objects, not raw payloads.
- Deep detail opens centered or full-page; narrow side drawers are not acceptable for account-critical detail.
- The safest dominant CTA is the next customer-safe action only.

### Shared Screen Composition

Every primary route in Mail Template, Mail Marketing, and Customer Portal must use this order:

| Layer | Purpose | Allowed in first viewport | Not allowed in first viewport |
| --- | --- | --- | --- |
| Orientation | Tell the user where they are and what state matters. | Role-safe title, selected entity, current business state, one sentence explaining consequence. | Internal ids, raw source, provider payloads, debug names, ambiguous labels. |
| Decision | Let the user decide the next safe action. | Three to five consequence-changing numbers, blockers, readiness state, one primary CTA. | Equal-weight action clusters, repeated counts, decorative stats. |
| Work Context | Explain why the action is correct. | Preview, recipient sample, order summary, invoice status, reorder eligibility, missing reason. | Unbounded lists, raw JSON, unrelated history. |
| Proof | Verify and debug after the decision is clear. | Audit, revision diff, delivery trace, provider event, raw payload. | Primary CTA, customer-facing claims, safety blockers hidden only here. |

### Module Decisions

| Module | Product shape | One job | First viewport must answer | Primary CTA rule | Must move lower |
| --- | --- | --- | --- | --- | --- |
| Mail Template | Protected release lane | Safely change a customer-facing email. | Is this draft, tested, approved, published, active, and provider-safe? | Only the next release step is dominant: create draft, save, test, approve, publish, or activate. | HTML/CSS source, variable JSON, revision diff, provider response, old delivery proof. |
| Mail Marketing | Recipient control room | Decide exactly who can be contacted and whether delivery is real or proof-only. | Who qualifies, who is blocked, is the list live preview or frozen snapshot, which approved template is attached, and what delivery mode is active? | Only the next pipeline step is dominant: preview, freeze, select template, review blockers, queue proof, or send when enabled. | Flow JSON, webhook payload, provider event body, per-recipient debug, analytics that does not affect readiness. |
| Customer Portal | Buyer account desk | Let the customer self-serve orders, invoices, reorders, carts, files, and review requests. | What can I do now, what is blocked, what is payable, what is reorderable, and what needs staff review? | Only the next customer-safe action is dominant: view order, reorder, continue cart, pay/download invoice, or request review. | Staff notes, workflow/routing/source fields, campaign internals, tenant/provider terms, raw Shopify payload. |

### Confusion To Eliminate Before Code

Mail Template:
- Draft save must not look like a live customer email changed.
- Test proof must not look like approval.
- Published revision must not silently imply active event binding.
- Disabled-provider proof must not sound like a customer email was sent.

Mail Marketing:
- Live preview must not look like the final frozen send list.
- Blocked, suppressed, unsubscribed, invalid, and capped recipients must not be counted as reachable.
- Proof-only execution must not look like live customer delivery.
- Campaigns, flows, audiences, contacts, and delivery cannot appear as unrelated equal tabs without pipeline context.

Customer Portal:
- Review request must not look like checkout success.
- Placeholder or imported invoice must not look payable.
- Unavailable reorder must not look broken; it needs a readable reason.
- Raw Shopify addresses, properties, metafields, and order JSON must never be shown as customer-facing content.

### Route-Level Composition Requirements

Mail Template routes:
- Template library starts with event family, active/draft status, readiness, and next release action before the table.
- Template workspace starts with active binding, draft state, rendered preview, test/approval state, and release blockers before raw source.
- Revision/proof detail opens centered or full-page, with audit/proof below business meaning.

Mail Marketing routes:
- Overview starts with delivery mode, campaigns needing action, stale snapshots, blocked recipients, and failed/skipped proof.
- Audience builder starts with business criteria and live count, then blocker groups, then sample recipients.
- Campaign builder starts with audience -> snapshot -> approved template -> blockers -> queue/proof.
- Flow builder starts with trigger and business action, not raw graph JSON.
- Delivery detail starts with recipient outcome and blocker reason, then provider evidence.

Customer Portal routes:
- Account home starts with recent orders, open invoices, reorder-ready items, active cart/review state, and one clear next action.
- Orders and customer archive lists default to 10 rows, server-backed search, page-size choices, and no unbounded rendering.
- Order detail starts with status, total, tracking, line items, item properties, files, invoice/payment state, and reorder eligibility.
- Reorder detail separates full-order reorder, item-level reorder, unavailable items, persisted cart, checkout URL, and staff-review request.
- Invoice detail separates payable, paid, imported, draft, unavailable, and download-only states.

### Operational UI Rules

- One screen has one dominant job.
- One state has one dominant primary action.
- Every count is labeled by consequence: live, frozen, eligible, blocked, payable, paid, due, skipped, failed, disabled, proof-only, or review-required.
- Every disabled action explains the business reason beside the button.
- Long lists start at 10 rows and expand only through server search, pagination, or explicit page-size selection.
- Deep details use centered modal or full page. Narrow side drawers are not used for template release, campaign proof, order detail, customer detail, invoice detail, or reorder review.
- Light mode, dark mode, laptop width, and narrow layout must preserve the same hierarchy and readable contrast.
- Body text carries business meaning at readable size. Tiny pale metadata cannot be the only place where phone, total, order id, status, blocker, or next action appears.

Acceptance sentence:
- Before implementation, the screen must be describable as: "This screen exists so [role] can [job] safely, because [state] tells them [next action]."

### 2026-07-05 Product Composition Brainstorm: No-Confusion First

This is the thinking pass before adding more controls to any of the three modules. The main requirement is not visual polish, feature density, or copying the old screens. The main requirement is an orderly, usable, efficient composition where the user understands the current state, trusts the numbers, and knows the next safe action without learning backend vocabulary.

The product risk is different in each module:
- Mail Template risk: the operator thinks a draft, test, approval, publish, or activation action has the same consequence.
- Mail Marketing risk: the operator thinks a moving audience preview is the final send list, or thinks proof-only mode contacted customers.
- Customer Portal risk: the buyer thinks a review request, unavailable reorder, placeholder invoice, or missing checkout URL is a completed customer action.

The brainstorming rule is:
1. Name the role and the one job the screen finishes.
2. Identify the single most expensive misunderstanding for that role.
3. Put the state that prevents that misunderstanding in the first viewport.
4. Put one state-derived primary action beside that state.
5. Move proof, raw data, history, and advanced controls below the decision surface.

If a screen cannot pass that five-step check in the first five seconds, the implementation is not ready even when every endpoint is complete.

First-viewport composition budget:
- one role-safe title and one state sentence;
- one primary business state strip;
- three to five decision-changing numbers at most;
- one dominant primary action derived from the current state;
- one readable work surface for the current job;
- zero raw payloads, internal ids, debug traces, hidden blockers, or equal-weight action clusters.

Anything outside that budget must move to a lower proof section, centered detail modal, advanced panel, or separate route. This is how the UI stays regular, usable, and efficient instead of becoming a feature dump.

| Module | User decision | First viewport composition | Move lower or behind detail | Confusion that must never happen |
| --- | --- | --- | --- | --- |
| Mail Template | "Can this customer-facing email safely move toward live?" | Selected event/template, active version, draft version, rendered customer preview, readiness blockers, test proof, approval state, provider mode, one staged release CTA. | Raw HTML/CSS, variable JSON, revision diff, provider payload, old delivery rows, audit trace. | Draft save, test send, approval, publish, and activation looking like equal actions or equal consequences. |
| Mail Marketing | "Who will be contacted, who is blocked, and is this real delivery or proof-only?" | Provider mode, audience definition, live preview count, frozen snapshot count, blocked/suppressed count, final eligible count, approved template, one pipeline CTA. | Flow JSON, webhook body, per-recipient trace, provider event payload, analytics depth, historical debug. | Moving preview count looking like the final send list, blocked recipients counted as reachable, or disabled proof looking like real customer delivery. |
| Customer Portal | "What can I do now with my orders, invoices, reorders, carts, files, or review requests?" | Recent orders, payable invoices, reorder-ready items, active cart/review state, latest shipment/payment context, clear blocker reasons, one customer-safe CTA. | Staff notes, internal routing, raw Shopify payload, campaign membership, provider/debug state, tenant/source fields. | Review request looking like checkout success, placeholder invoice looking payable, unavailable reorder looking broken, or raw Shopify data looking customer-readable. |

Layout decisions that protect usability:
- First viewport starts with decision, not history.
- Primary action appears once, in the same predictable place for the same state.
- Secondary actions are quieter and cannot compete with the state-derived primary action.
- Long lists default to 10 rows and require server-backed search before expansion.
- Dense order, invoice, template, campaign, and customer detail opens as centered modal or full page, not a narrow side drawer.
- Dark mode and light mode must preserve contrast for phone numbers, totals, order ids, blockers, and disabled reasons.
- Body text must be readable at operational distance; small, pale metadata cannot carry the main meaning.
- Internal terms must be translated before they reach the role: customers never see provider, tenant, workflow, queue, source, axis, suppression, staff routing, or raw Shopify payload; operators see business labels before technical proof.

The acceptance test is human, not cosmetic: a non-engineer should be able to describe the page in one sentence, identify the next safe action, and understand why unavailable actions are blocked.

### 2026-07-05 Usability Composition Pass: Regular, Efficient, Calm

This is the required brainstorming pass before adding or changing UI in any of the three modules. The standard is not "all backend data is visible." The standard is "the user does not get confused, can scan the screen quickly, and knows the next safe action."

Every screen must be composed from the user's mental load outward:
1. What is the user trying to finish right now?
2. What wrong assumption would hurt the business or customer most?
3. Which state prevents that wrong assumption?
4. Which one action should the user take next?
5. Which useful information would distract from that decision and must move lower?

If these five answers are not clear, do not add controls yet. A bigger screen with more fields is not a better screen when the composition is weak.

| Module | User's simple sentence | Most dangerous confusion | First-screen decision state | One primary action | Lower/hidden proof |
| --- | --- | --- | --- | --- | --- |
| Mail Template | "I am preparing the email customers will receive." | Draft, test, approval, publish, and active binding look like the same consequence. | Active version, draft version, preview state, variable readiness, approval/test state, provider mode. | The next release-lane action only: create draft, test, approve, publish, or activate. | HTML/CSS source, variable JSON, revision diff, provider response, delivery trace. |
| Mail Marketing | "I am deciding who will be contacted and whether this is real delivery." | Live preview, frozen snapshot, blocked recipients, and disabled proof look like one recipient count. | Live audience, frozen snapshot, blocked/suppressed count, final eligible count, selected approved template, delivery mode. | The next pipeline action only: preview, freeze, choose template, review blockers, queue proof, or send. | Flow graph JSON, webhook body, provider payload, per-recipient trace, analytics drilldown. |
| Customer Portal | "I am finding orders, invoices, reorders, carts, files, or review requests." | Review request looks like checkout success, placeholder invoice looks payable, unavailable reorder looks broken. | Recent orders, payable invoices, reorder-ready items, active cart/review state, blocker reason, customer-safe status. | The next customer-safe action only: view order, reorder, continue cart, pay/download invoice, or request review. | Staff notes, routing, raw Shopify payload, campaign membership, provider/integration proof. |

The composition must stay regular across all three modules:
- one dominant job per route;
- one dominant action per state;
- three to five decision-changing numbers at most in the first viewport;
- search, paging, or grouping before any long list;
- centered modal or full page for deep detail, not narrow side drawers;
- body copy readable enough for daily operation, not tiny metadata as the main meaning;
- light, dark, laptop, and narrow layouts preserving the same hierarchy;
- role-safe terminology before technical proof.

The fastest usability test is this: hide the left navigation and ask what the page is for. If the answer is not obvious from the first viewport, the page is not composed yet.

### Deliberate Composition Boards: Think Before Adding UI

Before adding a tab, badge, statistic, modal, or editor surface, pause and compose the module as a work system. The rule is not "show more because the backend has it." The rule is "show the smallest complete picture that lets the role make the next correct decision."

This thinking must happen for all three modules:
- What is the role trying to finish in this moment?
- What misunderstanding would create the most damage?
- Which state, count, or blocker prevents that misunderstanding?
- Which action is the only safe next action from that state?
- Which useful details would slow or confuse the first decision and therefore belong lower?

#### Mail Template Board

Primary user: admin/operator releasing customer-facing email.

The page must feel like a controlled release lane. The operator should immediately understand whether they are editing a private draft, testing a revision, approving content, publishing a revision, or changing the active customer-facing binding.

First viewport:
- selected event/template family;
- active customer-facing version;
- current draft or selected revision;
- rendered customer preview;
- variable readiness and missing blockers;
- test proof and approval state;
- provider mode from Mail Center;
- one staged CTA that matches the current state.

Do not lead with:
- raw HTML/CSS editor;
- variable JSON;
- revision diff;
- provider payload;
- old delivery rows;
- equal-weight save/test/approve/publish/activate buttons.

Composition decision: preview and release safety sit above source editing. Source editing is important, but the first human risk is accidental release, not code editing speed.

#### Mail Marketing Board

Primary user: admin/marketing operator deciding whether a real audience can be contacted.

The page must feel like a recipient control room. The operator should immediately know who qualifies, who is blocked, whether the list is a moving preview or a frozen send list, which approved template is attached, and whether delivery is live, test-only, or proof-only.

First viewport:
- delivery mode from Mail Center;
- campaign/flow/audience identity;
- live preview count;
- frozen snapshot count;
- blocked/suppressed/invalid count;
- final eligible count;
- selected approved template;
- one pipeline CTA: preview, freeze, select template, review blockers, approve, queue proof, or send when explicitly enabled.

Do not lead with:
- raw flow JSON;
- webhook payload;
- provider event body;
- per-recipient trace;
- decorative analytics;
- contacts/audiences/campaigns/flows as unrelated tables.

Composition decision: every number must say what consequence it has. "120 preview" is not "120 final recipients." "57 proof records" is not "57 customers contacted." The UI must label this distinction before showing analytics.

#### Customer Portal Board

Primary user: buyer, customer user, or subuser trying to self-serve.

The page must feel like a buyer account desk. The customer should not see staff operations, routing, workflow, provider, tenant, or raw Shopify structure. They should see what they can do now with orders, invoices, reorders, carts, files, and review requests.

First viewport:
- recent orders and their customer-readable status;
- open/payable invoices;
- reorder-ready items;
- active cart or staff-review request;
- latest shipment/payment context when relevant;
- clear blocker reasons for unavailable actions;
- one customer-safe CTA for the current context.

Do not lead with:
- staff notes;
- internal routing or assignment;
- campaign membership;
- raw Shopify JSON;
- placeholder invoices;
- review requests that look like checkout success;
- thousands of rows before search or paging.

Composition decision: customer-facing screens must separate "you can complete this now" from "staff must review this." Those states need different language, color, action, and proof.

#### Shared Board Rules

Use these rules as the final UIX filter:
- Every primary screen gets one dominant job.
- Every first viewport gets one dominant action.
- Every number must be tied to a consequence: active, draft, frozen, eligible, blocked, payable, paid, reorderable, unavailable, proof-only, test-only, or live.
- Every disabled action must show a business reason.
- Every long list starts at 10 rows and expands only through search, paging, or intentional page-size selection.
- Dense details open centered or full-page; side drawers are not used for template release, campaign proof, order detail, customer detail, invoice detail, or reorder review.
- Internal vocabulary is translated before it reaches the role.
- Light, dark, laptop, and narrow layouts must preserve the same hierarchy.

If a proposed UI cannot pass this board, do not implement it yet. Recompose the screen first.

### Three-Module No-Confusion Contract

| Module | Product metaphor | User must understand first | Primary confusion to eliminate | Composition decision |
| --- | --- | --- | --- | --- |
| Mail Template | Protected release lane | Am I editing a draft or changing the customer-facing email? | Draft, test, approved, published, and active states looking interchangeable. | Put active binding, draft state, rendered preview, readiness checklist, and one staged release action above source/proof. |
| Mail Marketing | Recipient control room | Who will receive this, who is blocked, and is delivery real or proof-only? | Preview counts, frozen send lists, blocked recipients, and proof-only records being treated as the same thing. | Put audience decision, frozen snapshot, blockers, approved template, provider mode, and one pipeline CTA before analytics/debug. |
| Customer Portal | Buyer account desk | Where is my order, invoice, reorder, cart, file, or next account action? | Review request looking like checkout success, draft invoice looking payable, or raw Shopify data looking customer-readable. | Put customer-safe next actions, recent orders, payable invoices, reorder-ready items, active cart/review state, and clear blockers before history/raw detail. |

### 2026-07-05 Composition Brainstorm: Calm, Usable, Efficient

This is the pre-code product thinking for all three modules. The screen is only acceptable when the user can understand the page, trust the state, and take the correct action without being trained on the backend model.

The real UIX target is:
- orderly: one dominant mental model per route, not several competing panels;
- usable: the next action is visible, named by consequence, and blocked with a plain reason when unavailable;
- efficient: long data sets are searched, paged, grouped, or virtualized before they are shown;
- no-confusion: draft/live, preview/frozen, payable/review, and reorderable/unavailable states can never look interchangeable.

Brainstorming outcome by module:

| Module | First human question | What must be visually loud | What must be visually quiet | What must never happen |
| --- | --- | --- | --- | --- |
| Mail Template | "Will this change the email customers receive?" | Active binding, draft state, rendered preview, readiness blockers, one release action. | Raw HTML/CSS, revision diff, provider trace, variable JSON, old delivery rows. | Save/test/approve/publish/activate appearing as equal actions. |
| Mail Marketing | "Exactly who will be contacted, and is this real delivery?" | Live preview, frozen snapshot, blocked/suppressed count, final eligible count, approved template, provider mode. | Flow JSON, webhook payload, per-recipient trace, analytics depth, provider event body. | Moving preview count being presented like the final send list. |
| Customer Portal | "What can I do with my orders, invoices, reorders, carts, and files?" | Recent orders, payable invoices, reorder-ready items, active cart/review state, next customer-safe action. | Staff notes, internal routing, workflow/source/provider words, raw Shopify payload, marketing membership. | Review request looking like checkout success or non-payable invoice looking payable. |

Composition principle:
1. Start with the decision the role is trying to make.
2. Show the minimum state needed to make that decision safely.
3. Put the next action beside the state, not after a report.
4. Move proof, debug, history, and raw payload lower.
5. Refuse dense UI if the density does not make the decision faster.

Three-module screen architecture:

| Layer | Mail Template | Mail Marketing | Customer Portal |
| --- | --- | --- | --- |
| Orientation | Event/template family, active version, draft version, provider mode. | Campaign/flow/audience, delivery mode, live vs frozen state. | Account identity, recent activity, current order/invoice/cart context. |
| Decision | Readiness checklist and one staged release CTA. | Audience/snapshot/template/blocker pipeline and one staged send/proof CTA. | Next-action cards for orders, invoices, reorder, cart/review, files. |
| Work context | Rendered preview and selected profile before source. | Recipient sample, blocker groups, selected template, schedule. | Searchable paged orders/invoices/items with readable business fields. |
| Proof | Revision history, delivery proof, provider trace, variable payload. | Recipient trace, delivery evidence, raw flow/webhook details. | Timeline, item properties, files, invoice activity, cart outcome history. |

This section is a hard implementation gate. If a proposed UI starts as a generic table, debug report, raw editor, or side drawer of unrelated fields, it must be recomposed before code.

### First-Viewport Composition Law

Every first viewport must contain only what helps the user decide what to do next:
- current business state;
- the selected customer/order/template/audience/campaign/cart/invoice when relevant;
- the small set of counts that change the decision;
- one primary CTA derived from current state;
- plain-language disabled/blocker reason;
- empty/loading/error copy written for the role, not the database.

Every first viewport must avoid:
- raw JSON, enum names, provider payloads, tenant ids, workflow/source/routing terms, or internal ids;
- duplicate KPI cards that do not change the next action;
- equal-weight destructive, publishing, sending, testing, and saving actions;
- unbounded tables without search, paging, grouping, or virtualization;
- side drawers for dense order/customer/template/campaign work;
- light-only, dark-only, or wide-screen-only layouts.

### Efficient Composition Checks

Before coding or accepting any screen, the implementer must be able to answer these without guessing:

| Check | Required answer |
| --- | --- |
| One-sentence purpose | What job does this screen finish? |
| Main mistake prevented | What expensive user confusion does the layout prevent? |
| First action | What is the one safest next action in the current state? |
| Hidden proof | Which useful-but-secondary details are intentionally below/behind detail? |
| Long-list plan | How does the screen avoid rendering a large raw list by default? |
| Role vocabulary | Which internal words are forbidden for this role? |
| Disabled logic | What business reason is shown when an action is unavailable? |
| Responsive proof | Does the same hierarchy work in light, dark, laptop, and narrow layouts? |

If these answers are weak, do not add more controls. Recompose the screen first.

## Final Canonical Brainstorm: Useful Before Dense

This section is the read-first product decision for all three modules. The main acceptance condition is not that every backend feature appears somewhere on the page. The acceptance condition is that the correct user can finish the correct job without confusion, without reading internal implementation language, and without guessing which action is safe.

Composition is therefore product logic:
- A confusing screen can release the wrong email, contact the wrong audience, or make a buyer misunderstand invoice/reorder/checkout state.
- A complete API with a cluttered first viewport is still incomplete.
- A beautiful screen that hides the blocker, source of truth, or next safe action is still incomplete.

The shared rule is decision -> context -> proof:

| Layer | Purpose | Visible content | Forbidden content |
| --- | --- | --- | --- |
| Decision | Let the user understand the current state and next safe action. | Business state, critical counts, selected entity, blocker reason, one primary CTA. | Raw JSON, logs, provider payload, internal ids, history dump. |
| Context | Explain why this action is the right next action. | Preview, selected records, readable customer/order/template/audience detail. | Duplicate KPI cards, unrelated tabs, hidden primary blockers. |
| Proof | Let advanced users verify or debug. | Audit, revision diff, delivery evidence, source payload, provider trace. | Primary CTA, customer-facing claims, business decision controls. |

If a screen starts with proof, it is composed backwards.

### Three-Module Composition Map

| Module | User job | Main confusion to prevent | First viewport must show | Primary CTA rule | Hide or lower |
| --- | --- | --- | --- | --- | --- |
| Mail Template | Prepare and release customer-facing email safely. | Draft/test/approved/published/active states looking the same. | Selected event, active version, draft state, variable readiness, test proof, approval, provider mode, activation target. | One staged action: create draft, save draft, test, approve, publish, or activate. | Raw HTML/CSS, variable JSON, provider response, old revisions, audit trace. |
| Mail Marketing | Prove who will be contacted and whether delivery is real or proof-only. | Live preview, frozen snapshot, eligible, blocked, suppressed, and sent counts being confused. | Provider mode, live preview count, frozen snapshot count, blocked/suppressed count, final eligible count, approved template, readiness. | One pipeline action: preview, freeze, choose template, review blockers, queue proof, or send when enabled. | Raw flow JSON, webhook payload, per-recipient debug, provider event payload, analytics depth. |
| Customer Portal | Let buyer self-serve orders, invoices, reorder, carts, and documents. | Review request looking like checkout success, or placeholder invoice looking payable. | Recent orders, payable invoices, reorder-ready items, active cart/review state, latest shipment when relevant, next customer-safe action. | One contextual action: view order, reorder item, continue cart, pay/download invoice, or contact staff. | Staff notes, tenant/provider/workflow/source/routing fields, marketing internals, raw Shopify payload. |

### Module 1: Mail Template Composition Decision

Mail Template should feel like a protected release lane, not a code editor. The operator's first question is: "Will this change what customers receive, or am I still working on a draft?"

Required screen rhythm:
1. Template library groups by business event and readiness, not database rows.
2. Workspace opens with rendered customer preview, state strip, and release checklist.
3. Editor/source controls are visible but secondary to preview and release safety.
4. Test proof, approval proof, publish proof, and activation proof are separate states.
5. Publish/activate confirmation names the exact event binding that will change.

The screen is not ready if save draft, send test, approve, publish, and activate look like equal buttons. They are different consequences and must be visually staged.

### Module 2: Mail Marketing Composition Decision

Mail Marketing should feel like a recipient control room, not a pile of automation tables. The operator's first question is: "Exactly who will receive this, who is blocked, and is this real delivery or proof-only?"

Required screen rhythm:
1. Overview starts with decisions needing action, not decorative analytics.
2. Audience builder separates moving live preview from frozen operational snapshot.
3. Blocked, suppressed, unsubscribed, invalid, and frequency-capped recipients are never counted as reachable.
4. Campaign builder follows pipeline order: audience -> snapshot -> template -> blockers -> queue/send -> proof.
5. Flow builder uses business-language nodes first; raw webhook/provider details stay in proof or advanced settings.

The screen is not ready if a user can confuse "preview count" with "final send count", or "disabled proof" with "customer email sent".

### Module 3: Customer Portal Composition Decision

Customer Portal should feel like a buyer account desk, not internal admin. The buyer's first question is: "Where is my order, invoice, reorder option, cart, file, or next account action?"

Required screen rhythm:
1. Account home starts with action cards, not address book, staff history, or raw record lists.
2. Orders and invoices are search-first and paged; never render the whole account universe before the user asks.
3. Order detail starts with status, payment, fulfillment, tracking, line items, item properties, files, invoice state, and reorder eligibility.
4. Reorder separates full-order reorder, item-level reorder, persisted cart, checkout URL, and staff-review request.
5. Invoice list separates draft/hidden, payable, paid, overdue, void, missing-file, and contact-billing states.

The screen is not ready if the buyer sees staff terminology, raw Shopify payloads, internal routing, tenant/provider words, or a review request that looks like checkout success.

### Implementation Gate: Brainstorm Before Code

Before any UI work in these three modules, write a composition note with these answers:

| Field | Required answer |
| --- | --- |
| Screen | Exact route/component. |
| Role | Admin/operator/customer/customer user/subuser. |
| One job | The single job the screen exists to finish. |
| Confusion prevented | The expensive mistake this screen prevents. |
| First viewport | What must be visible before scroll. |
| Primary CTA | One state-derived safe action. |
| Secondary actions | Useful actions that stay visually quiet. |
| Hidden detail | Proof/history/log/raw payload/advanced controls. |
| Real data source | Endpoint/table/query behind every count and row. |
| Long-list plan | Paging/search/virtualization rule before rendering. |
| Empty/loading/error | Business-language states for all three. |
| Disabled reasons | Plain-language blocker for each unavailable action. |
| Forbidden vocabulary | Internal words this role must not see. |
| Theme/viewport proof | Light, dark, laptop, and narrow/mobile readability. |

If this note cannot be written without guessing, do not implement the screen yet. If an element makes the page denser but not clearer, move it lower, hide it behind detail, or remove it.

Backend parity is not enough. A screen is not production-ready while the user still has to guess:
- what is live;
- what is draft;
- what is only proof;
- what is blocked;
- what action will happen next;
- whether a count is moving preview data or a final operational list.

## Main Product Rule

Every screen must answer three questions in the first viewport:
- Where am I?
- What matters now?
- What is the next safe action?

If the answer requires raw JSON, internal ids, enum names, provider logs, Shopify implementation details, or staff explanation, the screen is not ready.

UIX is a release gate:
- No unbounded table dumps.
- No equal-weight button clusters for actions with different consequences.
- No internal terminology in customer-facing copy.
- Customer-facing copy must pass the rollout harness copy proof: no tenant, provider, workflow, queue, source, routing, axis, rule, suppression, staff-note, raw-payload, metadata, debug, campaign, audience, or flow vocabulary in the buyer decision layer.
- Customer-facing response contracts must pass the rollout harness contract proof: no `source*`, tenant/provider/workflow/routing/source internals, raw payload fields, staff-only notes, request ids, debug fields, secrets, or tokens in buyer-facing TypeScript surfaces.
- No raw payloads in the first decision layer.
- No modal that starts with history/debug data instead of the recommended action.
- No light-only, dark-only, or wide-screen-only implementation.

## Pre-Code Brainstorming: Composition Before Features

The main requirement is not "show everything." The main requirement is a calm, efficient decision surface where the user does not have to decode the system. These three modules carry high operational risk: a wrong template can go live, a wrong audience can be contacted, or a customer can misunderstand checkout/payment/reorder state. That means composition is part of product logic, not styling.

Before implementation, every screen in these modules must be designed from the user's next decision backward:

1. Identify the role and the one job.
2. Identify the most expensive confusion.
3. Put the decision state and one safe action in the first viewport.
4. Move explanation, history, logs, and raw proof below the decision layer.
5. Make every blocked or disabled state explain the business reason.
6. Verify that light mode, dark mode, laptop, and narrow widths preserve the same hierarchy.

Rejected composition patterns:
- Generic admin table first, action buttons later. This makes the user hunt for meaning.
- Tab dumping. Splitting data into many tabs without a shared mental model makes every tab feel like a different product.
- Equal-weight actions. "Save", "test", "publish", "activate", "send", and "delete" cannot look equally important.
- Raw proof first. Logs, JSON, provider payloads, Shopify payloads, and audit traces are necessary proof, but they must not be the first decision layer.
- Decorative KPI cards. A number that does not change the next action should not occupy first-viewport space.
- Side drawers for dense work. Detail-heavy order, invoice, template, campaign, proof, and customer views need centered modal or full-page treatment.

Chosen cross-module composition:
- One mental model per module.
- One primary decision per first viewport.
- One state-derived primary CTA.
- One consistent three-layer page structure: decision, context, proof.
- Long lists are search-first and paged before they become visible to real users.

### 2026-07-04 Brainstorm: Efficient No-Confusion Composition

This is the product-thinking pass that must be read before any new UI work in these three modules. The main constraint is not visual decoration. The main constraint is cognitive load: the user must not wonder what a screen is for, what a number means, which action is safe, or whether a state is live, draft, proof-only, payable, blocked, or customer-visible.

The composition target is:
- orderly enough that a first-time operator can explain the screen in one sentence;
- efficient enough that a repeat operator can finish the main job without hunting;
- restrained enough that proof, logs, history, raw payloads, and advanced details do not compete with the next safe action;
- explicit enough that dangerous states cannot be confused with safe states;
- responsive enough that laptop, narrow, light, and dark views preserve the same hierarchy.

Design from the mistake backward:
- Mail Template mistake: a draft or untested version accidentally becomes the live customer email.
- Mail Marketing mistake: the wrong customers receive a campaign, or proof-only delivery is mistaken for real delivery.
- Customer Portal mistake: a buyer misunderstands an invoice, reorder, cart, checkout, file, or review request state.

Every screen must therefore choose what it refuses to show first:
- Mail Template refuses to show raw source first.
- Mail Marketing refuses to show raw contacts or flow JSON first.
- Customer Portal refuses to show raw Shopify payload, staff internals, or unbounded history first.

#### Shared Screen Shape

All three modules use the same screen rhythm:

| Layer | User question | UI answer | Must not contain |
| --- | --- | --- | --- |
| 1. Decision | What is happening and what should I do now? | Selected entity, current business state, critical counts, one primary CTA, blocker reason. | Raw JSON, logs, history dump, internal ids, provider payload. |
| 2. Work context | Why is this the next action? | Preview, selected records, readable business detail, recipient/order/template/customer context. | Duplicated KPIs, generic tables, unrelated tabs. |
| 3. Proof | Can I verify or debug this? | Audit trail, delivery evidence, revision diff, provider trace, source/payload detail. | Primary CTA, customer-facing claims, hidden blockers. |

If a screen starts with layer 3, it is composed backwards.

#### Cross-Module Decision Table

| Module | User's first thought | Put in first viewport | Keep visually quiet | Hide until detail |
| --- | --- | --- | --- | --- |
| Mail Template | "Is this safe to release?" | Active version, draft state, variable readiness, test proof, approval, provider mode, release blocker. | Duplicate, compare, archive, proof links. | Raw HTML/CSS, variable JSON, provider response, old delivery trace. |
| Mail Marketing | "Who will receive this?" | Live preview, frozen snapshot, eligible count, blocked/suppressed count, approved template, delivery mode. | Contact drilldown, analytics, duplicate campaign, delivery evidence links. | Raw flow JSON, webhook payload, provider event payload, per-recipient debug. |
| Customer Portal | "Where is my order/invoice/reorder?" | Recent orders, payable invoices, reorder-ready items, active cart/review request, next customer-safe CTA. | Copy order number, download secondary files, contact staff, view history. | Staff notes, internal routing, campaign membership, raw Shopify payload. |

#### Module 1: Mail Template Composition Brainstorm

The page should feel like a protected release lane. The operator is not "editing HTML"; the operator is moving a customer-facing message through a controlled lifecycle.

Primary route shape:
1. Template library
2. Template workspace
3. Revision proof/compare
4. Test-send proof

Template library:
- First viewport groups templates by business event, not database row type.
- Each item answers: active version, draft exists, latest test proof, approval state, provider mode, used-by campaign or flow.
- Primary CTA is state-derived per item: create draft, continue draft, send test, approve, publish, or activate.
- Search filters are business filters: event, channel, status, owner, readiness.
- It must not open with a generic revision table.

Template workspace:
- Rendered customer preview is the visual center.
- Source/editor controls are adjacent, but lower visual priority than preview and readiness.
- Release checklist explains what blocks the next action: unresolved variables, no profile, no fresh test proof, not approved, not published, not active.
- Publish/activate confirmation must say exactly which customer-facing binding changes.
- The first screen must separate draft, approved, published, and active in both words and color.

Template detail/proof:
- Raw HTML, CSS, variable payload, provider response, delivery proof, and revision diff are proof areas.
- They are required for debugging, but they are not the decision surface.

Mail Template UIX acceptance before code:
- A non-engineer can tell whether the live customer email is changing.
- Save draft, send test, approve, publish, and activate do not look equal.
- Disabled CTAs name the missing business proof.
- Empty template state leads to "create draft", not a dead page.
- Error state names the failed step: load, preview, test proof, approval, publish, or activation.

#### Module 2: Mail Marketing Composition Brainstorm

The page should feel like a recipient control room. The operator is not "configuring automation"; the operator is proving who qualifies, who is blocked, which approved message is bound, and whether delivery is real or proof-only.

Primary route shape:
1. Marketing overview
2. Audience builder and frozen snapshot
3. Campaign builder
4. Flow builder
5. Delivery/proof analytics
6. Consent and suppression detail

Marketing overview:
- First viewport shows only numbers that affect action: provider mode, live audience needing review, frozen snapshots, blocked/suppressed recipients, approved-template gaps, failed/skipped delivery.
- It must not show decorative KPI cards that do not change the next action.
- Work queue comes before raw analytics: stale snapshot, no approved template, blocked recipients, provider disabled, failed proof, consent issue.

Audience and snapshot:
- Live preview and frozen snapshot must use different visual treatment.
- Live preview means "moving estimate"; frozen snapshot means "operational send list".
- Eligible and blocked counts are separate. Blocked people are never counted as reachable.
- Recipient list defaults to 10 rows and expands only by deliberate page-size control.
- Search/filter is server-backed for large customer/contact sets.

Campaign builder:
- Builder order is pipeline order: audience -> snapshot -> approved template -> blocker review -> schedule/queue -> proof.
- The active step owns the primary CTA.
- No send-like action is visible until frozen snapshot and approved template are both clear.
- Provider-disabled mode creates proof language only. It must not say or imply customers were contacted.

Flow builder:
- Nodes use business names first: send approved email, wait, split, update audience, create purchase follow-up, record webhook proof.
- Flow graph should not expose raw webhook URLs, secrets, provider JSON, or task internals in the canvas.
- Flow publish is blocked by invalid references, missing approved templates, missing destination, or unsafe side effects.

Mail Marketing UIX acceptance before code:
- The operator can tell live preview from frozen snapshot in five seconds.
- The operator can tell eligible from blocked recipients without reading logs.
- The operator sees exactly why sending/proof is blocked.
- Campaigns and flows share the recipient-control mental model instead of feeling like unrelated products.
- Empty and error states name the failed pipeline step: audience, snapshot, template, blockers, queue, delivery proof.

#### Module 3: Customer Portal Composition Brainstorm

The page should feel like a buyer account desk. The buyer is not debugging integrations; the buyer is trying to find an order, invoice, reorder option, cart, file, or next account action.

Primary route shape:
1. Account home
2. Orders
3. Order detail
4. Reorder
5. Cart/review request
6. Invoices
7. Documents/files

Account home:
- First viewport starts with action cards, not address book or raw history.
- Cards show recent order, open/payable invoice, reorder-ready item, active cart, review request, and latest shipment only when they create a next action.
- The primary CTA is contextual: view order, reorder item, pay invoice, continue cart, download invoice, or contact staff.

Orders and order detail:
- Lists are paged/searchable by default. Do not render full account history at once.
- Order detail starts with customer facts: status, payment, fulfillment, tracking, total, line items, item properties, design files, invoice state, reorder eligibility.
- Properties and addresses render as readable fields, not JSON.
- If detail is dense, use a centered modal or full page. Do not use a narrow side drawer for deep order/customer data.

Reorder and cart:
- Whole-order reorder and item-level reorder are distinct actions.
- Each unavailable item has a customer-safe blocker reason.
- A real checkout URL, a persisted cart, and a staff-review request must look different.
- Review request is not checkout success.

Invoices:
- Payable, paid, overdue, void, missing-file, and contact-billing states must look different.
- Download invoice and pay invoice are different actions.
- Placeholder/order-derived records must not look payable.
- Payment history is readable, scoped, and customer-safe.

Customer Portal UIX acceptance before code:
- The customer can find the next useful action without understanding staff workflow.
- Customer-facing UI never shows tenant, provider, workflow, rule, axis, source, suppression, staff notes, or raw Shopify JSON.
- Empty states explain what is missing and what the customer can do.
- Error states separate order load, invoice load, file download, cart creation, checkout creation, and review request creation.
- Dark mode, light mode, laptop width, and narrow widths keep totals, phone/order ids, CTAs, and disabled reasons readable.

#### Composition Worksheet Required Before Code

Before adding or refactoring a screen, write this worksheet in the implementation note, PR, or this document:

| Field | Required answer |
| --- | --- |
| Route/screen | Exact route or component surface being changed. |
| Role | Admin, operator, customer, customer user, or subuser. |
| One job | The single job this screen exists to complete. |
| Confusion prevented | The expensive mistake this composition prevents. |
| First viewport | What must be visible before scroll. |
| Primary CTA | The one state-derived safe action. |
| Secondary actions | Useful quiet actions that do not compete. |
| Hidden detail | Proof, history, logs, raw payloads, advanced fields. |
| Real data source | Endpoint/table/query for each visible count and row. |
| Disabled reasons | Business-language blockers for unavailable actions. |
| Empty/loading/error | What the user sees for all three states. |
| Forbidden words | Internal terms this role must not see. |
| Viewport proof | Light, dark, laptop, and narrow/mobile readability notes. |

If this worksheet cannot be filled without guessing, do not implement the screen yet.

### Brainstorm: Mail Template

User role:
- Admin/operator who can prepare, test, approve, publish, or activate customer-facing emails.

Core hesitation:
- "Am I editing a draft, or did I change what customers actually receive?"

Most dangerous confusion:
- Treating save, test, publish, and activation as the same kind of action.

Chosen first viewport:
- Business event/template family.
- Active customer-facing version.
- Draft state.
- Test proof state.
- Approval state.
- Provider mode.
- Variable readiness.
- One next release action.

Rejected first viewport:
- Template source editor first.
- Revision history first.
- Provider delivery trace first.
- A generic list of every template row without readiness.

Composition decision:
- Mail Template is a release lane. The preview and readiness checklist are the center of gravity. Raw HTML/CSS and provider proof are lower proof areas. The first action is never "publish" unless draft, variables, test proof, approval, and activation target are understandable.

### Brainstorm: Mail Marketing

User role:
- Admin/marketing operator who decides who receives a campaign or flow email.

Core hesitation:
- "Will this contact the right customers, and is this proof-only or real delivery?"

Most dangerous confusion:
- Mixing live moving audience counts with frozen send-list counts.

Chosen first viewport:
- Provider mode.
- Live audience preview count.
- Frozen snapshot count.
- Suppressed/blocked count.
- Final eligible count.
- Approved template binding.
- Current campaign/flow readiness.
- One pipeline action.

Rejected first viewport:
- Flow JSON/canvas first.
- Raw webhook configuration first.
- Per-recipient provider trace first.
- Contacts, audiences, campaigns, and flows as unrelated tables.

Composition decision:
- Mail Marketing is a recipient control room. The screen order is audience -> preview -> frozen snapshot -> approved template -> blockers -> queue/proof -> delivery evidence. The user must always know whether they are looking at a moving preview, a frozen operational list, or disabled-provider proof.

### Brainstorm: Customer Portal

User role:
- Customer, customer user, or subuser trying to self-serve without staff explanation.

Core hesitation:
- "Where is my order, invoice, reorder option, file, cart, payment, or review request?"

Most dangerous confusion:
- Mistaking a review request for a completed checkout or a placeholder invoice for a payable invoice.

Chosen first viewport:
- Account identity.
- Recent orders.
- Open/payable invoices.
- Reorder-ready items.
- Active cart or review request.
- Latest shipment/tracking when available.
- One customer-safe action.

Rejected first viewport:
- Address book as the default mental model.
- Raw Shopify payload.
- Internal staff routing, marketing membership, workflow/source fields.
- Thousands of order/customer records rendered before search/paging.

Composition decision:
- Customer Portal is a buyer account desk. The first screen is action-card first, then searchable lists. Order, invoice, reorder, and cart details open as centered modal or full page. Item properties, addresses, design files, and reorder blockers must be readable business objects, never raw payloads.

## Composition Brainstorming Record

This is the thinking pass that must happen before implementation. The problem is not "where do we put all transferred features?" The problem is "how do we make the correct next action obvious without hiding necessary proof?"

The real acceptance condition is orderly, usable, efficient UIX with no role confusion. The screen must not make the user decode the backend. A user should understand the page composition before they understand the feature list.

Brainstorming decision:
- These modules are not generic admin pages and must not feel like database explorers.
- Each module must have one dominant mental model, one first-viewport decision, one primary action, and one proof area.
- First viewport is for decision and safe action; lower sections are for explanation, history, and proof.
- If a capability does not help the current decision, it moves lower, behind detail, or into an advanced proof view.
- If a user can confuse two states, those states need different language, spacing, color, and action placement.
- If a list can grow large, search and paging are part of the feature, not polish.
- UI composition must be planned before route/component implementation. Feature completeness without a usable composition is not done.

The three modules must use different product compositions because their user confusion is different:

| Module | Real user hesitation | First viewport must resolve | Move lower or behind detail | Primary composition |
| --- | --- | --- | --- | --- |
| Mail Template | "Am I changing the live customer email or only a draft?" | Active version, draft version, test proof, approval, provider mode, next release action. | Raw HTML/CSS, revision diff, provider response, variable JSON, old delivery trace. | Release lane: status strip -> preview/editor -> readiness/action rail -> proof. |
| Mail Marketing | "Will the wrong customer receive this?" | Live preview, frozen snapshot, eligible count, blocked/suppressed count, selected template, provider mode. | Raw flow JSON, webhook payload, per-recipient debug trace, analytics depth. | Recipient control room: audience -> snapshot -> template -> blockers -> queue/proof. |
| Customer Portal | "Where is my order/invoice/reorder and what can I do now?" | Recent orders, open invoices, reorder-ready items, active cart/review state, next customer-safe action. | Raw Shopify payload, staff notes, internal routing, marketing membership, provider state. | Buyer account desk: next-action cards -> searchable lists -> full detail -> proof/history. |

No-confusion principle:
- Mail Template must make "draft", "published", and "active" visually and verbally different.
- Mail Marketing must make "live preview", "frozen snapshot", "eligible", and "blocked" visually and verbally different.
- Customer Portal must make "real checkout", "staff review request", "payable invoice", and "placeholder/unavailable state" visually and verbally different.

Composition must remove the user's most likely wrong assumption:
- Mail Template wrong assumption: "I saved this, so customers are receiving it."
- Mail Marketing wrong assumption: "This preview count is the final send list."
- Customer Portal wrong assumption: "This review request is a completed checkout or payable invoice."

If the UI allows any of those assumptions, the screen must be recomposed before adding more features.

This record must be updated before code when a new screen, tab, modal, bulk action, or customer-facing path is introduced.

### 2026-07-05 Brainstorm: Orderly, Efficient, No-Confusion UIX

This is the composition thinking that must happen before implementation in all three modules. The acceptance condition is not "the screen contains every transferred feature." The acceptance condition is that the screen is orderly, usable, efficient, and does not create user confusion.

The core product risk is cognitive overload:
- Mail Template can confuse draft work with live customer-facing mail.
- Mail Marketing can confuse audience preview with the final send list.
- Customer Portal can confuse review/account-request states with real checkout, invoice, or reorder success.

The UI must therefore be designed from the user's decision backward:
1. What does this user need to decide now?
2. Which state would be dangerous to misunderstand?
3. Which data must be visible to make the safe decision?
4. Which data is useful proof but would distract if shown first?
5. Which action is the safest next action in this exact state?

If a feature cannot answer those questions, it must not be placed in the first viewport.

#### Cross-Module Composition Decisions

Every screen in these three modules uses the same no-confusion shape:

| Area | Purpose | What belongs here | What does not belong here |
| --- | --- | --- | --- |
| Orientation | Tell the user where they are and what entity/state is selected. | Business name, event/template/campaign/order/invoice/cart identity, current lifecycle state. | Raw ids, enum-only states, provider payloads, tenant/internal routing. |
| Decision | Make the safe next action obvious. | One primary CTA, blocker reason, readiness state, consequence-labeled counts. | Equal-weight buttons, debug links, destructive actions, unrelated stats. |
| Work context | Explain why the action is correct. | Preview, selected records, readable line items, recipient/order/customer/template context. | Unbounded tables, duplicated KPIs, raw JSON, hidden blockers. |
| Proof | Let advanced users verify later. | Audit, revision diff, delivery evidence, source payload, provider trace. | Primary decision controls or customer-facing claims. |

The first viewport must never be a generic table. A table can be the work context, but the user needs orientation and decision state before a large list.

#### Role-Specific Vocabulary

The same backend state may need different language per role:

| Role | Allowed mental model | Forbidden primary vocabulary |
| --- | --- | --- |
| Admin/operator editing templates | release lane, active email, draft, test proof, approval, publish, activate | raw revision id, tenant id, provider payload, template JSON |
| Admin/marketing operator | recipient control room, live preview, frozen send list, blocked, eligible, proof-only, sent | raw flow JSON, webhook payload, provider trace, queue enum |
| Customer/customer user/subuser | account desk, order, invoice, payment, reorder, cart, review request, file, tracking | workflow, rule, source, axis, staff note, provider, Shopify payload |

Internal words are allowed in logs and proof, not in the decision layer.

#### Mail Template Composition Brainstorm

Mail Template is a release-safety workspace. The operator must instantly know whether they are changing only a draft or changing what customers receive.

Preferred composition:
- Header: selected business event/template family, active version, draft version, provider mode.
- Decision strip: readiness blockers in order: variables, render preview, test proof, approval, publish state, activation target.
- Primary work surface: rendered customer preview first; editor/source second.
- Action rail: one action based on lifecycle state only.
- Proof section: revision history, raw source, variable payload, delivery/provider proof.

The route should not feel like a code editor first. Raw HTML/CSS is important, but the operator's job is release safety. If the source editor dominates the screen before active/draft/readiness are understandable, the composition is wrong.

Dangerous confusions to prevent:
- Save draft is not publish.
- Send test is not approval.
- Publish is not necessarily activation.
- Active binding is not the same as latest revision.
- Provider-disabled proof is not a customer email sent.

Efficient layout rules:
- Show one template/event decision at a time.
- Group templates by business event and readiness, not by database row type.
- Show missing variable/render/test blockers before publish controls.
- Put compare/archive/history lower than the release action.
- Critical transactional templates need stronger visual warning before active binding changes.

#### Mail Marketing Composition Brainstorm

Mail Marketing is a recipient-control workspace. The operator must instantly know who will be contacted, why they qualify, who is blocked, and whether delivery is real or proof-only.

Preferred composition:
- Header: provider mode, marketing enabled/disabled state, selected campaign/flow/audience.
- Decision strip: live preview count, frozen snapshot count, blocked/suppressed count, final eligible count, selected approved template.
- Primary work surface: pipeline stepper, not a form dump.
- Action rail: one action for the current pipeline step.
- Proof section: recipient trace, delivery evidence, provider response, raw flow/webhook payloads.

The route should not feel like unrelated tabs for contacts, audiences, campaigns, flows, analytics, and settings. Those are different capabilities, but the operator's mental model is one pipeline: choose audience, freeze list, choose approved template, review blockers, queue/send/prove delivery.

Dangerous confusions to prevent:
- Live preview is not the frozen send list.
- Frozen total is not final eligible total.
- Blocked/suppressed people are not reachable.
- Proof-only delivery is not a sent customer email.
- Flow configuration is not runtime delivery proof.

Efficient layout rules:
- Counts must be labeled by consequence: live, frozen, blocked, eligible, sent, skipped, proof-only.
- Campaign builder follows one path: audience -> snapshot -> template -> blockers -> schedule/queue -> proof.
- Recipient lists default to 10 and expand only by deliberate user choice.
- Search/filter must be server-backed for large customer/contact sets.
- Analytics and provider traces stay below the send-safety decision.

#### Customer Portal Composition Brainstorm

Customer Portal is a buyer account desk. The customer must instantly know what they can do now: view an order, reorder an item, continue a cart, pay/download an invoice, download a file, or contact staff.

Preferred composition:
- Header: customer/account identity and current account state.
- Decision cards: recent orders, open/payable invoices, reorder-ready items, active cart/review request, latest shipment/tracking.
- Primary work surface: searchable/paged orders, invoices, reorder items, and carts.
- Action rail: contextual customer-safe action only.
- Proof/detail section: full order timeline, readable item properties, files, invoice activity, cart/review outcome history.

The portal must not feel like admin order management. A buyer does not need to understand Shopify payloads, tenant routing, provider state, staff notes, workflow terms, or marketing membership. They need clear account action.

Dangerous confusions to prevent:
- Account review request is not checkout success.
- Draft/placeholder invoice is not payable.
- Missing Shopify linkage is not "no order exists" unless verified.
- Reorderable item and unavailable item need different state and reason.
- Raw address, item property, or design-file payload is not customer-readable detail.

Efficient layout rules:
- Account home starts with next-action cards, not address book or unbounded history.
- Order/invoice lists default to 10 rows and expand to 50/100/150 only by user choice.
- Search runs before rendering large account/customer universes.
- Order detail opens centered or full page, not a narrow drawer.
- Item properties, addresses, design files, and invoice/payment states render as business objects.

#### No-Confusion Acceptance Before Code

Before implementing or accepting any screen, the implementer must write the answers below. If the answers are not clear, code must wait.

| Question | Required answer |
| --- | --- |
| What one job does the screen finish? | A single business job, not a module list. |
| What is the most expensive confusion? | The wrong assumption the UI must prevent. |
| What is visible before scroll? | Only orientation, decision, and required context. |
| What is the one primary action? | A state-derived action, not a button cluster. |
| What are the consequence labels? | Live/frozen/blocked/eligible, draft/active, payable/review/unavailable. |
| What proof is lower or hidden? | Logs, raw payload, provider trace, revision diff, history. |
| What is the long-list plan? | Search, paging, virtualization, grouping, and default page size. |
| What role vocabulary is forbidden? | Internal words that would confuse this user. |
| What happens in empty/loading/error? | Business-language states, not blank cards or technical errors. |
| What must be checked visually? | Light, dark, laptop, narrow/mobile, readable contrast and spacing. |

This is a hard gate. A backend-complete feature with a confusing composition is not production-ready.

### First-Viewport Blueprints

Mail Template first viewport:
- Top line: selected business event/template family, active version, draft version, provider mode.
- Decision strip: tested/not tested, approved/not approved, publish readiness, activation target.
- Main area: rendered customer preview is primary; edit controls are adjacent but not visually louder than preview.
- Action rail: one state-derived CTA only. Examples: create draft, save draft, send test, request approval, approve, publish, activate.
- Quiet secondary actions: duplicate, compare revision, archive, open variables, open proof.
- Below first viewport: revision history, raw source, variable payload, delivery/provider proof.

Mail Marketing first viewport:
- Top line: provider mode, campaign/flow state, live audience count, frozen snapshot count, blocked/suppressed count, final eligible count.
- Decision strip: selected approved template, recipient readiness, consent/suppression readiness, delivery mode.
- Main area: pipeline stepper. The active step owns the page: audience, snapshot, template, blockers, queue/proof, delivery evidence.
- Action rail: one state-derived CTA only. Examples: preview audience, freeze snapshot, choose template, review blockers, queue disabled proof, send when enabled.
- Quiet secondary actions: open contacts, inspect exclusions, duplicate campaign, open delivery evidence.
- Below first viewport: per-recipient trace, raw flow config, webhook payload, provider event payload, analytics drilldown.

Customer Portal first viewport:
- Top line: account identity, open invoice state, recent order state, active cart/review state.
- Decision strip: reorder-ready items, unpaid/payable invoices, latest shipment/tracking, any staff-review outcome.
- Main area: next-action cards first, then searchable/paged order, invoice, and reorder lists.
- Action rail: context CTA only. Examples: view order, reorder item, reorder full order, download invoice, pay invoice, continue cart, open review request.
- Quiet secondary actions: download file, copy order number, contact staff, view history.
- Below first viewport: full order timeline, invoice activity, cart outcome history, document/file proof.

### Efficiency Guardrails

- Default page size for long lists is 10. User may intentionally expand to 50, 100, or 150.
- Search must be server-backed or indexed for large surfaces; filtering 6,000 records after rendering is not acceptable.
- Primary actions stay in a predictable place. They must not move between header, row, modal footer, and dropdown for the same state.
- Repeated data is allowed only as summary plus drill-down. Repeating the same number in three panels with different labels is a bug.
- Empty states must create momentum: explain what is missing and show the first valid action.
- Error states must name the failed business step: preview, snapshot, template readiness, queue, order load, invoice load, cart creation, checkout creation, or file download.
- Modals start with the action summary. History, raw proof, and debug data are lower sections.

## Brainstorm Before Implementation

Before adding or refactoring any screen in these modules, write the screen composition first. This is not decoration work. It is product logic. A confusing screen can cause the same operational damage as a wrong query: the wrong template can go live, the wrong audience can receive a campaign, or a customer can mistake a review request for checkout success.

For every screen, answer this worksheet before code:

| Required answer | Meaning |
| --- | --- |
| Role | Admin, operator, customer, customer user, or subuser. |
| Job | The one business job this screen exists to finish. |
| Confusion risk | The mistake this screen must prevent. |
| First viewport | What must be visible without scrolling. |
| Primary CTA | The one safest next action for the current state. |
| Secondary actions | Useful actions that stay visually quiet. |
| Hidden detail | Proof, logs, raw payloads, history, or advanced state. |
| Real data source | Endpoint/table for every visible count and row. |
| Disabled reason | Business-language blocker for every unavailable action. |
| Empty state | What the user sees when no data exists. |
| Loading state | What stays visible while data loads. |
| Error state | Which business step failed and what can be retried. |
| Forbidden vocabulary | Internal words this role must not see. |
| Viewport proof | Light, dark, laptop, and narrow/mobile readability. |

If these answers are not clear enough to explain in plain language, implementation should pause.

## Route-Level Composition Brainstorm

This is the practical route map before UI work starts. The three modules must not grow by adding cards, tabs, buttons, and modals wherever the backend has data. They grow by composing a calm route for one user decision at a time.

The route-level rule:
1. The route title names the business job, not the table.
2. The first viewport answers the user's next decision.
3. One action is visually dominant; other actions stay quiet.
4. The row/card content is readable at work speed.
5. Detail exists, but opens only after the main decision is understood.
6. Search, paging, and empty/error states are part of the route, not polish.

### Mail Template Route Brainstorm

Mail Template routes must feel like a release system. The operator is not browsing templates for curiosity; they are deciding whether a customer-facing message can safely move forward.

| Route | User job | First viewport composition | Primary action | Hidden/lower detail | Confusion prevented |
| --- | --- | --- | --- | --- | --- |
| Template library | Find which event/template needs work. | Event groups, active version, draft state, approval/test readiness, provider mode, last changed. | Continue the next required step for the selected template. | Revision payload, provider trace, old delivery rows. | A template row looking complete when it has no tested/approved/active version. |
| Template workspace | Edit and preview without accidentally changing live mail. | Active version vs draft, rendered preview, readiness checklist, variable blockers, provider mode. | State-derived CTA: save draft, test, approve, publish, or activate. | Raw HTML/CSS, variable JSON, diff/audit. | Save draft looking like live activation. |
| Preview/test proof | Prove the draft renders and delivery behavior is understood. | Preview profile, rendered output, missing variables, test recipient/proof-only state. | Send test or record proof only, depending on provider mode. | Provider response, delivery internals. | Test proof looking like approval or real customer delivery in disabled mode. |
| Publish/activation review | Make the active binding change explicit. | What event binding changes, old active version, new version, approval state, rollback path. | Activate approved version. | Full revision history and audit diff. | Publish and activate being treated as the same consequence. |

Template UI composition must keep the preview closer to the primary action than raw source. Source editing is a tool; release safety is the job.

### Mail Marketing Route Brainstorm

Mail Marketing routes must feel like a recipient decision system. The operator is not managing abstract automation; they are deciding who can be contacted, who is blocked, and whether communication is real or proof-only.

| Route | User job | First viewport composition | Primary action | Hidden/lower detail | Confusion prevented |
| --- | --- | --- | --- | --- | --- |
| Marketing overview | See which communication work needs a decision. | Provider mode, campaigns needing action, stale snapshots, blocked recipients, proof-only/sent delivery split. | Open the next blocked or ready item. | Analytics depth, provider event stream. | Proof-only evidence looking like live customer contact. |
| Audience builder | Define and verify who qualifies. | Business criteria, live preview count, exclusion count, sample recipients, consent/suppression status. | Preview or freeze snapshot. | Raw query JSON, per-recipient trace. | Moving preview count looking like the final send list. |
| Campaign builder | Prepare a safe send list and message. | Frozen snapshot, final eligible count, blocked/suppressed count, approved template, delivery mode. | Queue proof/send only when blockers are understood. | Historical delivery rows, provider payload. | Blocked recipients counted as reachable. |
| Flow workspace | Validate runtime behavior before publish. | Trigger, current version, validation state, simulation proof, blocked actions, provider mode. | Validate, simulate, publish, or pause based on state. | Raw flow JSON, webhook body, worker/action logs. | Flow graph looking safe without validation/simulation proof. |
| Delivery evidence | Review what actually happened. | Sent/proof-only/skipped/failed counts, recipient status, retry/DLQ action when needed. | Retry, suppress, or inspect only the relevant failure. | Full provider event payload and raw logs. | A delivery issue being hidden behind analytics. |

Marketing UI composition must never show contacts, audiences, campaigns, flows, and analytics as unrelated equal tabs without a pipeline explanation. The mental order is audience -> snapshot -> template -> blockers -> queue/proof -> delivery evidence.

### Customer Portal Route Brainstorm

Customer Portal routes must feel like a buyer account desk. The customer is not debugging Shopify data or staff workflow; they are trying to complete a safe account action.

| Route | User job | First viewport composition | Primary action | Hidden/lower detail | Confusion prevented |
| --- | --- | --- | --- | --- | --- |
| Account home | Understand what can be done now. | Recent orders, open invoices, reorder-ready items, active cart/review request, latest shipment context. | Continue the most relevant customer-safe action. | Full timelines, file/audit proof. | Customer landing on a generic address/profile page with no next action. |
| Orders list | Find an order quickly. | Search, page size, status filters, recent orders, order number/date/total/status/tracking. | Open order detail. | Raw Shopify payload and internal ids. | Rendering thousands of records or making old orders hard to find. |
| Order detail | Understand the order and reorder eligibility. | Status, total, fulfillment/tracking, line items, item properties, files/proofs, reorder eligibility per item. | Reorder eligible item/order or explain blocker. | Raw fulfillments/refunds/properties payload. | Item-level reorder appearing possible when variant/linkage is missing. |
| Reorder/cart | Continue buying without fake success. | Eligible items, unavailable reasons, cart state, checkout-ready vs account-review state. | Create checkout only when confirmed; otherwise save review request. | Cart mutation audit and internal resolver detail. | Account review request looking like checkout success. |
| Invoices | Pay/download only real invoice records. | Payable/paid/overdue/unavailable state, recipient, amount, due date, download/payment availability. | Pay or download when real and configured. | Internal invoice generation proof. | Placeholder invoice looking payable. |
| Documents/files | Find usable account/order files. | File name, related order/item, type, status, customer-safe action. | Download/open allowed file. | Storage/provider/debug payload. | Internal file payload being shown as customer content. |

Customer Portal composition must never expose staff notes, provider state, tenant/source/routing terms, raw Shopify JSON, or marketing membership. If the customer cannot act on it, it does not belong in the first decision layer.

### Composition Guardrails for All Three Modules

These guardrails are mandatory when a route is designed or refactored:
- Do not add a KPI card unless it changes a user decision.
- Do not add a table until the route has orientation, state, and primary action.
- Do not add a modal that starts with history, raw data, or debug proof.
- Do not place two consequences behind the same visual style. Draft/live, preview/frozen, payable/review, sent/proof-only, and reorderable/unavailable must look different.
- Do not show a disabled button without the business reason beside it or inside the button help text.
- Do not expose a large list without search and a default page size of 10.
- Do not let admin/operator wording leak into customer-facing copy.
- Do not let customer-facing wording hide operational proof from admins; proof exists lower, not first.
- Do not accept a light-mode-only, dark-mode-only, or wide-screen-only composition.

The implementation question is always: does this make the correct action faster and the wrong assumption harder? If not, recompose before coding.

## Module Screen Commitments

These are the concrete composition decisions for the first implementation pass. They are written before code on purpose: backend parity must serve a usable screen, not force the user to understand backend structure.

### Mail Template

Mental model: "I am preparing a customer-facing message and deciding whether it is safe to make live."

Screens:
- Template library
- Template workspace
- Revision compare/proof
- Send test result

Template library composition:
- First viewport shows template families grouped by business event, not by database type.
- Each row/card shows active version, draft existence, last test, approval state, and whether it is used by a campaign/flow.
- Search and filters are for event, channel, status, owner, and readiness.
- Primary CTA is state-based: create template, continue draft, send test, request approval, or publish.
- Hidden detail: raw HTML, CSS, variable JSON, provider response, old revision payloads.

Template workspace composition:
- Customer preview is visually primary.
- Editor and variables are important but secondary; they cannot dominate the preview.
- "Draft", "approved", "published", and "active" must use different language and color.
- Publish action must show exactly what changes for customers before it can run.
- Preview must include empty and error states for missing variables, image failures, and invalid markup.

Forbidden in first decision layer:
- raw ids, JSON, provider payload, enum labels, "revisionId", "activeVersionId", "tenantId".

### Mail Marketing

Mental model: "I am deciding who will receive a message and proving no wrong customer will receive it."

Screens:
- Marketing overview
- Campaign builder
- Audience/snapshot workspace
- Flow builder
- Webhook destination settings
- Delivery/proof analytics

Marketing overview composition:
- First viewport shows provider mode, send-disabled/sending state, pending campaigns, frozen snapshots, blocked recipients, and recent proof.
- It must not mix preview counts with final eligible counts in the same visual weight.
- Primary CTA is the safest next incomplete step: build audience, freeze snapshot, choose template, review blockers, or queue disabled proof.

Campaign builder composition:
- The builder is a pipeline, not a form dump.
- Step order is audience -> frozen snapshot -> approved template -> blockers -> schedule/queue -> proof.
- Each step owns one visible action.
- A campaign cannot show a send-like action until the snapshot and template are both ready.
- Disabled send states must explain the business blocker, not the technical enum.

Audience/snapshot composition:
- Live audience preview and frozen snapshot are separate sections with different styling.
- Long recipient lists default to 10 rows with 50/100/150 deliberate expansion.
- Search must be server-backed for large customer sets.
- Exclusions and suppressions are first-class proof, not hidden debug.

Flow builder composition:
- Canvas nodes are business actions first: send approved email, wait, split, update audience, create follow-up task, record webhook proof.
- Webhook nodes can only choose a saved destination by name/slug. They cannot expose raw URL fields inside the flow graph.
- Follow-up task nodes must say "purchase follow-up" or "account follow-up"; automatic support case language is forbidden.
- Side-effect proof appears in a lower proof panel, not in the first decision layer.

Webhook destination settings composition:
- It is an advanced settings area, not a campaign step.
- First viewport shows destination name, slug, status, auth type, secret-present state, and last update.
- Raw secret is never displayed.
- Raw URL is allowed only in edit/detail context for admin users; it must not appear in flow cards or worker logs.

Forbidden in first decision layer:
- `workflow`, `webhook raw url`, `secret`, `authorization`, `tenantId`, provider debug JSON, "queued_disabled" without a business explanation.

### Customer Portal

Mental model: "I am a customer checking orders, invoices, files, and reorder options without calling staff."

Screens:
- Account home
- Order list
- Order detail
- Reorder flow
- Invoice list/detail
- File/download proof
- Review/request outcome

Account home composition:
- First viewport shows recent orders, payable invoices, reorder-ready items, open review/request state, and latest shipment/tracking.
- The primary CTA is contextual: reorder item, pay invoice, view order, continue cart, download invoice, or contact staff.
- Staff-only concepts must not appear.
- Customer must never see tenant internals, routing, staff assignment, marketing membership, or provider logs.

Order list/detail composition:
- Lists are paged/searchable and default to 10 rows.
- Order detail starts with status, paid/fulfillment state, tracking, invoice, and reorder-ready line items.
- Product-property line items must remain understandable: what was bought, what options/properties belong to that item, and what can be reordered.
- Raw Shopify payload moves to admin proof only, not customer portal.

Reorder composition:
- Item-level reorder and full-order reorder are different actions.
- If an item cannot be reordered, the blocker is visible in customer language.
- Checkout creation is the finish line; draft/review request is a different state and must look different.
- Staff review request cannot be visually confused with a successful checkout.

Invoice composition:
- Invoice list shows payable, paid, overdue, and unavailable states separately.
- Download/send/pay actions are tied to real records only.
- Emailing an invoice must show the recipient and result proof.

Forbidden in customer-facing layer:
- `Shopify gid`, raw JSON, staff note, internal source, axis, rule, flow, tenant, provider, debug, mock, placeholder-as-success.

## Cross-Module Review Checklist

Before a task in any of the three modules is marked production-ready:
- The first viewport answers where the user is, what matters now, and the next safe action.
- The primary CTA is state-derived and singular.
- Empty, loading, and error states are written in business language.
- Long lists have paging and server-backed search before they are exposed to real users.
- Raw proof exists, but it is below the decision layer or behind detail.
- Light, dark, laptop, and narrow viewport readability are checked.
- No screen relies on mock/static data to look complete.
- No customer-facing screen exposes internal vocabulary.

## Shared Composition Law

Use one mental model per module:

| Module | Mental model | Human job |
| --- | --- | --- |
| Mail Template | Protected release lane | Change customer-facing email safely without accidentally changing the live email. |
| Mail Marketing | Recipient control room | Decide who will be contacted, why they qualify, who is blocked, and whether delivery is real or proof-only. |
| Customer Portal | Buyer account desk | Let the customer find orders, invoices, reorder options, carts, and account documents quickly. |

Use the same three-layer hierarchy everywhere:

| Layer | Purpose | Content |
| --- | --- | --- |
| 1. Decision | Orient and act | Entity, business state, critical counts, one primary CTA, blocker reason. |
| 2. Context | Explain the decision | Business summary, preview, selected records, readable order/template/campaign/customer detail. |
| 3. Proof | Verify and debug | Audit, logs, raw payloads, revision diff, provider trace, delivery/order history. |

Never place proof before decision. Proof is required, but it is not the first visual layer.

## Cross-Module Confusion Model

| Module | User anxiety | UI must show first | UI must hide until requested |
| --- | --- | --- | --- |
| Mail Template | "Will I accidentally change a live customer email?" | Active version, draft version, variable readiness, preview/test proof, approval state, publish/activation blocker. | Raw HTML, CSS, variable JSON, provider trace, revision diff, delivery internals. |
| Mail Marketing | "Will the wrong people receive this email?" | Live audience, frozen snapshot, blocked/suppressed recipients, final eligible count, approved template, delivery mode. | Flow JSON, webhook payloads, provider event payloads, per-recipient debug trace, attribution depth. |
| Customer Portal | "Where is my order, invoice, reorder, cart, or file?" | Recent orders, open invoices, reorderable items, active cart/review request, readable next action. | Internal routing, staff notes, raw Shopify payloads, campaign membership, provider state. |

If an element does not reduce the module's main anxiety, it belongs lower on the page or behind detail.

## Screen Composition Algorithm

Compose every screen in this order:

1. Orient: title, selected entity, role-safe state sentence.
2. Prioritize: only the counts that change the next action.
3. Decide: the context needed for the next safe decision.
4. Act: one dominant state-derived CTA.
5. Support: quiet secondary actions.
6. Prove: audit, logs, history, source, payload, trace.
7. Recover: empty, loading, error, disabled, and long-list states.

Any screen that starts with proof, history, raw data, or a generic table is composed backwards.

## Module 1: Mail Template

### Screen Goal

This module exists so an admin/operator can safely move a customer-facing email from draft to tested, approved, published, and active state.

### Mental Model

Mail Template is a protected release lane, not a code editor and not a generic template table. The operator's fear is accidental release. The screen must constantly show whether the operator is working on draft-only state or changing the active customer-facing binding.

### First Viewport

The first viewport must show:
- selected business event or template family;
- active customer-facing version;
- current draft version, if any;
- variable readiness;
- rendered preview/test proof;
- approval state;
- publish/activation readiness;
- provider mode;
- exactly one staged CTA.

The user should know in five seconds whether live customer email is changing or only a draft is changing.

### Recommended Composition

| Area | Content |
| --- | --- |
| Header/status strip | Template/event name, category, active version, draft state, test state, approval state, provider mode. |
| Primary work area | Rendered customer preview first, editable draft/source controls second. |
| Release checklist | Missing variables, preview profile, test proof, approval, publish readiness, activation target. |
| Proof/details | Revision history, approval history, delivery proof, raw HTML/CSS, variable payload, provider trace. |

The rendered preview must be closer to the primary action than raw source. Raw source is important, but it is not the first thing a non-engineer should read.

### Primary CTA State Machine

Actions must be staged. Do not show these as equal buttons:

1. Create draft
2. Save draft
3. Preview/test
4. Approve
5. Publish
6. Activate binding

Disabled buttons must explain the business reason:
- "Select a preview profile before testing."
- "Unresolved variables block publish."
- "Approval is required before activation."
- "Provider is disabled; this will create delivery proof only."

### Empty, Loading, Error

Empty:
- "No template exists for this event yet."
- Primary CTA: create draft.

Loading:
- keep the selected event visible;
- show skeleton status/preview, not a blank screen.

Error:
- explain whether the failure is template load, preview render, test-send proof, approval, publish, or activation;
- keep existing local draft state visible when possible.

### Do Not

- Do not let "save draft" look like "customer email changed".
- Do not let a test send look like approval.
- Do not publish or activate without a visible binding-change summary.
- Do not put raw HTML as the first screen.
- Do not call disabled-provider proof a sent email.

## Module 2: Mail Marketing

### Screen Goal

This module exists so an admin/marketing operator can prove who will be contacted, why they qualify, who is blocked, which approved template is used, and whether delivery is real or proof-only.

### Mental Model

Mail Marketing is a recipient control room, not unrelated tabs for contacts, audiences, campaigns, flows, analytics, and settings. The operator's fear is contacting the wrong people or believing proof-only evidence is real delivery.

### First Viewport

The first viewport must show:
- provider mode and delivery safety;
- live audience estimate;
- frozen snapshot count;
- blocked/suppressed count;
- final eligible recipient count;
- selected approved template;
- campaign or flow readiness;
- exactly one next pipeline action.

The user should never wonder whether a count is a moving preview or the final send list.

### Recommended Composition

Use a pipeline composition:

1. Define audience
2. Preview live matches
3. Freeze snapshot
4. Choose approved template
5. Review blockers
6. Queue/send or record disabled proof
7. Monitor delivery evidence

Tabs can exist, but each tab must preserve the same mental model:
- Contacts: identities, consent, suppression, membership.
- Audiences: business criteria, live preview, snapshot history.
- Campaigns: staged send pipeline.
- Flows: published automation state and safe runtime proof.
- Delivery/analytics: evidence and learning, not the first decision source.

### Audience Builder Language

Audience criteria must be business-readable:
- Shopify segment;
- product, SKU, family, or category purchased;
- order count;
- revenue;
- last order date;
- lifecycle;
- customer owner/member;
- consent state;
- suppression state;
- tag/segment membership.

Do not force operators to understand raw query JSON before they know who is selected.

### Campaign Action Rules

Queue/send cannot be the main action until these are understandable:
- audience exists;
- live preview was checked;
- frozen snapshot exists;
- approved template is selected;
- suppressed and blocked recipients are counted separately;
- provider mode is visible;
- final eligible count is visible.

Disabled reasons must be specific:
- "Freeze the audience snapshot first."
- "Choose an approved template first."
- "12 recipients are suppressed and will be skipped."
- "Provider is disabled; queue will create proof only."

### Work Queue

The first operational list should contain decisions needing action:
- stale snapshot;
- campaign waiting approval;
- no approved template;
- suppressed/blocked recipients;
- provider disabled proof waiting review;
- failed/skipped delivery;
- consent problem.

Raw delivery/provider data belongs behind detail.

### Empty, Loading, Error

Empty campaign:
- explain the first valid step: create audience or choose an existing audience.

Empty audience preview:
- explain whether no customers match or the criteria are invalid/incomplete.

Loading:
- show which step is loading: preview, snapshot, blockers, templates, or delivery proof.

Error:
- show whether the failed step is audience query, snapshot freeze, template eligibility, queue/send, or delivery evidence.

### Do Not

- Do not count blocked recipients as reachable.
- Do not make disabled proof look like customer delivery.
- Do not mix flow JSON with campaign send readiness.
- Do not make contacts, audiences, campaigns, and flows feel like unrelated tables.
- Do not bury consent/suppression in logs.

## Module 3: Customer Portal

### Screen Goal

This module exists so a buyer can self-serve orders, invoices, reorder actions, carts, and documents without seeing internal operations.

### Mental Model

Customer Portal is a buyer account desk, not internal order administration. The customer's fear is not knowing where their order, invoice, reorder option, cart, or file is. The portal must show the next useful customer action before it shows history.

### First Viewport

The first viewport must show:
- recent orders;
- open or payable invoices;
- reorder-ready items;
- active cart or review request;
- account status only when it changes customer action;
- exactly one customer-safe CTA for the current context.

The customer should know what they can do next without understanding staff workflows.

### Recommended Composition

Customer home:
- action cards first;
- recent orders;
- open invoices;
- reorder-ready items;
- active cart or review request;
- customer-safe status messages.

Orders:
- search-first list;
- page-size control;
- status, date, total, tracking, item count;
- detail opens centered or as a full page, not as a narrow side drawer.

Order detail:
- status;
- total;
- tracking;
- line items;
- item properties rendered as readable fields;
- design files/proofs when allowed;
- invoice/payment state;
- reorder eligibility per item.

Reorder:
- reorder full order;
- reorder one eligible item;
- explain unavailable items;
- create persisted cart;
- return checkout URL only when confirmed;
- create staff-review request when checkout cannot be safely created.

Invoices:
- payable vs not payable must be visually distinct;
- invoice download and payment action are separate;
- payment history and activity are customer-readable.

### Customer Detail Rules

Readable detail beats raw completeness:
- Addresses render as address blocks, not JSON.
- Item properties render as name/value rows, not raw arrays.
- Design files show file name, type, and action, not internal payload.
- Missing linkage explains what is missing and what the customer can do.

### Empty, Loading, Error

Empty order list:
- "No orders found for this account."
- suggest search reset or staff contact.

Empty reorder:
- "No reorderable items are available."
- show why: discontinued, missing variant, custom review required, unavailable checkout, or not linked.

Empty invoice:
- "No invoices are available."
- do not create pseudo payable invoices from order totals.

Loading:
- preserve account context and show which list is loading.

Error:
- separate order load, invoice load, cart creation, checkout creation, and file download errors.

### Do Not

- Do not show staff notes.
- Do not show raw Shopify JSON.
- Do not show workflow/routing/source fields.
- Do not make review requests look like paid orders.
- Do not make placeholder invoices look payable.
- Do not render thousands of records without search, paging, or virtualization.

## Cross-Module Information Architecture

Use these rules before adding any new tab, modal, card, or button:

- One screen has one job. Editing an email, approving a campaign, and debugging delivery are separate decisions.
- The first viewport is a decision surface, not a report.
- Status cards must not be decorative. Every card either changes a decision or it should be removed.
- The same action cannot appear in multiple places with different labels.
- Long customer, order, invoice, recipient, template, delivery, and campaign lists need search and paging.
- Default long-list page size is 10. Let the user choose 50, 100, or 150 only when they intentionally expand.
- Dense detail opens as a centered modal or full page. Do not use narrow side drawers for order detail, customer detail, template proof, invoice detail, or campaign proof.
- Empty rows and filler columns are UIX bugs.

## Action Hierarchy

Every module must use the same action hierarchy:

| Level | Meaning | Examples |
| --- | --- | --- |
| Primary | The one safest next step | Test draft, freeze snapshot, pay invoice, reorder item |
| Secondary | Useful but not blocking | Duplicate, compare, download, open history |
| Destructive | Requires clear consequence | Cancel campaign, archive draft, discard failed delivery |
| Proof | Shows evidence only | View payload, view audit, view delivery trace |

Never render proof actions as primary actions. Never make destructive actions visually equal to safe actions.

## Modal Rules

Modals must start with action and meaning:
- Header: entity name and current business state.
- First block: what to do now.
- Second block: why this action is recommended.
- Third block: customer/order/template/campaign context.
- Lower blocks: history, audit, raw proof, long transcripts, logs.

Do not open a modal with:
- raw JSON;
- provider payload;
- workflow/source/rule text;
- repeated generic summaries;
- empty right-side panels;
- tiny text that requires zoom.

## Visual Density Rules

These screens are operational tools, so they should be dense but readable:
- Use 13-15px body text for operational rows.
- Use normal font weight for body copy.
- Reserve bold for names, totals, current state, and required action.
- Use color to separate consequence: blocked, ready, proof-only, payable, review-required, unavailable.
- Every colored state must also have text, not color-only meaning.
- Dark mode must not invert into low-contrast white boxes inside dark cards.
- Light mode must not wash out phone numbers, totals, order ids, or disabled reasons.

## Terminology Rules

Admin/operator UI may use:
- active version;
- draft;
- approved;
- published;
- provider disabled;
- delivery proof;
- suppression;
- snapshot;
- eligible recipients.

Customer UI may use:
- order;
- invoice;
- payment;
- reorder;
- cart;
- review request;
- tracking;
- design files;
- account documents.

Customer UI must never show:
- tenant;
- provider;
- queue;
- workflow;
- rule;
- axis;
- source;
- suppression;
- campaign internals;
- raw Shopify JSON;
- staff notes;
- integration proof.

Staff/operator UI should avoid raw internal department labels when they do not help the job. Prefer business language like "purchase intent", "customer request", "follow-up", or "account help" instead of exposing internal routing terms as the primary label.

## State Visual Rules

Different consequences need different visual treatment:

| State pair | Must look different because |
| --- | --- |
| Draft vs active | Saving a draft must not imply live email changed. |
| Test vs approved | A sent test is not approval. |
| Published vs activated | A published revision may not be the active event binding yet. |
| Live audience vs frozen snapshot | Preview is moving data; snapshot is the send list. |
| Eligible vs blocked recipient | Blocked people must not be counted as reachable. |
| Provider-disabled proof vs sent email | Proof records are real, but no customer was contacted. |
| Payable invoice vs placeholder invoice | Customer must not try to pay a non-payable record. |
| Checkout success vs review request | Staff review is not completed checkout. |
| Reorderable item vs unavailable item | Customer needs a readable reason before asking staff. |

## Cross-Module Demo Flow

A production demo should show these flows without explanation:

Mail Template:
1. Open a template/event.
2. See active vs draft immediately.
3. Preview with a real profile.
4. See missing readiness blockers.
5. Create test proof.
6. Approve/publish/activate only when safe.

Mail Marketing:
1. Open a campaign/audience.
2. See live vs frozen counts.
3. See blocked/suppressed counts.
4. Choose an approved template.
5. Queue real send or disabled proof with clear language.
6. Open delivery evidence.

Customer Portal:
1. Customer opens account home.
2. Sees orders, open invoices, reorder-ready items.
3. Opens order detail with readable properties.
4. Reorders one item or full order.
5. Gets real checkout or review-request state.
6. Returns later and sees the same cart/review context.

## Acceptance Gate

The module is not ready until:
- the first viewport is understandable in five seconds;
- the primary action is state-derived;
- every visible number is labeled by consequence: live, frozen, eligible, blocked, due, paid, failed, skipped, or disabled;
- long lists use search, page size, pagination, virtualization, or intentional grouping;
- raw payloads and internal proof are behind detail;
- customer-facing screens hide internal operations;
- empty, loading, error, disabled, and loaded states are all implemented;
- light mode, dark mode, laptop width, and narrow/mobile layout are readable;
- a non-engineer can complete the main job without staff explanation.
