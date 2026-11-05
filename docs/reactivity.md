<!-- Generated for Qbits 0.1.0 by npm run sync. -->
# Reactivity and transactions

State, props and instance fields use fine-grained signals. Effects clear and rebuild their
dependency sets on each run; computed signals cache values, invalidate derived descendants
and notify DOM effects only when their result changes. Static text/value/checked bindings
are initialized directly and create no effect.

Handlers, nested class actions, lifecycle statements and child-prop refreshes participate
in one synchronous transaction. The journal records the first committed value of each
directly written signal in reused arrays. Measured transaction sizes use a compact linear
journal; numeric validation happens before a value is accepted.

Conditional branches and keyed records prepare in detached fragments. Preparation can
subscribe and mount children, but committed ranges are not moved or disposed until every
reactive effect has completed successfully. Rollback disposes staged scopes, restores
signals and reruns affected subscribers. Recovery failure reports an aggregate error and
disables participating components. Successful structural commit updates DOM/maps first,
then disposes removed scopes. A throwing removed-scope cleanup is therefore a reported
post-commit error, not a rollback request.

Transactions end before trusted host cleanup code runs and never cross an asynchronous
boundary. JavaScript getters, proxies and component mount/cleanup functions can execute
arbitrary host code and must be reviewed by the application. See security.md and
limitations.md for the trust and resource boundaries.
