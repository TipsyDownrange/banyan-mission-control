# PDF Generator Files — Migration Exclude List

## Rule

`@react-pdf/renderer` files use the pdfkit rendering engine, which does **NOT** resolve CSS custom properties (`var(--token-name)`). When pdfkit's `_normalizeColor` receives a string that doesn't start with `#`, doesn't match a CSS named color, and isn't a registered spot color, it returns `null` — the renderer then emits **no color operator at all** to the PDF content stream, and the affected property silently falls through to the previous graphics-state color (typically black for text, transparent for fills).

All files listed below **MUST** use literal hex color values (`'#0f172a'`), never `var(--*)` token references. Exclude from all hex → token migration sweeps.

This rule applies whether the file directly contains color literals or imports a color palette (e.g. `C` from `lib/pdf-templates`) from another file in this list.

## Excluded files (14)

The 14 known `@react-pdf/renderer` direct-render files:

- `lib/aia/pay-app-pdf.tsx`
- `lib/pdf-budget.tsx`
- `lib/pdf-cop.tsx`
- `lib/pdf-daily-report.tsx`
- `lib/pdf-estimate.tsx`
- `lib/pdf-field-issue.tsx`
- `lib/pdf-rfi.tsx`
- `lib/pdf-schedule.tsx`
- `lib/pdf-service-wo.tsx`
- `lib/pdf-submittal.tsx`
- `lib/pdf-templates.tsx`
- `lib/pdf-tm-ticket.tsx`
- `lib/pdf-warranty.tsx`
- `lib/pdf-work-order-dispatch.tsx`

Plus files that consume `lib/pdf-templates`'s exported `C` palette and therefore must also be considered PDF-context:

- `lib/aia/submission-bundle-assembler.tsx`
- `lib/aia/submission-bundle-cover-letter.tsx`
- `lib/aia/submission-bundle-manifest.tsx`
- `lib/pdf-email-body.tsx`

## How to add a new PDF renderer

If you add a new `@react-pdf/renderer` file, append it to the list above in the same PR that adds the file. The file should use literal hex values from inception. Reference `lib/pdf-templates.tsx`'s `C` constant for the canonical KG color palette where possible.

## How to find all current PDF files

```sh
grep -rln '@react-pdf/renderer' lib/ app/
```

If new entries appear and they aren't in the list above, the list is out of date — update it.

## Historical context

This file was created by PR for BAN-171 B4a-PDF-FIX after a regression was discovered: prior hex → token migration packets (PRs #221, #222, #223, #224, #225, #226, #227, #230) had mechanically swept these PDF files alongside consumer code, inserting 21 `var(--*)` references across 4 files. `@react-pdf/renderer` rendered the affected color properties as black/transparent (cosmetic regression, not a crash). The PR restored all 4 files to their pre-sweep state via `git checkout 79e22a058471c7428d58e8f85c3532366170dd8a -- <file>`.
