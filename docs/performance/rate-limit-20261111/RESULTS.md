# Native k6 rate-limit verification

Measured on 2026-11-11 using the current compression workload, five virtual users,
a 5/20/5-second ramp/hold/down, and one-second think time. These are two individual
runs on the current deployment; they do not replace the historical optimization
baseline.

| Target | HTTP requests | HTTP 200 | HTTP 429 | Failed requests | Failed checks |
|---|---:|---:|---:|---:|---:|
| Direct: localhost:8000/api | 115 | 60 | 55 | 47.83% | 165 of 345 |
| Trusted proxy: localhost:8086/api | 123 | 123 | 0 | 0% | 0 of 369 |

The workload performs three checks per response. Proxy-run p95 latency was
67.51 ms. Its decoded product JSON checks also passed. Results were exported
with `--no-thresholds`; the exported metrics were checked separately for errors.

The product limiter allows 60 requests per minute per client IP. Laravel trusts
forwarded client IPs only from the configured benchmark proxy (`172.29.30.10`).
Native k6 hitting port 8000 connects directly and all five VUs share the same
client IP and limit. Their supplied `X-Forwarded-For` headers are ignored on that
untrusted connection. `RUN_ID` alone therefore cannot fix direct requests.

The optional [host override](../../../perf/host-k6.compose.yml) binds the existing
proxy to `127.0.0.1:8086`. Requests then pass through the trusted proxy, which
forwards the workload's distinct simulated client IP per VU. Each VU stays below
60 requests in this short run. No API rate-limit or trusted-proxy configuration
was changed. Normal application traffic continues to use port 8000.

See [native k6 instructions](../../../perf/README.md#run-native-windows-k6-through-the-benchmark-proxy)
for startup, the Windows command, repeated-run considerations, and shutdown.
Use `http://` without a backslash before the colon in PowerShell.

Raw evidence: [direct summary](./direct.json), [direct log](./direct.log),
[proxy summary](./via-proxy.json), and [proxy log](./via-proxy.log).
