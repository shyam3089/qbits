let activeEffect;
let batchDepth = 0, flushing = false;
const pendingComputed = new Set(), pendingEffects = new Set();
let updateJournal;
function safeInteger(value) { if (!Number.isSafeInteger(value))
    throw new RangeError('Numeric value exceeds the safe integer range (-9007199254740991 to 9007199254740991)'); return value; }
function rememberDirty(source) { if (updateJournal && !updateJournal.dirty.has(source))
    updateJournal.dirty.set(source, source.dirty); }
function signal(value) { if (typeof value === 'number')
    safeInteger(value); return { value, subscribers: new Set() }; }
function read(source) { if (source.dirty)
    source.derive(); if (activeEffect && !activeEffect.disposed) {
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
function flush() {
    if (batchDepth || flushing)
        return;
    flushing = true;
    try {
        while (pendingComputed.size || pendingEffects.size) {
            while (pendingComputed.size)
                pendingComputed.values().next().value();
            if (pendingEffects.size)
                pendingEffects.values().next().value();
        }
    }
    finally {
        flushing = false;
        pendingComputed.clear();
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
    const journal = { values: new Map(), dependencies: new Map(), dirty: new Map(), checks: new Set(), checking: false };
    const computedBefore = new Set(pendingComputed), effectsBefore = new Set(pendingEffects);
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
                    pendingComputed.values().next().value();
            }
            journal.checking = true;
            try {
                untracked(() => { for (const effect of pendingEffects)
                    effect.validate?.(); });
            }
            finally {
                journal.checking = false;
            }
        } while (journal.checks.size || pendingComputed.size);
    }
    catch (error) {
        for (const [source, value] of journal.values)
            source.value = value;
        for (const [effect, dependencies] of journal.dependencies) {
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
        pendingEffects.clear();
        for (const effect of effectsBefore)
            pendingEffects.add(effect);
        throw error;
    }
    finally {
        updateJournal = undefined;
        batchDepth--;
    }
    // DOM errors (for example duplicate keys) retain their existing semantics.
    flush();
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
function createEffect(run, computed, validate) {
    const effect = (() => { if (effect.disposed)
        return; if (updateJournal && !updateJournal.dependencies.has(effect))
        updateJournal.dependencies.set(effect, new Set(effect.dependencies)); pendingComputed.delete(effect); pendingEffects.delete(effect); if (computed) {
        rememberDirty(computed);
        computed.dirty = false;
    } for (const source of effect.dependencies)
        source.subscribers.delete(effect); effect.dependencies.clear(); const previous = activeEffect; activeEffect = effect; try {
        run();
    }
    finally {
        activeEffect = previous;
    } });
    effect.dependencies = new Set();
    effect.disposed = false;
    effect.computed = computed;
    effect.validate = validate;
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
    return; effect.disposed = true; pendingComputed.delete(effect); pendingEffects.delete(effect); for (const source of effect.dependencies)
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
    const track = (run, bag = ownedEffects) => { const effect = createEffect(run); bag.push(effect); return effect; };
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
    function evaluate(expression, local = scope) {
        if (expression.kind === 'literal')
            return typeof expression.value === 'number' ? safeInteger(expression.value) : expression.value;
        if (expression.kind === 'reference') {
            const value = local[expression.name];
            if (!value)
                throw new TypeError(`Unknown value ${expression.name}`);
            return typeof value === 'function' ? value() : '__class' in value ? value : read(value);
        }
        if (expression.kind === 'member') {
            const owner = evaluate(expression.object, local);
            if (!owner || typeof owner !== 'object' || Array.isArray(owner) || !('__class' in owner))
                throw new TypeError('Member access requires a class instance');
            const field = owner.fields[expression.name];
            if (field)
                return read(field);
            const computed = owner.computed[expression.name];
            if (computed)
                return evaluate(computed, owner.scope);
            throw new TypeError(`Unknown member ${expression.name}`);
        }
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
        const instance = { __class: name, fields: Object.create(null), computed: declaration.computed, actions: declaration.actions, scope: instanceScope };
        const validate = () => { for (const expression of Object.values(declaration.computed))
            evaluate(expression, instanceScope); };
        declaration.fields.forEach((field, index) => { const initial = evaluate(field.initial, instanceScope), value = args[index]; if (typeof value !== typeof initial)
            throw new TypeError(`Invalid class field ${field.name}`); const source = signal(value); source.validate = validate; writable.add(source); instance.fields[field.name] = source; instanceScope[field.name] = source; });
        // Class derivations stay lazy: consumers subscribe directly to fields,
        // without a class-level effect that would outlive a removed list record.
        for (const [member, expression] of Object.entries(declaration.computed))
            instanceScope[member] = () => evaluate(expression, instanceScope);
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
        ownedEffects.push(createEffect(() => write(source, evaluate(expression)), source));
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
    function create(view, parent, local = scope, forward = '', effects = ownedEffects, callbacks = cleanups) {
        // Dynamic ranges can move out of their staging fragment. Resolve insertion
        // parents from live anchors so nested scopes keep updating in place.
        if (view.kind === 'conditional') {
            const anchor = parent.ownerDocument.createComment('if');
            parent.append(anchor);
            let selected;
            let branchEffects = [];
            let branchCleanups = [];
            callbacks.push(() => { try {
                disposeBag(branchEffects, branchCleanups);
            }
            finally {
                anchor.remove();
            } });
            const update = createEffect(() => { const next = Boolean(evaluateCondition(view.condition, local)); if (next === selected)
                return; untracked(() => { disposeBag(branchEffects, branchCleanups); selected = next; const fragment = parent.ownerDocument.createDocumentFragment(); for (const child of next ? view.consequent : view.alternate)
                create(child, fragment, local, forward, branchEffects, branchCleanups); anchor.parentNode.insertBefore(fragment, anchor); }); });
            effects.push(update);
            return;
        }
        if (view.kind === 'iteration') {
            const document = parent.ownerDocument, anchor = document.createComment('for');
            parent.append(anchor);
            const records = new Map(), keyScope = Object.create(local), keyItem = signal('');
            keyScope[view.item] = keyItem;
            let update;
            callbacks.push(() => { if (update)
                stop(update); try {
                disposeBag([], [...records.values()].map(record => () => disposeBag(record.effects, record.cleanups)));
            }
            finally {
                records.clear();
                anchor.remove();
            } });
            const move = (record, before) => {
                const fragment = document.createDocumentFragment(), focused = document.activeElement;
                let restore = false, start = null, end = null, direction = null;
                let node = record.start;
                while (node) {
                    const next = node.nextSibling;
                    if (focused && node.contains(focused)) {
                        restore = true;
                        if (focused instanceof HTMLInputElement) {
                            start = focused.selectionStart;
                            end = focused.selectionEnd;
                            direction = focused.selectionDirection;
                        }
                    }
                    fragment.append(node);
                    if (node === record.end)
                        break;
                    node = next;
                }
                before.parentNode.insertBefore(fragment, before);
                if (restore && focused instanceof HTMLElement && document.activeElement !== focused) {
                    focused.focus({ preventScroll: true });
                    if (focused instanceof HTMLInputElement && start !== null && end !== null)
                        focused.setSelectionRange(start, end, direction ?? undefined);
                }
            };
            update = createEffect(() => {
                const collection = evaluate(view.collection, local);
                if (!Array.isArray(collection))
                    throw new TypeError('Iteration requires a list');
                const desired = [], seen = new Set();
                for (const item of collection) {
                    keyItem.value = item;
                    const key = evaluate(view.key, keyScope);
                    if (seen.has(key))
                        throw new TypeError(`Duplicate iteration key ${String(key)}`);
                    seen.add(key);
                    desired.push({ key, item });
                }
                // Structural setup must not subscribe this list to child props, init
                // statements, or static attributes read while constructing records.
                untracked(() => {
                    for (const [key, record] of records)
                        if (!seen.has(key)) {
                            disposeBag(record.effects, record.cleanups);
                            records.delete(key);
                        }
                    for (const entry of desired) {
                        const existing = records.get(entry.key);
                        if (existing) {
                            write(existing.item, entry.item);
                            continue;
                        }
                        const fragment = document.createDocumentFragment(), start = document.createComment('item'), end = document.createComment('/item');
                        const record = { start, end, item: signal(entry.item), index: -1, effects: [], cleanups: [] };
                        fragment.append(start);
                        record.cleanups.push(() => { start.remove(); end.remove(); });
                        const itemScope = Object.create(local);
                        itemScope[view.item] = record.item;
                        try {
                            for (const child of view.children)
                                create(child, fragment, itemScope, '', record.effects, record.cleanups);
                            fragment.append(end);
                            records.set(entry.key, record);
                        }
                        catch (error) {
                            disposeBag(record.effects, record.cleanups);
                            throw error;
                        }
                    }
                    const positions = desired.map(entry => records.get(entry.key).index);
                    let last = -1, reordered = false;
                    for (const position of positions)
                        if (position >= 0) {
                            if (position < last)
                                reordered = true;
                            last = position;
                        }
                    const stable = reordered ? orderedIndices(positions) : undefined;
                    let before = anchor;
                    for (let index = desired.length - 1; index >= 0; index--) {
                        const record = records.get(desired[index].key);
                        if (record.index < 0)
                            before.parentNode.insertBefore(record.start.parentNode, before);
                        else if (stable && !stable.has(index) && record.end.nextSibling !== before)
                            move(record, before);
                        before = record.start;
                        record.index = index;
                    }
                });
            }, undefined, () => { const collection = evaluate(view.collection, local); if (!Array.isArray(collection))
                throw new TypeError('Iteration requires a list'); for (const item of collection) {
                keyItem.value = item;
                evaluate(view.key, keyScope);
            } });
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
            if (dispose.refresh) {
                const effect = track(() => dispose.refresh(), effects);
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
            const text = parent.ownerDocument.createTextNode('');
            element.append(text);
            effects.push(createEffect(() => { const value = String(evaluate(view.attributes.text, local)); if (text.data !== value)
                text.data = value; }, undefined, () => { evaluate(view.attributes.text, local); }));
        }
        if (view.attributes.value) {
            const input = element;
            effects.push(createEffect(() => { const value = String(evaluate(view.attributes.value, local)); if (input.value !== value)
                input.value = value; }, undefined, () => { evaluate(view.attributes.value, local); }));
        }
        if (view.attributes.checked) {
            const input = element;
            effects.push(createEffect(() => { const value = evaluate(view.attributes.checked, local); if (typeof value !== 'boolean')
                throw new TypeError('checked requires boolean'); if (input.checked !== value)
                input.checked = value; }, undefined, () => { evaluate(view.attributes.checked, local); }));
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
    return dispose;
}
export function mountCounter(target, model) { let value = safeInteger(model.initial); const step = safeInteger(model.step), button = target.ownerDocument.createElement('button'), text = target.ownerDocument.createTextNode(''); button.append(text); const render = () => { text.data = model.prefix + String(value); }; const click = () => { value = safeInteger(value + step); render(); }; render(); button.addEventListener('click', click); target.append(button); return () => { button.removeEventListener('click', click); button.remove(); }; }
