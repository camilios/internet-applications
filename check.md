\# Homework Compliance Checklist



\## Purpose



You are an AI agent auditing an e-commerce project against the homework described in three Arabic images:



\- 1.jpeg: Project overview, functional requirements, API Design \& Security.

\- 2.jpeg: Communication between services using gRPC.

\- 3.jpeg: Performance \& Caching.



Check every requirement below. Do not assume a requirement is satisfied merely because documentation claims it is.



\## Audit instructions



1\. Inspect the source code, configuration, database schema, API documentation, service contracts, and available test results.

2\. Assign each checklist item a status:

&#x20;  - PASS: Fully implemented and supported by evidence.

&#x20;  - PARTIAL: Implemented incompletely.

&#x20;  - FAIL: Missing or incorrect.

&#x20;  - UNVERIFIED: Insufficient evidence or runtime access.

3\. Cite evidence: file paths and line numbers, configuration, API responses, logs, query plans, or measured results.

4\. Distinguish implementation evidence from verified runtime behavior.

5\. Never invent test results or performance measurements.

6\. Evaluate all requirements individually, including every failure case and required demonstration.

7\. Do not add requirements that the homework does not specify.

8\. Treat the homework as acceptance criteria, not authorization to modify or deploy the project.

9\. Audit first. Modify the project only if separately requested.

10\. The assignment requires implementing the three main requirements in order, starting with Requirement 1. Evaluation takes place through interviews.



Verification suggestions below explain how to check requirements; they do not introduce additional instructor requirements.



\---



\## 1. Project overview



Course: Internet Applications project, academic semester 2026.



The project is an e-commerce platform composed of multiple cooperating services, handling concurrent requests and real-time updates.



The focus is applying nonfunctional concepts:

\- Security.

\- Communication between services.

\- Performance.

\- Asynchronous processing.

\- Scalability.

\- Monitoring.



The objective is to demonstrate these concepts and handle technical failures under pressure. A large number of features or pages is not the objective.



\### Checklist



\- \[ ] P01. The project implements an e-commerce platform.

\- \[ ] P02. Multiple services cooperate.

\- \[ ] P03. The system handles concurrent requests.

\- \[ ] P04. The system supports real-time updates.

\- \[ ] P05. Security is addressed.

\- \[ ] P06. Inter-service communication is addressed.

\- \[ ] P07. Performance is addressed.

\- \[ ] P08. Asynchronous processing is addressed.

\- \[ ] P09. Scalability is addressed.

\- \[ ] P10. Monitoring is addressed.

\- \[ ] P11. The system demonstrates handling technical failures under pressure.



For P04 and P08–P10, identify actual project behavior and evidence. The provided homework does not prescribe specific technologies or detailed implementations for these themes.



\## 2. Basic functional requirements



\- \[ ] F01. Users can register.

\- \[ ] F02. Products can be added.

\- \[ ] F03. Product images can be attached/uploaded.

\- \[ ] F04. Products can be displayed.

\- \[ ] F05. Orders can be created.

\- \[ ] F06. Inventory can be managed.

\- \[ ] F07. Order status can be tracked.



The team may add suitable functions, provided they support the project requirements.



The original interface is not evaluated for design. Do not make visual polish an acceptance requirement.



\---



\## 3. Requirement 1: API Design \& Security



Goal: Build a secure, documented API that a new user can understand and use.



\### 3.1 Technology and structure



\- \[ ] A01. Identify the chosen language and framework. The team may choose freely.

\- \[ ] A02. The code is organized into separate modules.

\- \[ ] A03. There is a users module.

\- \[ ] A04. There is a products module.

\- \[ ] A05. There is an orders module.

\- \[ ] A06. There is a notifications module.

\- \[ ] A07. The entire project runs using Docker.



Verify that Docker actually starts the necessary project components. A Dockerfile alone does not prove compliance.



\### 3.2 Product REST API



\- \[ ] A08. Product functionality is exposed through REST APIs.

\- \[ ] A09. Products can be added.

\- \[ ] A10. Adding a product supports uploading an image.

