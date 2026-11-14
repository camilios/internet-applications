**Senior Software Engineer — Reliable Async Processing & Real-Time E-Commerce Implementation**

Act as a Senior Software Engineer and Distributed Systems Architect.

Your task is to implement the complete asynchronous processing and real-time functionality described below in the EXISTING repository.

You are responsible for understanding the current architecture, making appropriate engineering decisions, implementing the solution, and verifying it.

This is an existing application. Extend its architecture without unnecessarily refactoring or replacing working implementations.

**1\. EXISTING PROJECT ARCHITECTURE**

The application currently follows this architecture:

*   **Laravel:** Main e-commerce application. Owns users, orders, order lifecycle, administration, and the main application database.
    
*   **Node.js:** Separate warehouse/inventory service communicating with Laravel through gRPC.
    
*   **React:** Frontend application.
    
*   **TanStack Query (React Query):** Server-state management, API fetching, caching, mutations, and query invalidation.
    
*   **RabbitMQ:** To be used for reliable asynchronous background processing.
    
*   **Laravel Reverb:** To be used for real-time browser updates through WebSockets, if compatible with the current Laravel version and no suitable broadcasting solution already exists.
    

The frontend already has an established custom-hook architecture for CRUD operations.

Examples of the existing patterns may include:

*   Create hooks.
    
*   Update/Edit hooks.
    
*   Delete hooks.
    
*   Get-by-ID hooks.
    
*   Get-all/list hooks.
    

Actual names and implementations may differ. Inspect the repository and identify the real conventions before making changes.

**The existing frontend architecture is authoritative. Preserve it.**

**2\. PRIMARY OBJECTIVES**

Implement the following capabilities:

1.  Reliable asynchronous order-confirmation emails.
    
2.  Durable message processing through RabbitMQ.
    
3.  Transactional Outbox Pattern to prevent losing important events.
    
4.  Independent background workers.
    
5.  Real-time notifications for the admin dashboard when a new order is created.
    
6.  Real-time order-status updates on the customer’s order-tracking page.
    
7.  Secure private WebSocket channels.
    
8.  Integration between WebSocket events and the existing TanStack Query cache.
    
9.  Preserve the existing React custom CRUD hooks and frontend architecture.
    
10.  Automated and manual verification of all acceptance criteria.
    

**3\. IMPORTANT WORKING RULES**

Before implementation:

1.  Inspect the entire relevant codebase.
    
2.  Identify existing architecture, conventions, dependencies, versions, and integration points.
    
3.  Inspect Laravel models, controllers, services, events, jobs, migrations, authentication, authorization, and order lifecycle.
    
4.  Inspect the Node.js warehouse service and gRPC contracts.
    
5.  Inspect the entire relevant frontend structure.
    
6.  Identify existing TanStack Query configuration, QueryClient setup, query key conventions, custom CRUD hooks, API client, authentication integration, and existing error-handling patterns.
    
7.  Inspect existing WebSocket, Echo, Reverb, or other broadcasting implementations before adding new ones.
    

Do not:

*   Rewrite working features.
    
*   Replace the current architecture with a new architecture.
    
*   Introduce duplicate API layers.
    
*   Create redundant custom hooks.
    
*   Change existing naming conventions without a strong reason.
    
*   Invent model properties, endpoints, roles, permissions, or protobuf contracts.
    
*   Add unnecessary dependencies.
    
*   Introduce another state-management solution.
    
*   Modify unrelated components or features.
    
*   Perform broad frontend refactoring.
    
*   Assume that all existing code needs improvement.
    

Make reasonable implementation decisions autonomously.

Do not stop after producing an implementation plan. Execute the implementation and verify it.

If a change is genuinely necessary but introduces a compatibility issue, inspect the alternatives and choose the smallest safe change.

**4\. BACKEND IMPLEMENTATION**

**A. Order Creation and Transactional Outbox**

Inspect the existing order creation workflow.

Implement a reliable transactional outbox architecture.

Requirements:

*   Persist the order and its OrderCreated outbox event inside the same database transaction.
    
*   Implement a reliable outbox publisher.
    
*   Publish unpublished events to RabbitMQ.
    
*   Mark an event as published only after receiving successful broker confirmation.
    
*   Recover from publisher failures.
    
*   Support retries.
    
