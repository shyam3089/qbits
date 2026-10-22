# Security

Report suspected vulnerabilities privately to the repository owner through an
available private channel; a dedicated reporting address is not yet established.
Do not post exploit details or secrets in public issues. Include affected version,
reproduction, impact, and suggested mitigation. No response-time guarantee exists.

Treat source files as untrusted input. Parsing does not execute application code.
Generated text is serialized; runtime uses text nodes. These are implemented
controls, not a sandbox or resource-limit guarantee. Vite configs, application
JavaScript and npm dependencies run with normal host permissions. Reviewing them,
using a lockfile and independent human review are recommendations/process policies.
See installed docs/security.md for the explicit controls/recommendations distinction.
Do not introduce eval,
dynamic source execution, HTML insertion, community plugin loading, or build steps
that decode/execute fixture payloads. Vite's development server is local-only;
do not expose it as a production service. The scaffolder refuses existing targets
and never runs dependency installation. While private it requires a local main
package tarball, avoiding an assumed registry identity. init runs only on explicit invocation,
preserves unmanaged instructions/scripts and rejects ambiguous managed markers
and symlink instruction files. No postinstall modifies user projects or installs
agent integrations. These filesystem checks do not promise protection from
concurrent malicious filesystem changes.

GitHub Actions jobs are disabled in the retained CI configuration.
CI uses read-only repository permissions, no publishing credentials, and ordinary
pull_request events, never pull_request_target. Untrusted PR code must not receive
secrets or privileged runners. Security-sensitive changes require independent
human review. Policy documents do not enforce hosting permissions. Use the lockfile
and review dependency updates. Phase 2E hardening is in progress; no public support SLA.
