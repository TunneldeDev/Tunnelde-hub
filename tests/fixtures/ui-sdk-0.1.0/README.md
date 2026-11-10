# Historical UI SDK fixture

`contract.d.mts` preserves the public experimental UI SDK 0.1.0 declaration before
domain separation. Keep it unchanged. Tests compile its types beside the complete
current SDK in NodeNext and check every exported type in both assignment directions.
This covers import compatibility, not runtime behavior or a new stability promise.