*   Give every event a stable unique event\_id.
    
*   Make duplicate event processing safe.
    
*   Never make order creation wait for email delivery.
    
*   Dispatch real-time events only after successful database commit.
    

Prevent the Dual Write Problem.

If RabbitMQ is temporarily unavailable, the order and its outbox event must remain safely persisted.

**B. RabbitMQ Infrastructure**

Configure an appropriate RabbitMQ topology:

*   Durable exchanges.
    
*   Durable queues.
    
*   Persistent messages.
    
*   Publisher confirms.
    
*   Explicit routing keys.
    
*   Manual consumer acknowledgements.
    
*   Configurable retry attempts.
    
*   Bounded retry backoff.
    
*   Dead Letter Exchange (DLX).
    
*   Dead Letter Queue (DLQ).
    
*   Connection recovery.
    
*   Sensible timeouts.
    
*   Environment-based configuration.
    
*   Health checks.
    
*   Useful operational logging.
    

Avoid infinite immediate-requeue loops.

Verify compatibility before choosing a RabbitMQ library or Laravel integration.

**C. Email Worker**

Implement a separate Laravel background worker responsible for order-confirmation emails.

Requirements:

*   Consume OrderCreated messages from RabbitMQ.
    
*   Retrieve relevant order and customer data using the existing domain models.
    
*   Send emails through the existing Laravel Mail configuration/provider.
    
*   Acknowledge messages only after successful processing.
    
*   Retry temporary failures with bounded backoff.
    
*   Route permanently failed messages to DLQ.
    
*   Implement idempotency using event\_id or a dedicated notification-delivery record.
    
*   Avoid duplicate email delivery as far as the delivery guarantees and email provider allow.
    
*   Log processing attempts, success, and failures without exposing sensitive information.
    

The email worker must be an independent process.

It must not be executed inline inside the order creation controller.

**D. Reliable Delivery Considerations**

Account for at-least-once message delivery.

Do not assume exactly-once delivery.

Handle duplicate messages safely using stable event identifiers and idempotent processing.

Do not mark events as processed before the actual processing succeeds.

**5\. REAL-TIME BROADCASTING**

Use Laravel Reverb and Laravel Echo if compatible with the current project.

Reuse an existing suitable broadcasting solution if available.

Implement these events:

**Event 1: OrderCreated**

Broadcast to:

private admin.orders

Requirements:

*   Trigger after the order transaction successfully commits.
    
*   Notify authenticated administrators that a new order exists.
    
*   Include only the minimum required information.
    
*   Do not expose unnecessary customer or payment information.
    

**Event 2: OrderStatusUpdated**

Broadcast to:

private orders.{orderId}

Requirements:

*   Trigger after the order status is successfully updated and committed.
    
*   Include the order identifier, new status, and necessary metadata.
    
*   Do not expose sensitive information.
    

**Critical Independence Requirement**

Real-time broadcasting must NOT depend on the email worker or its RabbitMQ queue.

Stopping the email worker must not prevent:

*   New orders from appearing in the admin dashboard.
    
*   Order-status changes from appearing on the customer’s page.
    

Use an appropriate post-commit broadcasting mechanism or an independent broadcasting queue.

**6\. PRIVATE CHANNEL AUTHORIZATION**

Implement authorization using the existing authentication and authorization architecture.

Required channels:

**Admin channel**

admin.orders

Only users with actual administrative permissions can subscribe.

Reuse the existing role, permission, and authorization system.

**Customer order channel**

orders.{orderId}

Only the authenticated owner of that order can subscribe.

Requirements:

*   Reject unauthorized subscriptions.
    
*   Never rely on frontend authorization checks.
    
*   Protect REST API endpoints independently.
    
*   Do not trust client-provided user IDs or roles.
    
*   Reuse existing policies and authorization conventions.
    

**7\. FRONTEND IMPLEMENTATION — CRITICAL PRESERVATION REQUIREMENTS**

This section is especially important.

The existing frontend already has a custom TanStack Query architecture and reusable CRUD hooks.

**Do not replace, redesign, or unnecessarily modify this architecture.**

The goal is to ADD real-time synchronization to the existing frontend, not to rebuild how the frontend fetches and mutates data.

**A. Preserve Existing Custom CRUD Hooks**

First, inspect how the current frontend handles:

