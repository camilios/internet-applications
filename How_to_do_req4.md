MULTI-AGENT ORCHESTRATION — MANDATORY TEAM STRUCTURE

You must execute this project using a multi-agent architecture with exactly FOUR specialized subagents and yourself as the MAIN AGENT.

Do not simply simulate multiple agents by writing different role descriptions in one response.

Actually spawn and coordinate four independent subagents using the native Codex subagent capabilities available in your environment.

You are the MAIN AGENT (Project Lead).

Your primary responsibility is to coordinate the team, establish shared technical contracts, facilitate communication between frontend and backend, resolve conflicts, integrate all work, and ensure the project is completed correctly.

The user must NOT be required to manually coordinate the agents.

⸻

1. TEAM STRUCTURE

Create the following four specialized subagents.

AGENT 1 — PROJECT REVIEWER

Role: Senior Software Architect and Codebase Reviewer.

Execution order: FIRST.

This agent is responsible for reviewing the existing project before implementation starts.

Responsibilities

Perform a comprehensive READ-ONLY audit of the relevant repository.

Inspect:

* Overall project structure.
* Laravel backend architecture.
* Node.js warehouse architecture.
* Existing gRPC communication and protobuf contracts.
* Database models, migrations, and relationships.
* Order creation and order status update workflows.
* Existing events, listeners, jobs, queues, and mail implementation.
* Authentication and authorization.
* Docker Compose and infrastructure.
* React application architecture.
* Existing TanStack Query configuration.
* QueryClient initialization and query key conventions.
* Existing custom CRUD hooks.
* API clients and response structures.
* Frontend authentication and routing.
* Existing WebSocket or broadcasting infrastructure.
* Existing testing frameworks and test coverage.

Frontend-specific review

Identify the actual implementations and conventions for:

* Create hooks.
* Update/Edit hooks.
* Delete hooks.
* Get-by-ID hooks.
* Get-all/list hooks.
* Query keys and query key factories.
* Mutations and cache invalidation.
* Existing API methods and response types.

Do not assume specific filenames or hook names.

Deliverable

Produce a detailed but concise repository audit report containing:

1. Existing architecture.
2. Important files and their responsibilities.
3. Existing reusable components and abstractions.
4. Current order lifecycle.
5. Current frontend data-fetching architecture.
6. Existing real-time or asynchronous functionality.
7. Missing functionality.
8. Compatibility and dependency considerations.
9. Potential integration risks.
10. Recommended implementation boundaries.
11. Suggested frontend/backend integration contracts.
12. Exact files likely to require changes.

Restrictions

* READ-ONLY.
* Do not modify source code.
* Do not create migrations.
* Do not install dependencies.
* Do not refactor anything.
* Do not independently implement the feature.

Return your complete audit report to the MAIN AGENT.

The MAIN AGENT must review and understand this report before implementation agents start modifying the codebase.

⸻

AGENT 2 — FRONTEND ENGINEER

Role: Senior React and TanStack Query Engineer.

Execution order: SECOND.

Work in parallel with Agent 3 after the MAIN AGENT establishes and communicates the shared integration contract.

Responsibilities

Implement the frontend requirements from the main implementation prompt.

You own:

* React frontend implementation.
* Existing TanStack Query integration.
* WebSocket client integration.
* Laravel Echo integration if applicable.
* Dedicated real-time hooks/services.
* Admin dashboard real-time order notifications.
* Customer real-time order-status updates.
* Cache synchronization.
* Connection lifecycle and reconnection behavior.
* Frontend-specific tests.

Critical architectural restrictions

The existing frontend architecture is authoritative.

You MUST preserve the existing custom CRUD hooks and conventions.

Do not replace or rewrite existing:

* Create hooks.
* Update/Edit hooks.
* Delete hooks.
* Get-by-ID hooks.
* Get-all/list hooks.

Preserve the existing API client, query key factories, QueryClient configuration, response types, error handling, and mutation conventions.

React Query remains the owner of frontend server state.

WebSocket must only deliver real-time events and trigger appropriate cache synchronization.

Prefer dedicated real-time hooks/services instead of mixing WebSocket logic into generic CRUD hooks.

Use invalidateQueries or setQueryData according to the existing cache structure and event payload.

Preserve pagination, filters, sorting, and existing UI behavior.

Do not modify backend files.

Coordination requirements

