let activeEffect;
let executingEffect;
let capturedReads;
let epoch = 0;
let batchDepth = 0, flushing = false;
const pendingComputed = new Set(), pendingRegions = new Set(), pendingEffects = new Set();
let updateJournal;
function safeInteger(value) { if (!Number.isSafeInteger(value))
    throw new RangeError('Numeric value exceeds the safe integer range (-9007199254740991 to 9007199254740991)'); return value; }
function rememberDirty(source) { if (updateJournal && !updateJournal.dirty.has(source))
    updateJournal.dirty.set(source, source.dirty); }
function signal(value) { if (typeof value === 'number')
    safeInteger(value); return { value, subscribers: new Set() }; }
function read(source) { if (source.derive?.running)
    throw new TypeError('Circular reactive dependency'); if (source.dirty)
    source.derive(); capturedReads?.set(source, source.value); if (activeEffect && !activeEffect.disposed) {
    source.subscribers.add(activeEffect);
    activeEffect.dependencies.add(source);
} return source.value; }
function enqueue(effect) {
    if (effect.disposed)
        return;
    if (effect.propagate) {
        pendingComputed.add(effect);
        return;
    }
    if (effect.structural) {
        pendingRegions.add(effect);
        return;
    }
    if (!effect.computed) {
        pendingEffects.add(effect);
        return;
    }
    if (effect.computed.dirty) {
        pendingComputed.add(effect);
        return;
    }
    rememberDirty(effect.computed);
    effect.computed.dirty = true;
    pendingComputed.add(effect);
    // Invalidate derived descendants now, so reads inside an action see current
    // values. DOM subscribers are queued only if the derived value changes.
    for (const subscriber of effect.computed.subscribers)
        if (subscriber.computed)
            enqueue(subscriber);
}
// Bound scheduler feedback, not legitimate sequential computed reads in actions.
function scheduled(effect) { if (effect.epoch !== epoch) {
    effect.epoch = epoch;
    effect.runs = 0;
} if (++effect.runs > 64)
    throw new TypeError('Reactive update loop detected'); effect(); }