*   Create operations.
    
*   Update/Edit operations.
    
*   Delete operations.
    
*   Get-by-ID operations.
    
*   Get-all/list operations.
    

Identify the actual custom hooks, naming conventions, shared utilities, query keys, API methods, mutation callbacks, error handling, and response types.

The project may have equivalents of:

*   useCreate
    
*   useUpdate
    
*   useEdit
    
*   useDelete
    
*   useGet
    
*   useGetAll
    

These are examples only. Do not assume these exact names exist.

**Strict rules:**

1.  Preserve all existing CRUD hooks.
    
2.  Do not replace existing hooks with new implementations.
    
3.  Do not move API calls into components.
    
4.  Do not duplicate API logic.
    
5.  Do not rewrite the existing API client.
    
6.  Do not change existing query keys unnecessarily.
    
7.  Preserve existing query key factories/constants.
    
8.  Preserve existing mutation callbacks and cache invalidation patterns.
    
9.  Preserve existing TypeScript types and API response contracts.
    
10.  Do not introduce another server-state management library.
    
11.  Do not modify unrelated frontend pages or components.
    
12.  Do not change UI styling, routing, forms, or component structure unless strictly necessary.
    

**Existing CRUD hooks must continue to work exactly as before.**

Only modify an existing generic CRUD hook if a clearly demonstrated technical necessity requires it.

If such a change is unavoidable:

*   Keep it minimal.
    
*   Preserve backward compatibility.
    
*   Explain why the change is necessary.
    
*   Add tests verifying that existing behavior remains unchanged.
    

**B. Add Real-Time Logic as a Separate Layer**

Prefer dedicated real-time hooks or services following the existing project conventions.

Examples of possible responsibilities:

*   Listening for new admin orders.
    
*   Listening for customer order-status updates.
    
*   Managing channel subscriptions.
    
*   Cleaning up listeners.
    
*   Handling WebSocket reconnections.
    

Names are not prescribed. Follow the actual repository naming conventions.

Do not mix WebSocket connection management into generic CRUD hooks.

Do not make generic useGetAll or useGet hooks responsible for creating or managing WebSocket connections.

The existing fetching layer and the new real-time layer must remain logically separate.

**C. React Query Must Remain the Source of Frontend Server State**

Maintain the following separation:

*   REST API: authoritative source of application data.
    
*   TanStack Query: owns server-state fetching and caching.
    
*   WebSocket: delivers real-time events and change notifications.
    
*   React components: consume the existing queries and display the updated cache.
    

WebSocket must NOT replace REST API fetching.

Initial page loading must continue to use the existing query hooks.

WebSocket must NOT become another independent source of application state.

Avoid adding redundant useState values containing copies of data already stored in TanStack Query.

**D. Use the Existing QueryClient and Query Key Conventions**

Inspect the existing QueryClient configuration and query key architecture.

Use the existing QueryClient instance and existing query key factories/constants.

Never create a new QueryClient specifically for WebSocket events.

Do not invent new query key structures if the project already has established query keys.

All real-time cache updates must target the correct existing queries.

**E. Choose Between invalidateQueries and setQueryData**

Use the appropriate cache-update strategy based on the event payload and existing cache structure.

**Strategy 1: invalidateQueries**

Prefer invalidateQueries when:

*   A new order arrives in the admin dashboard.
    
*   A paginated list needs to reflect a new item.
    
*   Existing filters and sorting complicate direct insertion.
    
*   The event does not contain enough information to safely update the cache.
    
*   The authoritative server response should determine the final state.
    

Example:

queryClient.invalidateQueries({

  queryKey: existingAdminOrdersQueryKey,

});

The actual key must come from the repository.

Preserve the existing filters, pagination, and query key conventions.

Do not invalidate every query in the application unnecessarily.

**Strategy 2: setQueryData**

Prefer setQueryData when:

*   The event contains enough information to safely update a specific cached record.
    
*   The existing cached data structure is understood.
    
*   The relevant query key is already known.
    

Example:

queryClient.setQueryData(

  existingOrderQueryKey,

  (oldData) => {

    if (!oldData) return oldData;

    return {

      ...oldData,

      status: event.status,

    };

  },

);

This is illustrative only.

Adapt the implementation to the actual API response structure and existing TypeScript types.

