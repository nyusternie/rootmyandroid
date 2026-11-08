# HANDOFF — Frontend: AI Positioning, Agent Experience and Device-Session UX

Status: Proposed implementation plan  
Date: 2026-11-07  
Owners: Web frontend, Android frontend, product design, technical content  
Backend dependencies: Agent Session API, Inference API, policy broker contracts, usage ledger, provider metadata  
Primary surfaces: `/`, `/agents`, `/mcp`, `/scan`, a proposed `/agents/live`, Rootz, and Guardian Angel

### 1. Product objective

Present Root My Android as an agent-ready Android platform with three concrete capabilities:

1. AI-assisted live device guidance grounded in evidence collected locally through WebUSB and ADB.
2. A device-bound agent runtime that can use hardware-backed Android security features where supported.
3. Guardian Angel AI that reduces noise and helps parents understand filtered activity without uploading sensitive family data by default.

The central product promise is:

> AI explains the evidence. Deterministic tools validate the plan. You approve every consequential action.

Do not market this as “AI can root any phone,” “fully autonomous rooting,” or “agents running securely inside the TEE” unless those exact claims have been independently demonstrated.

### 2. Current public-state corrections

The current site and repository use the product name Rootz. Keep Rootz, Guardian Angel, Rooted, Root My Android, and Guru Daemon naming consistent before launching an AI campaign.

The live `/agents` and `/mcp` pages currently describe account, entitlement, plan, checkout, voucher, payment-status, network-discovery, and human-support tools. They do not yet expose live ADB/device-control tools.

Before promoting new capabilities:

- Keep “MCP server available” as a current claim.
- Label device diagnostics, live rooting assistance, hardware-backed identity, and Guardian AI according to their actual release state.
- Replace broad phrases such as “no personal data anywhere” with precise account-language: no email or conventional signup identity is required.
- Clarify that sensitive device data has separate, feature-specific handling.
- Clarify that creating a checkout or crypto deposit request is not the same thing as completing a payment.
- Do not imply that an agent should redeem vouchers, send support messages, or initiate financial activity without user review.
- Do not describe account numbers as suitable for indefinite, unscoped agent authority. Introduce revocable agent sessions for new AI functionality.

Suggested status labels:

- `LIVE`: available and supported now.
- `BETA`: available with documented limitations.
- `LABS`: opt-in experimental functionality on test devices.
- `PLANNED`: not available and not included in current purchase promises.

Never display a planned capability as part of the currently purchasable feature set without a clear roadmap label.

### 3. Information architecture

Use these surfaces for distinct jobs:

| Surface | Responsibility |
|---|---|
| `/` | User-facing benefits and concise proof of the agent-ready platform |
| `/agents` | Platform overview, live capability matrix, security model, examples, and developer entry points |
| `/mcp` | MCP transport and current machine-generated tool reference |
| `/scan` | Existing free, local, read-only scan; preserve its current guarantees |
| `/agents/live` | Proposed interactive device-assistant session, initially read-only |
| Rootz app | On-device diagnostics, local policy enforcement, model preferences, and hardware-backed identity |
| Guardian Angel | Local filtering, parent consent, AI summaries, and provider/privacy controls |

Do not turn `/scan` into a write-capable rooting interface. Its “nothing is uploaded” and “read-only” promises must remain true in its default flow.

An optional post-scan action may say:

> Explain this report with AI

Selecting it must open a separate consent and payload-preview step. It must not silently transmit the scan.

### 4. Homepage direction

Keep the primary user benefit ahead of AI terminology. Add one substantive agent section rather than repeating “AI,” “agents,” and “LLM” throughout the page.

Suggested hero adaptation for use only when the corresponding beta is available:

> Root your Android with evidence—not guesswork.  
> Scan locally, let AI explain the results, and follow a device-specific plan with explicit approval before anything changes.

Suggested compact proof strip:

> Local ADB scanning · Agent-ready MCP tools · Human-approved actions

Suggested agent section:

#### Android tools for people and AI agents

**Live device guidance**

Connect over USB and let the assistant explain real device evidence, identify missing information, and guide the next safe inspection.

**Diagnostics grounded in logs**