function flush() {
    if (batchDepth || flushing)
        return;
    flushing = true;
    try {
        while (pendingComputed.size || pendingRegions.size || pendingEffects.size) {
            while (pendingComputed.size)
                scheduled(pendingComputed.values().next().value);
            const effect = pendingRegions.values().next().value ?? pendingEffects.values().next().value;
            if (effect)
                scheduled(effect);
        }
    }
    finally {
        flushing = false;
        pendingComputed.clear();
        pendingRegions.clear();
        pendingEffects.clear();
    }
}
function batch(run) {
    if (updateJournal) {
        batchDepth++;
        try {
            return run();
        }
        finally {
            batchDepth--;
        }
    }
    const journal = { values: new Map(), dependencies: new Map(), dirty: new Map(), checks: new Set(), checking: false, plans: new Map(), excluded: new Map() };
    epoch++;
    const computedBefore = new Set(pendingComputed), regionsBefore = new Set(pendingRegions), effectsBefore = new Set(pendingEffects);
    updateJournal = journal;
    batchDepth++;
    let result;
    try {
        result = run();
        // Validate and settle derivations/child props before any DOM effect commits.
        do {
            while (journal.checks.size || pendingComputed.size) {
                journal.checking = true;
                try {
                    for (const check of journal.checks) {
                        journal.checks.delete(check);
                        untracked(check);
                    }
                }
                finally {
                    journal.checking = false;
                }
                while (pendingComputed.size)
                    scheduled(pendingComputed.values().next().value);
            }
            if (pendingRegions.size || pendingEffects.size) {
                const effect = pendingRegions.values().next().value ?? pendingEffects.values().next().value;
                if (journal.excluded.has(effect)) {
                    pendingEffects.delete(effect);
                    pendingRegions.delete(effect);
                    continue;
                }
                scheduled(effect);
            }
        } while (journal.checks.size || pendingComputed.size || pendingRegions.size || pendingEffects.size);
        for (const [effect, plan] of journal.plans)
            if (!effect.disposed && !journal.excluded.has(effect))
                plan.commit();
    }
    catch (error) {
        const failed = new Set();
        for (const plan of [...journal.plans.values()].reverse())
            try {
                plan.rollback();
            }
            catch {
                if (plan.fail)
                    failed.add(plan.fail);
            }
        for (const [source, value] of journal.values)
            source.value = value;
        for (const [effect, dependencies] of journal.dependencies) {
            if (effect.disposed)
                continue;
            for (const source of effect.dependencies)
                source.subscribers.delete(effect);
            effect.dependencies = dependencies;
            for (const source of dependencies)
                source.subscribers.add(effect);
        }
        for (const [source, dirty] of journal.dirty)
            source.dirty = dirty;
        pendingComputed.clear();
        for (const effect of computedBefore)
            pendingComputed.add(effect);
        pendingRegions.clear();
        for (const effect of regionsBefore)
            pendingRegions.add(effect);
        pendingEffects.clear();
        for (const effect of effectsBefore)
            pendingEffects.add(effect);
        for (const dispose of failed)
            try {
                dispose();
            }
            catch { /* Fail closed if host DOM operations cannot be restored. */ }
        throw error;
    }
    finally {
        updateJournal = undefined;
        batchDepth--;
    }
    let failure;
    for (const [effect, plan] of journal.plans)
        try {
            if (effect.disposed || journal.excluded.has(effect))
                plan.rollback();
            else
                plan.finish?.();
        }
        catch (error) {
            failure ??= error;
        }
    flush();
    if (failure)
        throw failure;
    return result;
}
function untracked(run) { const previous = activeEffect; activeEffect = undefined; try {
    return run();
}
finally {
    activeEffect = previous;
} }
function write(source, value) { if (typeof value === 'number')
    safeInteger(value); if (Object.is(source.value, value))
    return; if (updateJournal) {
    if (!updateJournal.values.has(source))
        updateJournal.values.set(source, source.value);
    if (source.validate)
        updateJournal.checks.add(source.validate);
} source.value = value; for (const subscriber of source.subscribers)
    enqueue(subscriber); flush(); }
function createEffect(run, computed, connect) {
    const effect = (() => { if (effect.disposed)
        return; if (effect.running)
        throw new TypeError('Circular reactive dependency'); if (updateJournal && !updateJournal.dependencies.has(effect))
        updateJournal.dependencies.set(effect, new Set(effect.dependencies)); pendingComputed.delete(effect); pendingRegions.delete(effect); pendingEffects.delete(effect); if (computed) {
        rememberDirty(computed);
        computed.dirty = false;
    } for (const source of effect.dependencies)
        source.subscribers.delete(effect); effect.dependencies.clear(); const previous = activeEffect, executing = executingEffect; activeEffect = effect; executingEffect = effect; effect.running = true; try {
        if (connect) {
            connect();
            untracked(run);
        }
        else
            run();
    }
    finally {
        activeEffect = previous;
        executingEffect = executing;
        effect.running = false;
    } });
    effect.dependencies = new Set();
    effect.disposed = false;
    effect.computed = computed;
    effect.running = false;
    effect.epoch = -1;
    effect.runs = 0;
    if (computed) {
        computed.derive = effect;
        computed.dirty = true;
    }
    else
        try {
            effect();
        }
        catch (error) {
            stop(effect);
            throw error;
        }
    return effect;
}
function stop(effect) { if (effect.disposed)
    return; effect.disposed = true; pendingComputed.delete(effect); pendingRegions.delete(effect); pendingEffects.delete(effect); for (const source of effect.dependencies)
    source.subscribers.delete(effect); effect.dependencies.clear(); }