Before implementing:

* Read the repository audit report.
* Read the MAIN AGENT’s approved integration contract.
* Communicate any missing backend event information or API requirements to the MAIN AGENT.
* Do not invent event names, channel names, payload fields, or authorization assumptions.

During implementation:

* Notify the MAIN AGENT immediately if the backend implementation contract appears inconsistent with actual frontend requirements.
* Do not silently introduce incompatible assumptions.
* Report your expected event payloads and frontend subscription requirements to the MAIN AGENT.

Deliverable

Return:

1. Files inspected.
2. Files modified and created.
3. New real-time hooks/services.
4. How React Query cache synchronization works.
5. How reconnection and cleanup work.
6. Tests added and executed.
7. Any backend requirements or integration blockers.
8. Confirmation that existing custom CRUD hooks were preserved.

Do not modify files owned by Agent 3.

⸻

AGENT 3 — BACKEND ENGINEER

Role: Senior Laravel, Distributed Systems, and Backend Engineer.

Execution order: SECOND.

Work in parallel with Agent 2 after receiving the MAIN AGENT’s approved integration contract.

Responsibilities

Implement the backend requirements from the main implementation prompt.

You own:

* Laravel order lifecycle integration.
* Transactional Outbox Pattern.
* RabbitMQ topology and configuration.
* Outbox publisher.
* Independent email worker.
* Email sending and retry mechanisms.
* Dead Letter Queue.
* Message idempotency.
* Laravel Reverb configuration if needed.
* Broadcasting events.
* Private channel authorization.
* Backend integration and automated tests.
* Relevant backend infrastructure configuration.

Preserve the existing Node.js warehouse service and gRPC contracts.

Do not move email processing into Node.js.

Do not replace gRPC with RabbitMQ.

Only modify the warehouse service when a genuine integration requirement makes it necessary.

Backend/frontend integration contract

You are responsible for implementing the agreed backend event contract.

Coordinate with the MAIN AGENT to establish and communicate:

* Exact private channel names.
* Actual broadcast event names.
* Payload schemas.
* Event identifiers.
* Timestamps or version metadata where needed.
* Authentication and authorization requirements.
* Event timing relative to database commits.
* Error and reconnection expectations.

The following conceptual events are required:

1. OrderCreated.
2. OrderStatusUpdated.

The final names and payload structures must be explicitly agreed upon with the MAIN AGENT and communicated to Agent 2.

Do not allow the frontend and backend to implement incompatible event contracts.

Responsibilities concerning reliability

Respect:

* Transactional consistency.
* Publisher confirms.
* Manual acknowledgements.
* Retry policies.
* Dead Letter Queue handling.
* Idempotency.
* Post-commit event dispatch.
* Separation of email processing from real-time broadcasting.

Restrictions

* Do not modify frontend files.
* Do not change existing frontend conventions.
* Do not introduce frontend dependencies.
* Do not invent domain behavior that conflicts with the repository.
* Do not refactor unrelated backend functionality.

Deliverable

Return:

1. Files inspected.
2. Files modified and created.
3. Implemented architecture.
4. RabbitMQ configuration and topology.
5. Outbox and worker implementation.
6. Broadcasting and authorization implementation.
7. Event contract with exact names and payload schemas.
8. Migrations and required environment variables.
9. Tests added and executed.
10. Any frontend requirements or integration blockers.
11. Confirmation that existing gRPC warehouse functionality was preserved.

Do not modify files owned by Agent 2.

⸻

AGENT 4 — QA ENGINEER

Role: Senior QA Automation Engineer and Integration Test Engineer.

Execution order: LAST.

This agent must NOT start its final verification phase until:

1. Agent 1 has completed the repository audit.
2. Agent 2 has completed frontend implementation.
3. Agent 3 has completed backend implementation.
4. The MAIN AGENT has integrated the frontend and backend changes.
5. The MAIN AGENT confirms that the implementation is ready for final QA.

Do not run the final acceptance suite while the frontend/backend integration contract is still changing.

Primary objective

Independently verify that the complete implementation satisfies ALL requirements from the original implementation prompt.

The QA agent is the final quality gate.

Do not merely inspect code and assume it works.

Run the actual tests wherever the environment permits.

Required backend verification

Verify:

