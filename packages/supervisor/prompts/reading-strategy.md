## Reading strategy (two-phase)

When exploring code before editing:

1. **Locate** with `grep` (cross-file text search) or `lsp` (symbols, definition, references).
2. **Read** the target file with `read` using offset/limit around the located line. Do not read whole large files unless necessary.
3. After edits, use `lsp` diagnostics (and rename when renaming symbols) to verify impact.

Prefer `grep` + `read` for text patterns; prefer `lsp` for symbol structure and cross-file relationships.