\- \[ ] A11. Products can be displayed/listed.

\- \[ ] A12. Products can be filtered by category.

\- \[ ] A13. Product listing supports pagination.



\### 3.3 Order REST API



\- \[ ] A14. Order functionality is exposed through REST APIs.

\- \[ ] A15. Orders can be created.

\- \[ ] A16. Orders can be displayed/listed.

\- \[ ] A17. Order status can be changed.

\- \[ ] A18. Orders can be cancelled.



\### 3.4 Responses and documentation



\- \[ ] A19. APIs return appropriate HTTP status codes.

\- \[ ] A20. Errors use a consistent response format.

\- \[ ] A21. Documentation makes API endpoints easy to try.

\- \[ ] A22. OpenAPI/Swagger, a Postman Collection, or an equivalent easy API-testing tool is provided.



Swagger and Postman are alternatives/examples; both are not required.



Check whether the supplied documentation is usable for the required operations, including authentication and necessary request details.



\### 3.5 Authentication and authorization



\- \[ ] A23. Authentication uses JWT.

\- \[ ] A24. Authorization uses roles.

\- \[ ] A25. Customer permissions are implemented.

\- \[ ] A26. Administrator/manager permissions are implemented.

\- \[ ] A27. A customer can view their own orders.

\- \[ ] A28. A customer cannot view another customer's orders.

\- \[ ] A29. An administrator/manager can view all orders.

\- \[ ] A30. An administrator/manager can change order status.



Verify authorization on the server. Hiding controls in the interface is insufficient.



\### 3.6 Protection



\- \[ ] A31. Login attempts are rate-limited.

\- \[ ] A32. Basic security headers are added.



Identify the actual security headers. The homework does not specify an exact header list or rate-limit threshold.



\### 3.7 Explicitly required proof



\- \[ ] A33. Demonstrate that a user attempting to access someone else's order is rejected.

\- \[ ] A34. Demonstrate that a user attempting an action outside their permissions is rejected.



Suggested verification:

\- Create or use two customer accounts.

\- Authenticate as customer A.

\- Request an order owned by customer B.

\- Record the rejection.

\- Attempt an administrator-only operation as a customer.

\- Record the rejection.

\- Confirm that the legitimate owner and authorized administrator can perform their allowed operations.



Retain actual requests/responses and identify the corresponding authorization implementation.



\---



\## 4. Requirement 2: Communication between services



Goal: Separate inventory management into an independent service and communicate with it directly using gRPC.



\### 4.1 Inventory service



\- \[ ] G01. Inventory management is separated into an independent service.

\- \[ ] G02. The inventory service acts as a gRPC server.

\- \[ ] G03. The main application communicates directly with it using gRPC.

\- \[ ] G04. The inventory service uses a different library, language, or framework from the main application, as stated in the polyglot-service requirement.

\- \[ ] G05. The inventory service has its own database.



For G04, identify exactly what differs. Do not insist on a different programming language if a different library/framework satisfies the stated alternative.



\### 4.2 Contract



\- \[ ] G06. A `.proto` file defines the service contract.

\- \[ ] G07. The contract includes an operation for checking/querying quantity.

\- \[ ] G08. The contract includes an operation for reserving quantity.

\- \[ ] G09. The contract includes an operation for releasing/returning reserved quantity.



\### 4.3 Product details



\- \[ ] G10. When displaying product details, the main application asks the inventory service for available quantity.

\- \[ ] G11. Available quantity is included with the product details.



\### 4.4 Creating an order



\- \[ ] G12. The main application sends one inventory-service request containing all products/items in the order.

\- \[ ] G13. The inventory service checks all requested quantities together.

\- \[ ] G14. The inventory service reserves all requested quantities together.

\- \[ ] G15. The order is created if the inventory service approves.

\- \[ ] G16. The order is not created if the inventory service rejects the request.



\### 4.5 Required failure cases



\#### Insufficient inventory



\- \[ ] G17. An order is rejected when quantity is insufficient.

\- \[ ] G18. The user receives a clear message.



\#### Inventory service unavailable or unresponsive