Use immutable updates.

Do not fabricate missing fields.

Do not overwrite existing data with incomplete event payloads.

**Important: Paginated and Filtered Data**

Inspect how order lists are currently cached.

If the dashboard uses pagination, sorting, or filters:

*   Do not blindly insert a new order into every cached list.
    
*   Do not corrupt pagination metadata.
    
*   Do not break active filters or sort order.
    
*   Use targeted invalidation when safe direct cache modification is not possible.
    
*   Preserve the existing list response shape.
    

**F. Admin Dashboard Integration**

Required behavior:

1.  The admin dashboard fetches its initial order data using existing CRUD/query hooks.
    
2.  After loading, it subscribes to the authorized private admin.orders channel.
    
3.  It listens for the OrderCreated event.
    
4.  Upon receiving the event, it updates the appropriate TanStack Query cache or invalidates the relevant existing order queries.
    
5.  The dashboard displays the new order without a page refresh.
    
6.  Existing pagination, filters, sorting, and UI behavior remain intact.
    

Avoid duplicate subscriptions.

Properly clean up listeners when the relevant component or hook unmounts.

Do not duplicate the existing order-fetching logic.

**G. Customer Order Tracking Integration**

Required behavior:

1.  The customer opens an order details page.
    
2.  The existing get-by-ID hook fetches the initial order through REST API.
    
3.  After the relevant order identifier is available, subscribe to the private orders.{orderId} channel.
    
4.  Listen for OrderStatusUpdated.
    
5.  Update the existing TanStack Query cache using setQueryData when the event payload is sufficient and compatible with the cached structure.
    
6.  Otherwise invalidate only the relevant order query.
    
7.  The customer sees the new order status immediately without a page refresh.
    

The subscription must be tied to the correct order ID.

Clean up the subscription and listeners when the customer leaves the order page or changes the order ID.

Do not subscribe to unnecessary order channels.

**H. WebSocket Lifecycle and Reconnection**

Handle:

*   Connection establishment.
    
*   Connection failures.
    
*   Disconnections.
    
*   Automatic reconnections when supported by the existing integration.
    
*   Subscription cleanup.
    
*   Duplicate listener prevention.
    
*   Component unmounting.
    
*   Authentication changes and logout.
    

Very important:

WebSocket events are not a durable source of truth.

If the connection is interrupted, the frontend may miss events.

After reconnecting, refetch the relevant authoritative data through the existing query hooks or targeted QueryClient invalidation.

Do not assume that reconnecting automatically replays missed events.

If the application already has a shared WebSocket connection manager, reuse it instead of creating additional connections.

Avoid one WebSocket connection per component when the existing architecture supports a shared connection.

**I. Event Ordering and Duplicate Events**

Consider duplicate and out-of-order event delivery.

Use stable event identifiers and timestamps or version information where appropriate.

Do not allow an older event to overwrite a newer order status.

Follow the existing backend event contract.

If necessary, introduce a small amount of event metadata in the backend, but do not unnecessarily change API response contracts.

**J. Frontend Testing**

Add focused tests for the new real-time integration.

At minimum verify:

*   Admin receives OrderCreated and the correct order queries are updated or invalidated.
    
*   Customer receives OrderStatusUpdated and the correct order cache is updated.
    
*   Other order caches are not modified accidentally.
    
*   Event listeners are removed on cleanup.
    
*   Duplicate subscriptions are prevented.
    
*   Reconnection triggers the appropriate data resynchronization.
    
*   Existing custom CRUD hooks continue working.
    
*   Existing query keys and response structures remain compatible.
    

Do not rewrite all existing frontend tests.

Add focused tests using the testing tools and conventions already present in the repository.

**8\. NODE.JS AND GRPC PRESERVATION**

The Node.js warehouse service remains responsible for warehouse and inventory operations.

Requirements:

*   Preserve existing gRPC contracts.
    
*   Preserve existing protobuf definitions.
    
*   Preserve existing warehouse functionality.
    
*   Do not replace gRPC with RabbitMQ.
    
*   Do not move email responsibilities into Node.js.
    
*   Do not introduce unnecessary warehouse-service dependencies on the new notification infrastructure.
    
*   Preserve existing stock validation and reservation workflows.
    
*   Ensure warehouse operations are safe against duplicate requests where necessary.
    

