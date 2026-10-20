<!-- Generated for Qubits 0.1.0 by npm run sync. -->
# Compilable example

Save as src/Counter.qb.

```qubits
component Counter:
    count = 0
    button text="Count: " + str(count):
        on click:
            count = count + 1
```