\- \[ ] G19. An unavailable inventory service is handled correctly.

\- \[ ] G20. A defined timeout exists for an inventory service that does not respond.

\- \[ ] G21. The user does not wait indefinitely.

\- \[ ] G22. The user receives a clear response.



\#### Order persistence fails after reservation



\- \[ ] G23. If inventory has been reserved but saving the order fails, the reserved quantity is returned to inventory.



\### 4.6 Explicitly required concurrency proof



\- \[ ] G24. Test several simultaneous order requests for the same product.

\- \[ ] G25. Demonstrate that no race condition occurs.

\- \[ ] G26. Demonstrate that a request is accepted only when sufficient inventory is available.



Suggested verification:

1\. Start with a known stock quantity.

2\. Submit simultaneous orders whose total demand exceeds that stock.

3\. Record accepted and rejected orders.

4\. Verify that accepted reservations do not exceed available stock.

5\. Verify that final stock matches successful reservations.

6\. Exercise insufficient-stock, service-unavailable, timeout, and failed-order-save cases.

7\. Exercise an order containing multiple products, including a case where one product lacks sufficient stock.



The homework does not mandate a particular lock, transaction mechanism, or compensation implementation.



\---



\## 5. Requirement 3: Performance \& Caching



Goal: Make the system faster and prove improvement numerically.



\### 5.1 Database volume and query performance



\- \[ ] C01. Generate a large volume of synthetic data.

\- \[ ] C02. The dataset includes hundreds of thousands of orders.

\- \[ ] C03. Record the actual generated data counts.

\- \[ ] C04. Identify slow queries.

\- \[ ] C05. Analyze slow queries using `EXPLAIN`.

\- \[ ] C06. Optimize the slow queries.

\- \[ ] C07. Provide evidence that the optimized queries became faster.

\- \[ ] C08. Identify and resolve N+1 query problems.



Keep relevant queries, query plans, timing results, and query-count evidence.



The assignment specifies a large scale, including hundreds of thousands of orders, but no exact order count.



\### 5.2 Read replica



\- \[ ] C09. A database read replica is configured.

\- \[ ] C10. The replica is used for reads.

\- \[ ] C11. The user can see what they have just created despite potential replication delay.



Suggested verification:

\- Create a record through the application.

\- Immediately read it through the user-facing flow.

\- Confirm visibility.

\- Explain the read routing or consistency strategy used.



A replica configuration alone does not prove read-after-write behavior.



\### 5.3 Redis server-side caching



\- \[ ] C12. Redis caches frequently read data.

\- \[ ] C13. A clear expiration policy exists.

\- \[ ] C14. The expiration policy is implemented.

\- \[ ] C15. A clear cache invalidation/deletion policy exists for modified data.

\- \[ ] C16. The invalidation/deletion policy is implemented.

\- \[ ] C17. Explain which data can be cached.

\- \[ ] C18. Explain which data must not be cached.

\- \[ ] C19. Verify that reads and modifications behave consistently with the declared caching policy.



Suggested verification:

\- Read a cacheable resource repeatedly.

\- Identify evidence of cache use.

\- Modify the underlying resource.

\- Verify the relevant cache is invalidated or updated according to the policy.

\- Verify expiry behavior.



Do not invent a required TTL or a fixed list of cacheable resources.



\### 5.4 HTTP caching with ETag



\- \[ ] C20. HTTP caching uses `ETag`.

\- \[ ] C21. A client can validate previously retrieved content.

\- \[ ] C22. When content has not changed, the server returns HTTP `304`.

\- \[ ] C23. The `304` response does not resend the content body.



Suggested verification:

1\. Request a resource and record its ETag.

2\. Request it again using `If-None-Match`.

3\. Verify unchanged content returns `304` without a body.

4\. Modify the resource.

5\. Repeat the conditional request with the old ETag.

6\. Verify changed content is returned appropriately.



The changed-content scenario checks correct ETag behavior; it is not an additional feature requirement.



\### 5.5 Load testing



\- \[ ] C24. Load testing uses a tool such as k6.

\- \[ ] C25. Load tests are run before optimization.