Only modify Node.js if there is a genuine integration requirement.

**9\. INFRASTRUCTURE AND ENVIRONMENT**

Inspect the current Docker Compose and deployment setup.

Update it only where necessary.

Requirements:

*   Add RabbitMQ if it is not already configured.
    
*   Configure persistent RabbitMQ storage.
    
*   Add appropriate health checks.
    
*   Configure Reverb if needed and compatible.
    
*   Keep the email worker independent from Reverb.
    
*   Keep the warehouse service independent from the email worker.
    
*   Add required environment-variable examples without real credentials.
    
*   Respect the existing Docker networking conventions.
    
*   Do not expose management interfaces unnecessarily.
    
*   Document all independent processes.
    

**10\. AUTOMATED TESTING AND ACCEPTANCE CRITERIA**

Add automated tests using the testing frameworks already established in the repository.

At minimum verify:

**Backend tests**

1.  Creating an order persists both the order and outbox event transactionally.
    
2.  A rolled-back transaction does not leave a committed order event.
    
3.  Failed RabbitMQ publication does not mark the event as published.
    
4.  Successful publication marks the event only after broker confirmation.
    
5.  Email processing acknowledges messages only after successful handling.
    
6.  Temporary failures retry correctly.
    
7.  Permanent failures eventually reach DLQ.
    
8.  Duplicate event delivery does not create duplicate notification records or unnecessary duplicate emails.
    
9.  OrderCreated broadcasts after commit.
    
10.  Unauthorized users cannot subscribe to admin.orders.
    
11.  Customers cannot subscribe to other customers’ order channels.
    
12.  A successful status update broadcasts to the correct customer.
    

**Frontend tests**

1.  Admin receives a new order event without page refresh.
    
2.  Customer receives an order status update without page refresh.
    
3.  QueryClient updates only the intended queries.
    
4.  Existing CRUD hooks retain their current behavior.
    
5.  Existing query key conventions remain intact.
    
6.  WebSocket listener cleanup works correctly.
    
7.  Reconnection triggers the necessary data synchronization.
    
8.  Pagination and filtering behavior remains correct.
    

Do not claim tests passed if they were not actually executed.

**11\. MANUAL ACCEPTANCE SCENARIOS**

**Scenario 1: Email Worker Failure**

*   Start Laravel, RabbitMQ, Reverb, and the outbox publisher.
    
*   Stop only the email worker.
    
*   Create a new order.
    
*   Verify that order creation returns without waiting for email delivery.
    
*   Verify that the admin dashboard shows the new order immediately.
    
*   Verify that the email message remains safely available.
    
*   Restart the email worker.
    
*   Verify that the email gets processed successfully.
    

**Scenario 2: Real-Time Customer Update**

*   Open a customer’s order-tracking page.
    
*   Open the admin dashboard.
    
*   Approve the order from the admin dashboard.
    
*   Verify that the customer’s order status changes immediately.
    
*   No page refresh should be required.
    
*   Verify that the TanStack Query cache contains the updated order.
    

**Scenario 3: Authorization**

*   Attempt to subscribe as a customer to another customer’s order channel.
    
*   Attempt to subscribe as a regular customer to admin.orders.
    
*   Both attempts must be rejected.
    

**Scenario 4: Frontend Architecture Preservation**

*   Verify that the existing custom CRUD hooks still exist.
    
*   Verify that their functionality has not been unnecessarily modified.
    
*   Verify that all existing API fetching logic remains in its original architectural layer.
    
*   Verify that WebSocket integration is isolated in dedicated real-time hooks/services.
    
*   Verify that React Query remains responsible for server state.
    
*   Verify that unrelated frontend components and functionality were not refactored.
    

**12\. IMPLEMENTATION WORKFLOW**

Follow these phases.

**Phase 1: Complete Repository Audit**

Inspect the relevant backend, infrastructure, and frontend.

Before implementation, identify:

*   Current order lifecycle.
    
*   Existing asynchronous processing.
    
*   Existing queue configuration.
    
*   Existing email implementation.
    
*   Existing broadcasting solution.
    
*   Existing Node.js/gRPC integration.
    
*   Existing React Query architecture.
    
*   Existing custom CRUD hooks.
    
*   QueryClient configuration.
    