1. Transactional order and outbox event persistence.
2. Correct rollback behavior.
3. Publisher confirmation handling.
4. Failed publication recovery.
5. Email worker processing.
6. Manual ACK behavior.
7. Retry and backoff behavior.
8. DLQ behavior.
9. Duplicate message handling.
10. Idempotency.
11. Post-commit OrderCreated broadcasting.
12. OrderStatusUpdated broadcasting.
13. Private channel authorization.
14. No unauthorized order access.

Required frontend verification

Verify:

1. Admin receives OrderCreated without refreshing the page.
2. Customer receives OrderStatusUpdated without refreshing the page.
3. Existing TanStack Query hooks continue working.
4. Existing custom CRUD hooks retain their behavior.
5. Existing query key conventions remain intact.
6. Correct invalidateQueries/setQueryData usage.
7. Correct handling of pagination and filtered lists.
8. WebSocket listener cleanup.
9. No duplicate subscriptions.
10. Reconnection and resynchronization.
11. Correct behavior after missed events.
12. No unintended cache mutations.

Required system-level verification

Perform the three main acceptance scenarios:

SCENARIO A — EMAIL WORKER STOPPED

* Stop only the email worker.
* Create a new order.
* Verify the HTTP response does not wait for email delivery.
* Verify the order appears on the admin dashboard immediately.
* Verify the email message remains safely queued.
* Restart the email worker.
* Verify successful email processing.

SCENARIO B — REAL-TIME ORDER STATUS

* Open the customer’s order page.
* Open the admin dashboard.
* Approve the order.
* Verify the customer’s status changes immediately without refreshing the page.

SCENARIO C — AUTHORIZATION

* Verify a customer cannot subscribe to another customer’s private order channel.
* Verify an ordinary customer cannot subscribe to the admin channel.

Existing architecture regression testing

Specifically verify that the frontend CRUD architecture was preserved.

Inspect Git changes and ensure that no unrelated refactoring or unnecessary frontend rewrites occurred.

Test execution requirements

* Run the actual automated tests.
* Run relevant integration tests.
* Run formatting and static analysis where available.
* Run the production frontend build.
* Run relevant migrations against the available test environment.
* Validate Docker-based infrastructure where the environment permits it.

Do not report a test as passing unless it was actually executed and passed.

Failure handling

If a test fails:

1. Identify the exact failure.
2. Locate the responsible implementation area.
3. Send a detailed defect report to the MAIN AGENT.
4. The MAIN AGENT must delegate the correction to Agent 2 or Agent 3.
5. Wait for the correction and integration.
6. Re-run the failed test and relevant regression tests.

Do not silently modify production application code to make tests pass.

You may add or improve focused test files when necessary, following existing project conventions.

Final QA report

Return a structured report with:

* Requirement.
* Test executed.
* Actual result.
* Evidence or command output summary.
* PASS / FAIL / BLOCKED.

Do not declare the project fully verified if any required acceptance criterion remains failing or blocked.

The objective is to achieve passing results for every testable requirement, not to claim 100% success without evidence.

⸻

2. MAIN AGENT — PROJECT LEAD AND INTEGRATION ARCHITECT

You are responsible for the complete project.

You are NOT simply another implementation agent.

You must actively manage the other four agents.

Your responsibilities include:

A. Team orchestration

* Spawn exactly four specialized subagents.
* Assign each agent its defined scope.
* Ensure Agent 1 runs first.
* Wait for the audit report before implementation starts.
* Start Agents 2 and 3 in parallel.
* Start Agent 4 only after integration is complete.
* Collect and review every agent’s final report.
* Do not abandon an agent’s task before receiving its final result.

Do not create redundant additional agents.

B. Communication management

You are the central communication point between frontend and backend.

Agents 2 and 3 must not independently make incompatible technical decisions.

You must:

1. Collect the frontend integration requirements.
2. Collect the backend event and API contract proposal.
3. Compare both sides.
4. Resolve disagreements.
5. Establish one canonical integration contract.
6. Communicate that contract to both agents.
7. Monitor implementation for compatibility.

Use the native agent messaging capabilities to communicate with subagents.

Do not require the user to relay messages between agents.

C. Shared integration contract

Before frontend/backend implementation, establish a clear shared contract containing:

* WebSocket provider and connection configuration.
* Private channel names.
* Broadcast event names.
* Event payload schemas.
* Required identifiers and metadata.
* Authentication requirements.
* Authorization rules.
* Expected frontend subscription behavior.
* React Query invalidation/cache-update strategy.
* Reconnection and missed-event recovery behavior.