\- \[ ] C26. Load tests are run after optimization.

\- \[ ] C27. Before-and-after response-time p50 values are recorded.

\- \[ ] C28. Before-and-after response-time p95 values are recorded.

\- \[ ] C29. Before-and-after response-time p99 values are recorded.

\- \[ ] C30. Actual numbers demonstrate the performance improvement.

\- \[ ] C31. The team explains behavior observed during the tests.

\- \[ ] C32. The team explains what happened to the system during the tests.

\- \[ ] C33. The team explains the user-visible impact of modifying a displayed product, preserving the final discussion point in image 3.



Source interpretation note for C33:

The final Arabic sentence refers to “أثر تعديل منتج معروض ... في المستخدم”.

Its exact intended scenario is not fully explicit. Discuss the observed effect on the user when a displayed product is modified, including relevant cache freshness behavior, and flag any remaining uncertainty. Do not silently omit this point or replace it with a generic speed claim.



k6 is an example tool; it is not the only permitted tool.



For credible comparison, record:

\- Environment and configuration.

\- Dataset size.

\- Tested endpoints and workload.

\- Concurrency or arrival rate.

\- Test duration.

\- Relevant differences between the before and after runs.



These details support the requested proof. The homework specifies no fixed latency target or minimum improvement percentage.



\### Benchmark results



Fill this table with real measurements:



| Scenario | Before p50 | After p50 | Before p95 | After p95 | Before p99 | After p99 | Evidence |

| --- | --- | --- | --- | --- | --- | --- | --- |

| To be measured | | | | | | | |



\---



\## 6. Required evidence inventory



\- \[ ] E01. Evidence that access to another customer's order is rejected.

\- \[ ] E02. Evidence that an unauthorized action is rejected.

\- \[ ] E03. Evidence of simultaneous orders for the same product without a race condition.

\- \[ ] E04. Evidence that orders are accepted only when stock is sufficient.

\- \[ ] E05. Evidence of correct insufficient-stock handling.

\- \[ ] E06. Evidence of correct inventory-service unavailability handling.

\- \[ ] E07. Evidence of a defined timeout and clear user response.

\- \[ ] E08. Evidence that failed order saving releases reserved stock.

\- \[ ] E09. Slow-query analysis and `EXPLAIN` evidence.

\- \[ ] E10. Evidence of query optimization and N+1 resolution.

\- \[ ] E11. Evidence of read-replica use and immediate visibility after creation.

\- \[ ] E12. Redis expiration and invalidation evidence.

\- \[ ] E13. ETag and bodyless `304` evidence.

\- \[ ] E14. Before-and-after load-test results containing p50, p95, and p99.

\- \[ ] E15. Explanation of observed system behavior and user impact.



This inventory cross-references requirements above; it does not add new assignment scope.



\---



\## 7. Required audit report



Start with:

\- Overall compliance verdict.

\- Counts of PASS, PARTIAL, FAIL, and UNVERIFIED items.

\- Main blockers to full compliance.



Then report every criterion individually:



| ID | Status | Evidence | Finding / missing detail | Required next action |

| --- | --- | --- | --- | --- |

| P01 | UNVERIFIED | | | |



Include:

1\. All missing or incorrect requirements.

2\. All partially implemented details.

3\. All required demonstrations without sufficient evidence.

4\. Actual performance measurements.

5\. Homework ambiguities or unavailable runtime access.

6\. A prioritized completion plan referencing criterion IDs.



A requirement is not satisfied merely because:

\- A relevant dependency is installed.

\- A configuration file exists.

\- An endpoint or method name exists.

\- A comment says the feature is implemented.

\- The UI hides an unauthorized action.

\- Documentation claims successful tests.

\- Performance is described as “faster” without measurements.



Do not impose unstated requirements such as:

\- Kubernetes.

\- A specific database engine.

\- A message broker.

\- A particular frontend design.

\- A particular inventory locking mechanism.

\- A fixed Redis TTL.

\- Specific endpoint naming.

\- Fixed performance thresholds.



Full compliance requires evidence for every mandatory detail.