Rootz AI links findings to supporting log excerpts, separates observations from inference, and recommends read-only next steps.

**Your agent, your permissions**

Connect through MCP or use the Root My Android runtime. Sensitive data sharing and consequential operations require explicit authorization.

Calls to action:

- `Explore the agent platform` → `/agents`
- `Try a read-only live session` → `/agents/live`
- `View MCP tools` → `/mcp`

Avoid these claims:

- “One-click AI rooting for every Android.”
- “Autonomous agent safely unlocks and flashes your phone.”
- “Military-grade TEE AI.”
- “Private AI” without identifying where inference happens.
- “AI keeps your child safe” or other guaranteed safety outcomes.

### 5. Required `/agents` expansion

Retain the existing integration quickstart, but reorganize the page into the following sections.

#### A. Live capability matrix

| Capability | Status | Data destination | User authority |
|---|---|---|---|
| Accounts, plans and entitlements | Live | Root My Android API | Account/session dependent |
| Checkout and payment status | Live | Existing payment rails | Explicit checkout review |
| MCP support conversations | Live | Root My Android support | Message review required |
| Local ADB device scan | Live/current scope | Browser only by default | Physical device and ADB authorization |
| AI scan explanation | Beta when shipped | Named inference provider | Separate payload consent |
| Live read-only agent session | Beta when shipped | Local device bridge plus approved evidence | User can stop at any time |
| Hardware-backed agent identity | Labs when shipped | Attestation metadata only | Device eligibility required |
| Guardian activity summaries | Planned initially | Aggregated data by default | Per-category opt-in |
| State-changing rooting operations | Labs/future | Local operation broker | Exact operation approval |

Generate status from backend capability metadata where practical. Do not maintain several contradictory handwritten capability lists.

#### B. Three agent blueprints

**Rooting Guide Agent**

- Reads approved device evidence.
- Explains the deterministic rooting plan.
- Identifies missing prerequisites.
- Cannot choose a boot image or partition from model output alone.
- Cannot execute arbitrary shell commands.

**Rootz Diagnostic Agent**

- Reads an authorized log bundle.
- Produces evidence-linked findings.
- Suggests additional read-only probes.
- Shows uncertainty and alternative explanations.
- Stops at the session’s cost and tool-call limits.

**Guardian Digest Agent**

- Uses locally filtered and minimized events.
- Groups duplicate alerts.
- Produces a parent-readable summary.
- Does not autonomously punish, block, or contact anyone.
- Does not receive raw messages or media unless that exact category has been separately authorized.

#### C. Security model

Explain in plain language:

- The model proposes; it does not authorize.
- Device output and log text are untrusted data, not instructions.
- A deterministic policy service validates tool calls.
- The local device broker owns USB/device execution.
- Destructive actions require a separate authorization object and local confirmation.
- Agent sessions can be stopped and revoked.
- Hardware-backed key storage is not the same as running an LLM inside a TEE.

#### D. Developer quickstarts

Provide working examples only for shipped functionality:

- Existing MCP initialize and read-only plan lookup.
- Proposed read-only AI session creation.
- Evidence-bundle schema example using synthetic data.
- Example agent finding with evidence references.
- Example insufficient-balance response.
- Example unsupported-device response.
- Verified MCP client/version matrix.
- Rate limits, errors, retention, and versioning.

Use synthetic device identifiers and logs in public examples.

### 6. Live rooting assistant UX

The initial release should assist with real physical devices while remaining read-only. ADB shell access alone does not root a stock production device, and the current browser scanner does not provide a verified fastboot/flashing path.

#### Session flow

1. **Compatibility check**
   - Detect WebUSB and browser support.
   - Explain that a cable and device-side ADB authorization are required.
   - Do not claim iOS or unsupported-browser compatibility.

2. **Connect**
   - Let the user select the USB device.
   - Show connection, authorization, and disconnect states.
   - Never attempt hidden reconnection into a write-capable mode.

3. **Collect evidence locally**
   - Use the existing allowlisted inspection transport.
   - Label each observation with source and collection time.
   - Unknown values remain unknown.
   - Do not request `su`.