*   Query key conventions.
    
*   Frontend authentication and authorization.
    

Produce a concise implementation plan based on actual repository findings.

**Phase 2: Reliable Backend Messaging**

Implement:

*   Transactional outbox.
    
*   RabbitMQ topology.
    
*   Outbox publisher.
    
*   Email worker.
    
*   Retry logic.
    
*   DLQ.
    
*   Idempotency.
    

**Phase 3: Real-Time Backend**

Implement:

*   Reverb configuration if needed.
    
*   Broadcast events.
    
*   Private channels.
    
*   Channel authorization.
    
*   Post-commit broadcasting.
    

**Phase 4: Frontend Integration**

Implement:

*   Shared WebSocket infrastructure if required by the existing architecture.
    
*   Dedicated real-time hooks/services.
    
*   Admin new-order event handling.
    
*   Customer order-status event handling.
    
*   Targeted React Query cache synchronization.
    
*   Reconnection and cleanup behavior.
    

Preserve all existing CRUD hooks and frontend conventions.

**Phase 5: Infrastructure**

Update Docker Compose and environment examples as necessary.

Document commands for starting:

*   Laravel application.
    
*   RabbitMQ.
    
*   Outbox publisher.
    
*   Email worker.
    
*   Reverb.
    
*   Existing Node.js warehouse service.
    

**Phase 6: Verification**

Run:

*   Relevant database migrations.
    
*   Backend tests.
    
*   Frontend tests.
    
*   Formatting tools.
    
*   Static analysis where available.
    
*   Frontend production build.
    
*   Relevant integration tests.
    

Fix regressions caused by your changes.

Run the manual acceptance scenarios when the environment permits.

**13\. AUTONOMOUS DECISION-MAKING AND CHANGE CONTROL**

You are expected to own the implementation decisions.

Do not ask the user to manually choose between implementation details that can be determined by inspecting the codebase.

However:

*   Do not make unnecessary architectural decisions.
    
*   Prefer minimal changes.
    
*   Reuse existing abstractions.
    
*   Do not expand the scope beyond the requirements.
    
*   Do not silently change existing behavior.
    
*   Do not remove existing functionality.
    
*   Do not perform unrelated cleanup or refactoring.
    

If you discover that a requirement conflicts with the existing architecture, identify the conflict, choose the least disruptive valid solution, and document the decision.

For changes to shared infrastructure or generic abstractions, be especially conservative.

The goal is a focused production-quality implementation, not an architectural rewrite.

**14\. FINAL DELIVERABLES**

When implementation is complete, provide:

1.  Architecture summary of the implemented solution.
    
2.  List of modified and added backend files and their responsibilities.
    
3.  List of modified and added frontend files and their responsibilities.
    
4.  Confirmation of which existing custom CRUD hooks were preserved.
    
5.  Any existing hooks that had to be changed and the exact reason.
    
6.  Any new dependencies and why they were necessary.
    
7.  Database migrations and deployment steps.
    
8.  Required environment variables.
    
9.  Exact commands to start every independent process.
    
10.  Tests executed and actual test results.
    
11.  Manual instructions for all acceptance scenarios.
    
12.  Known limitations and remaining work.
    

Clearly distinguish between:

*   Implemented and tested.
    
*   Implemented but not fully integration-tested.
    
*   Not implemented due to environmental or compatibility limitations.
    

**15\. QUALITY STANDARD**

Treat this as a real distributed e-commerce application, not a demo or a collection of disconnected snippets.

Maintain clear separation between:

*   Laravel business logic and order ownership.
    
*   Node.js warehouse responsibilities through gRPC.
    
*   RabbitMQ background processing.
    
*   Transactional Outbox reliability.
    
*   WebSocket real-time delivery.
    
*   TanStack Query server-state management.
    
*   Existing frontend custom CRUD hooks.
    
*   Frontend presentation.
    

Prioritize:

*   Correctness.
    
*   Reliability.
    
*   Security.
    
*   Idempotency.
    
*   Observability.
    
*   Maintainability.
    
*   Backward compatibility.
    
*   Minimal changes to the existing codebase.
    

**The existing frontend CRUD architecture must remain intact. Real-time functionality must be integrated as an additional layer on top of the current React Query implementation.**

Start with the repository audit, then proceed to full implementation and verification.