// Indices of the longest ordered group of retained records. Reconciliation only
// moves records outside this group; new records use the sentinel -1.
function orderedIndices(positions) {
    const tails = [], previous = new Array(positions.length).fill(-1);
    positions.forEach((position, index) => { if (position < 0)
        return; let low = 0, high = tails.length; while (low < high) {
        const middle = (low + high) >>> 1;
        if (positions[tails[middle]] < position)
            low = middle + 1;
        else
            high = middle;
    } if (low)
        previous[index] = tails[low - 1]; tails[low] = index; });
    const result = new Set();
    let index = tails[tails.length - 1];
    while (index !== undefined && index >= 0) {
        result.add(index);
        index = previous[index];
    }
    return result;
}
export function mountComponent(target, model, components, supplied = {}) {
    const scope = Object.create(null);
    const ownedEffects = [];
    const cleanups = [];
    let disposed = false;
    const writable = new WeakSet(), listTypes = new WeakMap();
    const valueType = (value) => Array.isArray(value) ? `list:${value.length ? valueType(value[0]) : 'unknown'}` : typeof value === 'object' ? `class:${value.__class}` : typeof value;
    const matches = (value, type) => type.startsWith('list:') ? Array.isArray(value) && value.every(item => matches(item, type.slice(5))) : valueType(value) === type;
    for (const key of Object.keys(supplied))
        if (key !== 'class' && !Object.hasOwn(model.props, key))
            throw new TypeError(`Unknown prop ${key}`);
    for (const [name, initial] of Object.entries(model.props)) {
        const value = Object.hasOwn(supplied, name) ? supplied[name] : initial;
        if (typeof value !== typeof initial)
            throw new TypeError(`Invalid prop ${name}`);
        scope[name] = signal(value);
    }
    const getSignal = (name, local) => { const value = local[name]; if (!value || typeof value === 'function' || '__class' in value)
        throw new TypeError(`Unknown writable value ${name}`); return value; };
    function connect(expressions, local) {
        if (expressions.some(expression => expression.dependencies === undefined))
            return;
        const paths = expressions.flatMap(expression => expression.dependencies);
        return () => { for (const path of paths) {
            let value = evaluate({ kind: 'reference', name: path[0] }, local);
            for (let i = 1; i < path.length; i++)
                value = member(value, path[i]);
        } };
    }
    function derived(instance, name) {
        let cache = instance.cache.get(name);
        if (!cache) {
            cache = { value: '', inputs: new Map(), running: false, valid: false };
            instance.cache.set(name, cache);
        }
        if (cache.running)
            throw new TypeError(`Circular reactive dependency in ${instance.__class}.${name}`);
        let valid = cache.valid;
        for (const [source, value] of cache.inputs)
            if (!Object.is(source.value, value)) {
                valid = false;
                break;
            }
        if (valid) {
            for (const source of cache.inputs.keys())
                read(source);
            return cache.value;
        }
        const previous = capturedReads, inputs = new Map();
        capturedReads = inputs;
        cache.running = true;
        try {
            const value = evaluate(instance.computed[name], instance.scope);
            cache.value = value;
            cache.inputs = inputs;
            cache.valid = true;
            return value;
        }
        finally {
            capturedReads = previous;
            for (const [source, value] of inputs)
                previous?.set(source, value);
            cache.running = false;
        }
    }
    function member(owner, name) {
        if (!owner || typeof owner !== 'object' || Array.isArray(owner) || !('__class' in owner))
            throw new TypeError('Member access requires a class instance');
        const field = owner.fields[name];
        if (field)
            return read(field);
        if (Object.hasOwn(owner.computed, name))
            return derived(owner, name);
        throw new TypeError(`Unknown member ${name}`);
    }
    function evaluate(expression, local = scope) {
        if (expression.kind === 'literal')
            return typeof expression.value === 'number' ? safeInteger(expression.value) : expression.value;
        if (expression.kind === 'reference') {
            const value = local[expression.name];
            if (!value)
                throw new TypeError(`Unknown value ${expression.name}`);
            return typeof value === 'function' ? value() : '__class' in value ? value : read(value);
        }
        if (expression.kind === 'member')
            return member(evaluate(expression.object, local), expression.name);
        if (expression.kind === 'str')
            return String(evaluate(expression.argument, local));
        if (expression.kind === 'len') {
            const value = evaluate(expression.argument, local);
            if (!Array.isArray(value))
                throw new TypeError('len requires a list');
            return value.length;
        }
        if (expression.kind === 'add') {
            const left = evaluate(expression.left, local), right = evaluate(expression.right, local);
            if (typeof left === 'number' && typeof right === 'number')
                return safeInteger(safeInteger(left) + safeInteger(right));
            if (typeof left === 'string' && typeof right === 'string')
                return left + right;
            throw new TypeError('Addition requires two strings or two safe integers');
        }
        if (expression.kind === 'list')
            return expression.items.map(item => evaluate(item, local));
        if (expression.kind === 'construct')
            return instantiate(expression.name, expression.arguments.map(item => evaluate(item, local)));
        throw new TypeError('Unsupported expression');
    }
    function instantiate(name, args) {
        const declaration = model.classes[name];
        if (!declaration)
            throw new TypeError(`Unknown class ${name}`);
        if (args.length !== declaration.fields.length)
            throw new TypeError(`Class ${name} requires ${declaration.fields.length} field values`);
        const instanceScope = Object.create(null);
        const instance = { __class: name, fields: Object.create(null), computed: declaration.computed, actions: declaration.actions, scope: instanceScope, cache: new Map() };
        const validate = () => { for (const name of Object.keys(declaration.computed))
            derived(instance, name); };
        declaration.fields.forEach((field, index) => { const initial = evaluate(field.initial, instanceScope), value = args[index]; if (typeof value !== typeof initial)
            throw new TypeError(`Invalid class field ${field.name}`); const source = signal(value); source.validate = validate; writable.add(source); instance.fields[field.name] = source; instanceScope[field.name] = source; });
        // Class derivations stay lazy: consumers subscribe directly to fields,
        // without a class-level effect that would outlive a removed list record.
        for (const name of Object.keys(declaration.computed))
            instanceScope[name] = () => derived(instance, name);
        if (updateJournal && !updateJournal.checking)
            updateJournal.checks.add(validate);
        return instance;
    }
    for (const [name, initial] of Object.entries(model.states)) {
        const value = evaluate(initial), source = signal(value);
        scope[name] = source;
        writable.add(source);
        if (Array.isArray(value)) {
            if (!value.length)
                throw new TypeError('List state requires an initial item type');
            const itemType = valueType(value[0]);
            if (!value.every(item => matches(item, itemType)))
                throw new TypeError('List state must have homogeneous items');
            listTypes.set(source, itemType);
        }
    }
    for (const name of Object.keys(model.computed))
        scope[name] = signal('');
    for (const [name, expression] of Object.entries(model.computed)) {
        const source = getSignal(name, scope);
        if (expression.dependencies?.length === 0)
            write(source, evaluate(expression));
        else
            ownedEffects.push(createEffect(() => write(source, evaluate(expression)), source, connect([expression], scope)));
    }
    function resolveTarget(target, local) {
        if (target.kind === 'reference') {
            const source = getSignal(target.name, local);
            if (!writable.has(source))
                throw new TypeError(`Cannot assign read-only value ${target.name}`);
            return source;
        }
        if (target.kind === 'member') {
            const owner = evaluate(target.object, local);
            if (!owner || typeof owner !== 'object' || Array.isArray(owner) || !('__class' in owner))
                throw new TypeError('Member assignment requires an instance');
            const result = owner.fields[target.name];
            if (!result)
                throw new TypeError(`Member ${target.name} is read-only or unknown`);
            return result;
        }
        throw new TypeError('Invalid assignment target');
    }
    function execute(statements, local = scope, event) {
        const assign = (target, value) => { const source = resolveTarget(target, local), itemType = listTypes.get(source); if (itemType ? (!Array.isArray(value) || !value.every(item => matches(item, itemType))) : !matches(value, valueType(source.value)))
            throw new TypeError('Assignment value does not match its state type'); write(source, value); };
        batch(() => {
            for (const statement of statements) {
                if (statement.kind === 'assign')
                    assign(statement.target, evaluate(statement.value, local));
                else if (statement.kind === 'eventAssign') {
                    const element = event?.currentTarget;
                    if (!(element instanceof HTMLInputElement))
                        throw new TypeError('Event value requires an input element');
                    assign(statement.target, statement.member === 'value' ? element.value : element.checked);
                }
                else {
                    const owner = evaluate(statement.target, local);
                    const args = statement.arguments.map(argument => evaluate(argument, local));
                    if (Array.isArray(owner)) {
                        if (statement.target.kind !== 'reference')
                            throw new TypeError('List mutations require existing writable list state');
                        const source = resolveTarget(statement.target, local), itemType = listTypes.get(source);
                        if (!itemType)
                            throw new TypeError('List mutations require existing writable list state');
                        if (!['append', 'remove', 'move'].includes(statement.method))
                            throw new TypeError(`Unsupported list operation ${statement.method}`);
                        if (args.length !== (statement.method === 'move' ? 2 : 1))
                            throw new TypeError('Invalid list mutation argument count');
                        if (!matches(args[0], itemType))
                            throw new TypeError(`List mutation requires ${itemType} items`);
                        if (statement.method === 'move') {
                            if (typeof args[1] !== 'number')
                                throw new TypeError('move index must be a safe integer');
                            safeInteger(args[1]);
                        }
                        let next;
                        if (statement.method === 'append')
                            next = [...owner, args[0]];
                        else if (statement.method === 'remove') {
                            const index = owner.indexOf(args[0]);
                            if (index < 0)
                                continue;
                            next = [...owner];
                            next.splice(index, 1);
                        }
                        else if (statement.method === 'move') {
                            const index = owner.indexOf(args[0]);
                            if (index < 0)
                                continue;
                            const destination = Math.max(0, Math.min(owner.length - 1, Math.trunc(args[1])));
                            if (index === destination)
                                continue;
                            next = [...owner];
                            const [item] = next.splice(index, 1);
                            next.splice(destination, 0, item);
                        }
                        else
                            throw new TypeError(`Unsupported list operation ${statement.method}`);
                        write(source, next);
                    }
                    else if (owner && typeof owner === 'object' && '__class' in owner) {
                        const body = owner.actions[statement.method];
                        if (!body)
                            throw new TypeError(`Unknown action ${statement.method}`);
                        execute(body, owner.scope);
                    }
                    else
                        throw new TypeError('Unsupported call target');
                }
            }
        });
    }
    function evaluateCondition(expression, local) {
        if (expression.kind === 'literal')
            return expression.value;
        if (expression.kind === 'reference' || expression.kind === 'member')
            return evaluate(expression, local);
        if (expression.kind === 'not')
            return !evaluateCondition(expression.argument, local);
        const left = evaluateCondition(expression.left, local);
        if (expression.kind === 'and')
            return Boolean(left) && Boolean(evaluateCondition(expression.right, local));
        const right = evaluateCondition(expression.right, local);
        return expression.kind === 'equal' ? left === right : left !== right;
    }
    function disposeBag(effects, callbacks) { for (const effect of effects)
        stop(effect); effects.length = 0; let failure; for (const callback of callbacks.reverse())
        try {
            untracked(callback);
        }
        catch (error) {
            failure ??= error;
        } callbacks.length = 0; if (failure)
        throw failure; }
    function collectBag(effects, callbacks, result) { for (const effect of effects)
        result.add(effect); for (const callback of callbacks)
        callback.collect?.(result); }
    function exclude(effects, callbacks) {
        const journal = updateJournal, excluded = new Set();
        collectBag(effects, callbacks, excluded);
        if (journal)
            for (const effect of excluded)
                journal.excluded.set(effect, (journal.excluded.get(effect) ?? 0) + 1);
        return () => { if (journal)
            for (const effect of excluded) {
                const count = journal.excluded.get(effect) - 1;
                if (count)
                    journal.excluded.set(effect, count);
                else
                    journal.excluded.delete(effect);
            } };
    }
    // Preparation may create detached scopes, but never discards a live scope.
    // Commit all plans only after validation; teardown follows a successful commit.
    function stage(plan) {
        plan.fail = () => dispose();
        if (updateJournal) {
            const effect = executingEffect;
            const previous = updateJournal.plans.get(effect);
            if (previous) {
                updateJournal.plans.delete(effect);
                previous.rollback();
            }
            updateJournal.plans.set(effect, plan);
        }
        else {
            try {
                plan.commit();
            }
            catch (error) {
                try {
                    plan.rollback();
                }
                catch {
                    try {
                        plan.fail();
                    }
                    catch { /* Original error wins. */ }
                }
                throw error;
            }
            plan.finish?.();
        }
    }
    function binding(plan, expression, local, effects, structural = false) {
        if (!structural && expression.dependencies?.length === 0) {
            plan().commit();
            return;
        }
        // Conditions retain short-circuit read tracking; metadata is conservative.
        const effect = createEffect(() => stage(plan()), undefined, structural ? undefined : connect([expression], local));
        effect.structural = structural;
        effects.push(effect);
    }
    function create(view, parent, local = scope, forward = '', effects = ownedEffects, callbacks = cleanups) {
        // Dynamic ranges can move out of their staging fragment. Resolve insertion
        // parents from live anchors so nested scopes keep updating in place.
        if (view.kind === 'conditional') {
            const document = parent.ownerDocument, start = document.createComment('if'), end = document.createComment('/if');
            parent.append(start, end);
            let selected, branchEffects = [], branchCleanups = [];
            const cleanup = () => { try {
                disposeBag(branchEffects, branchCleanups);
            }
            finally {
                start.remove();
                end.remove();
            } };
            cleanup.collect = result => collectBag(branchEffects, branchCleanups, result);
            callbacks.push(cleanup);
            binding(() => {
                const next = Boolean(evaluateCondition(view.condition, local));
                if (next === selected)
                    return { commit() { }, rollback() { } };
                return untracked(() => {
                    const fragment = document.createDocumentFragment(), oldFragment = document.createDocumentFragment(), nextEffects = [], nextCleanups = [];
                    const oldEffects = branchEffects, oldCleanups = branchCleanups, oldSelected = selected;
                    let touched = false;
                    try {
                        for (const child of next ? view.consequent : view.alternate)
                            create(child, fragment, local, forward, nextEffects, nextCleanups);
                    }
                    catch (error) {
                        try {
                            disposeBag(nextEffects, nextCleanups);
                        }
                        catch { }
                        throw error;
                    }
                    const include = exclude(oldEffects, oldCleanups);
                    return { commit() { touched = true; while (start.nextSibling && start.nextSibling !== end)
                            oldFragment.append(start.nextSibling); end.parentNode.insertBefore(fragment, end); selected = next; branchEffects = nextEffects; branchCleanups = nextCleanups; },
                        rollback() { try {
                            disposeBag(nextEffects, nextCleanups);
                        }
                        finally {
                            if (touched) {
                                end.parentNode.insertBefore(oldFragment, end);
                                selected = oldSelected;
                                branchEffects = oldEffects;
                                branchCleanups = oldCleanups;
                            }
                            include();
                        } },
                        finish() { disposeBag(oldEffects, oldCleanups); } };
                });
            }, view.condition, local, effects, true);
            return;
        }
        if (view.kind === 'iteration') {
            const document = parent.ownerDocument, anchor = document.createComment('for');
            parent.append(anchor);
            let records = new Map();
            const keyScope = Object.create(local), keyItem = signal('');
            keyScope[view.item] = keyItem;
            const cleanup = () => { try {
                disposeBag([], [...records.values()].map(record => () => disposeBag(record.effects, record.cleanups)));
            }
            finally {
                records.clear();
                anchor.remove();
            } };
            cleanup.collect = result => { for (const record of records.values())
                collectBag(record.effects, record.cleanups, result); };
            callbacks.push(cleanup);
            const extract = (record) => { const fragment = document.createDocumentFragment(); let node = record.start; while (node) {
                const next = node.nextSibling;
                fragment.append(node);
                if (node === record.end)
                    break;
                node = next;
            } return fragment; };
            const move = (record, before) => {
                const focused = document.activeElement, restore = focused && (() => { let node = record.start; while (node) {
                    if (node.contains(focused))
                        return true;
                    if (node === record.end)
                        break;
                    node = node.nextSibling;
                } return false; })();
                const input = focused instanceof HTMLInputElement ? focused : undefined, start = input?.selectionStart, end = input?.selectionEnd, direction = input?.selectionDirection;
                before.parentNode.insertBefore(extract(record), before);
                if (restore && focused instanceof HTMLElement && document.activeElement !== focused) {
                    focused.focus({ preventScroll: true });
                    if (input && start != null && end != null)
                        input.setSelectionRange(start, end, direction ?? undefined);
                }
            };
            const update = createEffect(() => {
                const collection = evaluate(view.collection, local);
                if (!Array.isArray(collection))
                    throw new TypeError('Iteration requires a list');
                const desired = [], seen = new Set();
                for (const item of collection) {
                    keyItem.value = item;
                    const key = evaluate(view.key, keyScope);
                    if (!['string', 'number', 'boolean'].includes(typeof key))
                        throw new TypeError('Iteration keys must be primitive values');
                    if (seen.has(key))
                        throw new TypeError(`Duplicate iteration key ${String(key)}`);
                    seen.add(key);
                    desired.push({ key, item });
                }
                untracked(() => {
                    const old = records, next = new Map(), added = [], removed = [...old].filter(([key]) => !seen.has(key)).map(([, record]) => record), includes = [];
                    try {
                        for (const record of removed)
                            includes.push(exclude(record.effects, record.cleanups));
                        for (const entry of desired) {
                            const existing = old.get(entry.key);
                            if (existing) {
                                write(existing.item, entry.item);
                                next.set(entry.key, existing);
                                continue;
                            }
                            const fragment = document.createDocumentFragment(), start = document.createComment('item'), end = document.createComment('/item');
                            const record = { start, end, item: signal(entry.item), index: -1, effects: [], cleanups: [] };
                            added.push(record);
                            fragment.append(start);
                            record.cleanups.push(() => { start.remove(); end.remove(); });
                            const itemScope = Object.create(local);
                            itemScope[view.item] = record.item;
                            for (const child of view.children)
                                create(child, fragment, itemScope, '', record.effects, record.cleanups);
                            fragment.append(end);
                            next.set(entry.key, record);
                        }
                    }
                    catch (error) {
                        try {
                            disposeBag([], added.map(record => () => disposeBag(record.effects, record.cleanups)));
                        }
                        finally {
                            for (const include of includes)
                                include();
                        }
                        throw error;
                    }
                    const positions = desired.map(entry => next.get(entry.key).index);
                    let last = -1, reordered = false;
                    for (const position of positions)
                        if (position >= 0) {
                            if (position < last)
                                reordered = true;
                            last = position;
                        }
                    const stable = reordered ? orderedIndices(positions) : undefined;
                    let touched = false;
                    stage({ commit() { touched = true; for (const record of removed)
                            extract(record); let before = anchor; for (let index = desired.length - 1; index >= 0; index--) {
                            const record = next.get(desired[index].key);
                            if (record.index < 0)
                                before.parentNode.insertBefore(record.start.parentNode, before);
                            else if (stable && !stable.has(index) && record.end.nextSibling !== before)
                                move(record, before);
                            before = record.start;
                        } records = next; let index = 0; for (const record of records.values())
                            record.index = index++; },
                        rollback() { let failure; try {
                            disposeBag([], added.map(record => () => disposeBag(record.effects, record.cleanups)));
                        }
                        catch (error) {
                            failure = error;
                        } if (touched) {
                            let before = anchor;
                            for (const record of [...old.values()].reverse()) {
                                if (record.end.nextSibling !== before)
                                    move(record, before);
                                before = record.start;
                            }
                            records = old;
                            let index = 0;
                            for (const record of old.values())
                                record.index = index++;
                        } for (const include of includes)
                            include(); if (failure)
                            throw failure; },
                        finish() { disposeBag([], removed.map(record => () => disposeBag(record.effects, record.cleanups))); } });
                });
            });
            update.structural = true;
            effects.push(update);
            return;
        }
        if (view.component >= 0) {
            const input = Object.create(null);
            for (const [key, value] of Object.entries(view.attributes))
                Object.defineProperty(input, key, { enumerable: true, configurable: true, get: () => evaluate(value, local) });
            if (forward)
                Object.defineProperty(input, 'class', { enumerable: true, configurable: true, get: () => [view.attributes.class ? evaluate(view.attributes.class, local) : '', forward].filter(Boolean).join(' ') });
            const dispose = untracked(() => components[view.component](parent, { mountComponent, mountCounter }, input));
            callbacks.push(dispose);
            // Refresh only the child prop signals; the child and its local state stay
            // mounted. Each child binding independently tracks those signals.
            if (dispose.refresh && Object.values(view.attributes).some(value => value.dependencies?.length !== 0)) {
                const effect = createEffect(() => dispose.refresh(), undefined, connect(Object.values(view.attributes), local));
                effects.push(effect);
                effect.propagate = true;
            }
            return;
        }
        const element = parent.ownerDocument.createElement(view.tag);
        const classes = [view.attributes.class ? String(evaluate(view.attributes.class, local)) : '', forward].join(' ').split(/\s+/).filter(Boolean);
        if (classes.length)
            element.classList.add(...new Set(classes));
        if (view.attributes.type)
            element.type = String(evaluate(view.attributes.type, local));
        if (view.attributes.text) {
            const expression = view.attributes.text, text = parent.ownerDocument.createTextNode('');
            element.append(text);
            binding(() => { const value = String(evaluate(expression, local)), previous = text.data; return { commit() { if (text.data !== value)
                    text.data = value; }, rollback() { if (text.data !== previous)
                    text.data = previous; } }; }, expression, local, effects);
        }
        if (view.attributes.value) {
            const expression = view.attributes.value, input = element;
            binding(() => { const value = String(evaluate(expression, local)), previous = input.value; return { commit() { if (input.value !== value)
                    input.value = value; }, rollback() { if (input.value !== previous)
                    input.value = previous; } }; }, expression, local, effects);
        }
        if (view.attributes.checked) {
            const expression = view.attributes.checked, input = element;
            binding(() => { const value = evaluate(expression, local), previous = input.checked; if (typeof value !== 'boolean')
                throw new TypeError('checked requires boolean'); return { commit() { if (input.checked !== value)
                    input.checked = value; }, rollback() { if (input.checked !== previous)
                    input.checked = previous; } }; }, expression, local, effects);
        }
        if (view.handler) {
            const listener = (event) => execute(view.handler.statements, local, event);
            element.addEventListener(view.handler.event, listener);
            callbacks.push(() => element.removeEventListener(view.handler.event, listener));
        }
        parent.append(element);
        callbacks.push(() => element.remove());
        for (const child of view.children)
            create(child, element, local, '', effects, callbacks);
    }
    const refresh = () => { if (disposed)
        return; batch(() => { for (const [name, initial] of Object.entries(model.props)) {
        const value = Object.hasOwn(supplied, name) ? supplied[name] : initial;
        if (typeof value !== typeof initial)
            throw new TypeError(`Invalid prop ${name}`);
        write(getSignal(name, scope), value);
    } }); };
    const dispose = () => { if (disposed)
        return; disposed = true; try {
        disposeBag(ownedEffects, cleanups);
    }
    finally {
        try {
            untracked(() => execute(model.cleanup));
        }
        finally {
            for (const name of Object.keys(scope))
                delete scope[name];
            supplied = {};
            components = [];
        }
    } };
    try {
        execute(model.init);
        model.roots.forEach(root => create(root, target, scope, String(supplied.class ?? '')));
    }
    catch (error) {
        try {
            dispose();
        }
        catch { /* Preserve the original mounting error after attempting all cleanups. */ }
        throw error;
    }
    dispose.refresh = refresh;
    dispose.collect = result => collectBag(ownedEffects, cleanups, result);
    return dispose;
}
export function mountCounter(target, model) { let value = safeInteger(model.initial); const step = safeInteger(model.step), button = target.ownerDocument.createElement('button'), text = target.ownerDocument.createTextNode(''); button.append(text); const render = () => { text.data = model.prefix + String(value); }; const click = () => { value = safeInteger(value + step); render(); }; render(); button.addEventListener('click', click); target.append(button); return () => { button.removeEventListener('click', click); button.remove(); }; }
