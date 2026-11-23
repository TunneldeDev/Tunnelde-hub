# Migration verification

Verified on 2026-11-24 (Asia/Shanghai).

- All 19 migrated plugins and the new Syntax Highlighting plugin completed independent build/validation/release workflows. Published archives were downloaded again and checked against catalogue SHA-256, root Manifest identity, README, LICENSE and required entry files.
- SDK 1.0.1: 220 tests, 211 passed and 9 optional native-producer fixtures skipped. Publisher regressions cover partial draft recovery, conflicting bytes, unexpected assets and source-commit mismatches.
- Shared assistant runtime: 174 tests, 168 passed and 6 optional native tests skipped in the initial local run. Dedicated native Codex/Pi CI jobs are retained in the runtime repository.
- Hub: 9 unit tests cover reproducible catalogue generation, immutable versions, invalid source records, release-channel selection, verified updates and retaining all existing files when any proposed download fails.
- Highlighter: 5 tests cover language grammars, supported aliases, Unicode/CRLF, bounded paged reads, invalid requests and a real stdio process running outside its checkout. Node 22/24 CI passed; version 1.0.1 allows bounded cold grammar compilation on slower runners.
- Actual published highlighter ZIP was unpacked only after archive verification, run from a temporary directory and validated by the current Tunnelde dev `parseSyntaxResult`. Local TS, SSH-style Python, Dockerfile, Makefile, CMakeLists.txt and a paged large remote-style buffer passed.
- Current Tunnelde dev: 33 existing syntax tests across 9 files passed, covering visible windows, stale identities, permission revocation, stopped runtimes, composition, coalescing and decorations.
- A separately generated template instance initialized its own identity, built, passed its real stdio test and generated an independently installable ZIP and matching marketplace metadata.

Host source was inspected and tested in an isolated `codex/plugin-highlighting-acceptance` checkout. Existing syntax interfaces were sufficient, so no Tunnelde application change is needed. SSH-style buffer acceptance is a protocol test, not a live SSH connection or desktop GUI session. The SDK retains its explicitly pinned contract snapshot; unrelated new experimental APIs on moving Tunnelde/dev are not incorporated by this migration.