4. **Choose processing mode**
   - `Local explanation`: deterministic and free where available.
   - `Cloud AI`: sends an approved evidence bundle to a named provider.
   - `Your own model/BYOK`: only when implemented, with clear credential handling.

5. **Preview the exact AI payload**
   - Show included device fields and attachments.
   - Identify redactions.
   - Identify provider, model class, retention mode, and estimated maximum charge.
   - Require affirmative consent before upload.

6. **Run the assistant**
   - Stream status such as `inspecting`, `reasoning`, `needs_evidence`, `waiting_for_user`, and `complete`.
   - Separate `Observed`, `Inferred`, and `Recommended` content.
   - Link findings to evidence IDs.
   - Display current estimated/actual usage charge.
   - Provide Stop and Disconnect controls.

7. **Present the plan**
   - Supported path, unsupported path, or insufficient evidence.
   - Exact prerequisites and known risks.
   - Clearly distinguish guidance from operations the agent can perform.
   - Never fill evidence gaps with model guesses.

8. **Optional future operation approval**
   - Display operation type, device, variant, artifact hash, target image/partition/slot, data-loss consequences, and rollback path.
   - Require a fresh, exact confirmation.
   - Bootloader unlocking and data-erasing steps remain explicit physical/OEM-guided actions, not silent agent operations.

9. **Verify and export**
   - Record completed and uncompleted steps.
   - Distinguish user-reported success from verified success.
   - Offer a redacted diagnostic report.
   - Provide rollback/stock-restoration documentation where appropriate.

#### Session states

Use a shared backend/frontend state machine:

- `idle`
- `connecting`
- `collecting_evidence`
- `awaiting_ai_consent`
- `awaiting_funds`
- `analyzing`
- `needs_user_input`
- `plan_ready`
- `awaiting_operation_approval`
- `executing_approved_operation`
- `verifying`
- `completed`
- `unsupported`
- `cancelled`
- `failed`

Only the backend policy service and local broker may authorize state transitions associated with device operations. The LLM must not directly set these states.

### 7. Future write-operation UX

Do not ship write automation as part of the first AI demonstration.

When a device-specific adapter is eventually approved:

- Show a diff-like operation review.
- Require artifact and target confirmation.
- Use single-use, short-lived authorization.
- Do not automatically retry a write after timeout, disconnect, or uncertain device state.
- Reinspect after reconnect and require a new plan if evidence changed.
- Require a fresh confirmation when artifact, target, slot, or operation changes.
- Never present an LLM-generated shell command with a generic Run button.
- Do not offer autonomous bootloader unlocking, wiping, or partition selection.
- Test only on sacrificial devices before enabling a Labs release.

A user asking the agent to “just handle everything” must not bypass these steps.

### 8. Hardware-backed security UX

Do not show a generic `TEE secured` badge.

Use capability-specific labels:

| Implementation | Approved UX wording |
|---|---|
| Browser session | Standard remote AI session |
| Android app sandbox | On-device agent runtime |
| Hardware-backed Keystore key | Device-bound cryptographic identity |
| Verified key attestation | Hardware-backed device/key attestation verified |
| StrongBox where available | StrongBox-backed key |
| Actual trusted application in a TEE | Name only after a real implementation and security review |

Explain when necessary:

> Hardware-backed identity helps protect keys and verify selected device properties. Cloud inference still occurs with the named provider and is not executed inside the Android TEE.

Rooted and unlocked devices may fail verified-boot or attestation requirements. Provide a supported lower-assurance mode for Rootz rather than blocking the rooting workflow. Do not silently relabel it as attested.

### 9. Guardian Angel AI UX

Start with aggregate and locally filtered tasks:

- App and usage categorization.
- Duplicate-alert grouping.
- Activity summaries.
- Explanations of why a rule generated an alert.
- Alert-sensitivity recommendations.
- Parent feedback such as `useful`, `false positive`, and `ignore similar`.

Provide separate controls for:

- Local filtering.
- Cloud AI summaries.
- Message-content processing, if ever supported.
- Media processing, disabled by default and outside the initial release.
- Provider/model selection where permitted.
- Retention and deletion.
- Revoking cloud processing without deleting local rules.

