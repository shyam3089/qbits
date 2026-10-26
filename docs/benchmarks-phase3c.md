# Phase 3C framework benchmarks

Phase 3C compares the unchanged Qubits runtime at commit `67bf3ff9837adfafad956bfb84fe4a60dfcc1dbf`
with React 19.3.1, Angular 21.2.25 and Vue 3.5.44. These results are observations on one
Windows x64 host with Node 22.22.2 and Firefox 157.0, not general superiority claims.
The complete machine-readable samples, verification hashes, environment and sizes are in
[`frameworks-2026-10-25-phase3c.json`](benchmarks/frameworks-2026-10-25-phase3c.json).

## Method

The isolated workspace in `benchmarks/framework-comparison` pins every framework and build
tool in its own lockfile. Qubits, React and Vue use minified Vite production builds; Angular
uses its production AOT builder with zoneless change detection. No benchmark dependency is
added to a production package or packed artifact. All apps use the same deterministic data,
CSS, element/class/text tree and controls for 1k/10k keyed rows, nested components and a
1k-product catalog.

Before and during measurement the Firefox runner compares SHA-256 hashes of exact descendant DOM
output, checks element counts and isolated updates, and proves keyed moves retain the same DOM
node. Each of 15 paired samples uses a fresh Firefox context and `no-store` responses; framework
order rotates after three discarded warmup pairs. Cold startup runs from navigation start to API
installation with a warm OS filesystem cache. Mount uses a blank root. Updates and reorders time
fixed click batches through framework settlement and divide by the common repetition count.
Median/p95 below are milliseconds; JS size is the sum of production JavaScript files.

## Results

| Workload | Framework | Cold start | Mount | Isolated update | Keyed reorder | JS gzip |
|---|---|---:|---:|---:|---:|---:|
| Rows 1k | Qubits | 74/128 | 41/53 | 0.050/0.100 | 2.100/3.000 | 82,912 B |
|  | React | 73/101 | 27/49 | 7.300/11.500 | 12.200/14.500 | 69,996 B |
|  | Angular | 55/123 | 34/44 | 0.550/1.200 | 0.800/2.800 | 37,247 B |
|  | Vue | 49/93 | 29/78 | 3.350/4.700 | 5.900/8.300 | 26,614 B |
| Rows 10k | Qubits | 85/254 | 300/498 | 0.200/0.400 | 12.667/18.000 | 82,912 B |
|  | React | 72/92 | 207/263 | 76.800/119.200 | 441.333/636.667 | 69,996 B |
|  | Angular | 66/109 | 223/247 | 3.600/20.600 | 6.667/21.667 | 37,247 B |
|  | Vue | 55/118 | 201/531 | 33.000/111.600 | 56.667/147.000 | 26,614 B |
| Nested 1k | Qubits | 71/224 | 50/183 | 0.050/0.150 | — | 82,912 B |
|  | React | 65/124 | 27/101 | 0.550/3.350 | — | 69,996 B |
|  | Angular | 70/262 | 48/298 | 0.500/1.850 | — | 37,247 B |
|  | Vue | 52/142 | 57/213 | 0.150/0.450 | — | 26,614 B |
| Catalog 1k | Qubits | 84/180 | 50/120 | 0.050/0.150 | — | 82,912 B |
|  | React | 64/126 | 26/71 | 0.550/1.150 | — | 69,996 B |
|  | Angular | 57/120 | 56/178 | 0.600/1.900 | — | 37,247 B |
|  | Vue | 46/59 | 45/59 | 0.100/0.250 | — | 26,614 B |

## Phase 3C.1 optimized results

Phase 3C.1 replaces compiled benchmark records and component instances with typed API-state
seeding while retaining the same DOM, controls, update semantics and reusable components. It also
emits model literals without startup JSON parsing, specializes static bindings, and shares DOM-node
release accounting per cleanup scope. The 2026-10-26 run used the same pinned versions, Firefox-only
method, three warmups and 15 paired samples. Raw samples and verification hashes are in
[`frameworks-2026-10-26-phase3c1.json`](benchmarks/frameworks-2026-10-26-phase3c1.json).

| Workload | Framework | Cold start | Mount | Isolated update | Keyed reorder | JS gzip |
|---|---|---:|---:|---:|---:|---:|
| Rows 10k | Qubits | 64/94 | 323/401 | 0.200/0.400 | 15.000/23.667 | 7,749 B |
|  | React | 88/167 | 276/396 | 88.800/104.800 | 478.667/552.000 | 69,996 B |
|  | Angular | 97/124 | 342/411 | 4.000/7.200 | 9.333/12.667 | 37,247 B |
|  | Vue | 78/112 | 275/322 | 39.800/51.400 | 64.333/90.000 | 26,614 B |
| API catalog 1k | Qubits | 64/108 | 69/111 | 0.050/0.100 | — | 7,749 B |
|  | React | 93/136 | 34/56 | 0.800/2.050 | — | 69,996 B |
|  | Angular | 80/142 | 69/101 | 0.750/1.500 | — | 37,247 B |
|  | Vue | 73/111 | 50/87 | 0.150/0.350 | — | 26,614 B |

Against the Phase 3C Qubits baseline, gzip fell 90.7% (82,912 to 7,749 bytes) and 10k cold
startup median fell 24.7% (85 to 64 ms). The 10k mount median regressed 7.7% (300 to 323 ms),
although p95 improved 19.5% (498 to 401 ms); the 201 ms historical Vue target was not reached.
Isolated updates remained 0.2/0.4 ms. Keyed reorder median regressed 2.3 ms and remains much
faster than React and Vue but slower than Angular in this run. Nested 1k was 65/100 ms startup,
78/108 ms mount and 0.05/0.15 ms update; rows 1k was 63/86, 51/68, 0.1/0.15 and 2.1/3.9.

## Tradeoffs and bottlenecks

Qubits performs targeted subscribed-text updates and keyed DOM moves, explaining its low update
cost, but its 10k mount still trails React and Vue in the Phase 3C.1 run. Typed initial-state
hydration removes static-data bundle overhead but validates and allocates a class instance, field
signals, record anchors and binding effects for every item during mount. React's idiomatic immutable row-array
updates and virtual-tree keyed reconciliation dominate its 10k update/reorder results; Vue shows
the same scaling at lower cost. Angular's signals and `@for` tracking are competitive on keyed
operations, while its mount p95 is noisy. These state-model differences are real framework
tradeoffs, but mean the table should not be read as a universal ranking.

Firefox exposed neither `performance.memory` nor `measureUserAgentSpecificMemory`, so memory is
recorded as unsupported rather than replaced with a Chromium-only or process-wide proxy. The
millisecond timer still limits individual observations; batching improves resolution, while the
startup and mount tails show scheduler/JIT variance. Re-run on additional machines before making
capacity decisions.

## Reproduce

From `benchmarks/framework-comparison`, run `npm ci --legacy-peer-deps`, `npm run build`,
`npm run verify`, then `npm run bench`. The root aliases are `npm run bench:frameworks:build`,
`npm run bench:frameworks:verify`, and `npm run bench:frameworks`. Firefox is the only browser
used by the runner.