Create a concise shared documentation artifact for this contract if appropriate to the existing repository conventions.

Both implementation agents must follow the same approved contract.

Avoid duplicate or contradictory contracts.

D. File ownership and conflict prevention

Before parallel implementation, require each implementation agent to identify the files it intends to modify.

Assign non-overlapping responsibilities:

* Agent 2 owns frontend implementation files.
* Agent 3 owns backend implementation files.
* Main Agent owns cross-boundary integration decisions and resolves shared-file conflicts.
* Agent 1 is read-only.
* Agent 4 owns final verification and focused test additions, not production implementation.

For shared files such as Docker Compose, environment examples, or root-level configuration:

* Explicitly assign ownership before modification.
* Do not allow both implementation agents to edit the same file independently.
* Main Agent must handle integration conflicts.

Use the existing working tree and Git conventions.

Do not overwrite another agent’s changes.

E. Integration responsibility

After Agents 2 and 3 finish:

* Review their reports.
* Inspect the actual Git diff.
* Verify their implementations match the agreed contract.
* Verify event names and payloads are consistent.
* Verify frontend query keys and cache updates correspond to actual backend data.
* Verify channel authorization matches frontend subscriptions.
* Verify infrastructure configuration is coherent.
* Resolve integration failures.

The MAIN AGENT is ultimately responsible for the integrated result.

Do not blindly trust agent summaries. Inspect actual code and test evidence.

F. QA handoff

Only when you are satisfied that frontend and backend integration is ready:

1. Spawn Agent 4.
2. Give it the original requirements, audit report, final integration contract, and implementation summaries.
3. Ask it to execute all required tests and acceptance scenarios.
4. Collect its findings.
5. Delegate any required corrections to the responsible implementation agent.
6. Re-integrate and request QA retesting.
7. Do not mark the project complete until all testable acceptance criteria pass.

QA must be the final independent verification gate.

G. Final report

Provide the user with one consolidated report.

Include:

1. The four agents and their responsibilities.
2. What each agent completed.
3. Architecture and integration decisions.
4. Files changed.
5. Confirmation that existing frontend CRUD hooks were preserved.
6. Backend and frontend integration details.
7. Actual automated test results.
8. Manual acceptance-test results.
9. Any blocked or unverified tests.
10. Remaining work.

Clearly distinguish verified success from assumptions or untested behavior.

⸻

3. EXECUTION ORDER — MANDATORY

Follow this exact workflow:

PHASE 1 — AUDIT

Spawn Agent 1.

Wait for its complete read-only repository report.

Review the report and identify the actual implementation strategy.

PHASE 2 — CONTRACT NEGOTIATION

Main Agent collects frontend integration needs and backend event contract requirements.

Establish and approve the shared technical contract.

PHASE 3 — PARALLEL IMPLEMENTATION

Spawn Agent 2 and Agent 3.

Let them work in parallel within their separate ownership boundaries.

Main Agent coordinates communication and resolves integration questions.

PHASE 4 — INTEGRATION

Collect both implementation reports.

Inspect actual changes.

Resolve conflicts.

Verify the frontend/backend contract.

PHASE 5 — FINAL QA

Spawn Agent 4 only now.

Run the complete verification process.

If failures occur, coordinate fixes and repeat the required verification.

PHASE 6 — FINAL DELIVERY

Main Agent consolidates the entire result and reports the actual implementation and verification status.

⸻

4. NON-NEGOTIABLE RULES

* Actually spawn four subagents; do not merely simulate them.
* Main Agent owns coordination and integration.
* Agent 1 must be read-only.
* Agents 2 and 3 must work within separate ownership boundaries.
* Frontend and backend must share one approved integration contract.
* Agent 4 must perform final QA after implementation and integration.
* No agent may silently change another agent’s architectural decisions.
* Do not allow multiple agents to overwrite shared files.
* Do not claim tests passed without executing them.
* Do not claim complete success while required tests remain failing or blocked.
* Do not ask the user to coordinate the team manually.
* Do not stop at planning; complete the implementation.

If native subagent functionality is unavailable in the current Codex session, explicitly report that limitation rather than pretending that independent agents were spawned.

The MAIN AGENT is accountable for the final integrated implementation.