Use visible processing labels:

- `On device`
- `Cloud AI — minimized activity data`
- `Cloud AI — sensitive content`, only if later approved
- `External provider — provider name`

Do not use AI to make autonomous disciplinary decisions, diagnose mental health, declare content safe, or silently expand monitoring.

### 10. Inference billing UX

Users must understand the difference between:

- Subscription time for Rootz or Guardian Angel.
- Included AI usage allowance.
- Additional prepaid inference usage.
- BYOK usage paid directly to the user’s provider.

Before the first charge, show:

- Feature and task.
- Provider and model or model class.
- Estimated maximum charge.
- Session spending cap.
- Included allowance available.
- Additional balance required.
- Whether output may be truncated when the cap is reached.

During use:

- Show current charge and remaining session budget.
- Warn before included allowance is exhausted.
- Stop cleanly at the hard cap.
- Never enable overdraft or automatic top-up by default.

After use:

- Show actual usage, provider charge/customer charge where appropriate, and remaining balance.
- Provide a per-feature usage history.
- Do not include message or prompt contents in billing history.
- Explain refunds/reversals for failed provider calls.

Recommended launch presentation:

> Local tools are free. Cloud AI uses your included allowance or prepaid AI usage. No automatic overages.

### 11. Proposed frontend modules

These are proposed boundaries, not instructions to create all files immediately:

- `agent/capabilities`: backend-driven live/beta/labs status.
- `agent/session`: shared session state machine.
- `agent/evidence`: evidence preview, redaction display, and schema types.
- `agent/consent`: provider, payload, data-category, and spending consent.
- `agent/plan`: observations, inferences, prerequisites, and risk display.
- `agent/authorization`: exact future operation review.
- `agent/usage`: quote, allowance, charge, and balance presentation.
- `agent/providers`: local, hosted, and BYOK processing choices.
- `guardian/ai`: summary controls, feedback, consent, and deletion.

Generate shared TypeScript contracts from backend-owned schemas. Do not independently invent API response shapes in web and mobile clients.

### 12. Analytics and evaluation

Measure product outcomes without collecting sensitive content:

- Scan completed → AI explanation opt-in.
- AI opt-in → useful report completed.
- Cost per completed diagnostic session.
- Unsupported-device correctly identified.
- Agent stopped by user.
- Insufficient-balance stop.
- Provider failure and fallback rate.
- Evidence-linked finding rate.
- Plan comprehension rating.
- User-reported versus verified rooting outcome.
- Guardian summary usefulness and false-positive feedback.
- Revocation and data-deletion completion.

Do not send prompts, message contents, media, raw logs, account numbers, or device identifiers into first-party analytics events.

### 13. Frontend delivery sequence

- FE-01: Correct product naming and live-versus-planned claims.
- FE-02: Add the backend-driven capability matrix to `/agents`.
- FE-03: Add the focused homepage agent section.
- FE-04: Implement shared evidence, provider, consent, and usage components.
- FE-05: Add post-scan AI payload preview using synthetic evidence first.
- FE-06: Build `/agents/live` with read-only ADB evidence and Stop/Disconnect.
- FE-07: Add quote, allowance, hard-cap, and usage-history UI.
- FE-08: Add Rootz local-runtime and hardware-capability labels.
- FE-09: Add Guardian aggregate-summary controls and parent feedback.
- FE-10: Build future operation-review UI behind a disabled Labs flag.

### 14. Frontend acceptance criteria

The first public AI release is ready only when:

- `/scan` remains read-only and local by default.
- AI upload requires a separate, understandable consent.
- The exact payload and provider are visible before submission.
- Unsupported devices produce an honest unsupported/unknown result.
- No model-generated arbitrary command can execute.
- The user can stop inference and disconnect the device.
- Cloud charges have a visible hard cap and no overdraft.
- No current page claims general TEE execution.
- No current page implies live device MCP tools before they exist.
- Guardian raw messages/media are not uploaded by default.
- Homepage, agents, pricing, and in-app entitlements agree.
- All interactive states work with keyboard and screen readers.
- Sensitive payloads are absent from analytics and browser error reporting.
