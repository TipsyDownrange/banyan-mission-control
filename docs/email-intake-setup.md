# Outlook → BanyanOS Email Intake Setup

This runbook covers turning on the Outlook email connector for a tenant. Once configured, any email sent to (or forwarded to) `intake+{tenant_kid}@banyan-os.app` lands in BanyanOS Mission Control as a new inquiry, with the email body saved as a PDF and every attachment uploaded to a tenant Drive folder.

The route is `POST /api/inquiries/intake-email` and is protected by a shared secret. There is no UI to configure — everything is done in Vercel (for the secret) and Outlook / Microsoft 365 (for the forwarding rule).

---

## 1. Set the webhook secret on Vercel

The endpoint refuses every request until `INTAKE_EMAIL_WEBHOOK_SECRET` is set on the deployment.

1. Sign in to the Vercel dashboard and open the **banyan-mission-control** project.
2. Go to **Settings → Environment Variables**.
3. Add a new variable:
   - **Name:** `INTAKE_EMAIL_WEBHOOK_SECRET`
   - **Value:** a long random string (32+ characters). Generate one with `openssl rand -hex 32` in a terminal, or use a password manager.
   - **Environments:** Preview + Staging first. Production gets the value only after staging verification passes.
4. Click **Save**. Trigger a redeploy from the **Deployments** tab for the variable to take effect.

The same secret must be used in step 2 below. Keep it out of source control — never paste it in commit messages, PR descriptions, or Slack.

---

## 2. Configure the Outlook forwarding rule (Microsoft Graph)

The connector expects Microsoft Graph (or any equivalent automation in Outlook) to POST a JSON envelope to the endpoint whenever a new email arrives in the configured inbox.

The fastest setup is a Power Automate flow:

1. Open **Power Automate** (https://make.powerautomate.com) and sign in as the operator who owns the Outlook inbox (e.g. `joey@kulaglass.com`).
2. **Create → Automated cloud flow.**
3. Choose the trigger **"When a new email arrives (V3)"** on the **Office 365 Outlook** connector.
4. Configure the trigger: pick the inbox folder to watch (Inbox or a sub-folder used for forwarded RFPs).
5. Add an action **"HTTP"** with:
   - **Method:** POST
   - **URI:** `https://<your-vercel-deployment>/api/inquiries/intake-email`
   - **Headers:** `X-Banyan-Intake-Secret: <the value from step 1>` and `Content-Type: application/json`
   - **Body:** the canonical JSON envelope shown in the next section, with Outlook trigger outputs mapped into each field.
6. Add an action **"Get attachments (V2)"** before the HTTP action and loop the attachments into the `attachments` array (each one base64-encoded).
7. **Save & Test** with a sample email.

Microsoft's documentation:
- HTTP action: https://learn.microsoft.com/power-automate/desktop-flows/actions-reference/http
- Email connector trigger: https://learn.microsoft.com/connectors/office365/

The same pattern works with Microsoft Graph subscriptions (`POST /subscriptions` on `me/mailFolders('Inbox')/messages`) if the operator prefers a code-managed setup. The webhook contract on the BanyanOS side is identical.

---

## 3. Canonical JSON payload

This is what Power Automate (or any caller) must POST to the endpoint:

```json
{
  "to": "intake+TEN-001@banyan-os.app",
  "from": "gc-pm@constructionco.com",
  "forwarder": "joey@kulaglass.com",
  "subject": "RFP: Hokuala Phase 2 Tower B Curtainwall",
  "body_text": "Plain-text body of the original email.",
  "body_html": "Optional HTML body.",
  "received_at": "2026-05-19T20:15:00Z",
  "attachments": [
    {
      "filename": "RFP_Hokuala_Phase2.pdf",
      "mime_type": "application/pdf",
      "base64_content": "<base64-encoded file bytes>"
    }
  ]
}
```

The tenant is resolved from the `to` address: everything between `intake+` and `@banyan-os.app` is the tenant `kid` and must match `tenants.kid` in the Mission Control database.

Limits:
- **25** attachments maximum per email.
- **25 MB** maximum total attachment payload across all attachments.

---

## 4. Test the endpoint with curl

Run this from a terminal once the secret is set. Replace `<SECRET>` and the deployment URL.

```bash
curl -X POST \
  'https://<your-vercel-deployment>/api/inquiries/intake-email' \
  -H 'X-Banyan-Intake-Secret: <SECRET>' \
  -H 'Content-Type: application/json' \
  -d '{
    "to": "intake+TEN-001@banyan-os.app",
    "from": "Jane Doe <jane@gctest.com>",
    "forwarder": "joey@kulaglass.com",
    "subject": "RFP: Test Project",
    "body_text": "Sample body",
    "received_at": "2026-05-19T20:15:00Z",
    "attachments": []
  }'
```

A successful response looks like:

```json
{
  "ok": true,
  "inquiry_id": "…",
  "inquiry_number": "INQ-26-0001",
  "drive_folder_id": "…",
  "attachment_count": 1,
  "rfp_detected": true,
  "orphan_forward": false
}
```

---

## 5. Failure modes — what each status means

| Status | What happened | What to do |
| --- | --- | --- |
| **201** | Inquiry created. Drive folder and attachments are saved. | Nothing — the inquiry will appear in Mission Control. |
| **400** | The JSON body is missing a required field or is malformed (bad `to` format, bad `from`, bad `received_at`, attachment missing `filename` or `base64_content`). | Re-check the Power Automate body mapping. The response includes which field failed. |
| **401** | The `X-Banyan-Intake-Secret` header is missing or does not match the server's value. | Confirm the header is being sent. If you rotated the secret on Vercel, update the Power Automate action. |
| **404** | The `tenant_kid` parsed out of the `to` address does not exist in BanyanOS, or the tenant is suspended/archived. | Check the `to` address in your forwarding rule. Use `intake+<kid>@banyan-os.app` where `<kid>` is the tenant's kid from the tenants table. |
| **413** | Too many attachments (more than 25) or total attachment payload bigger than 25 MB. | Have the GC re-send with fewer/smaller files, or strip attachments and re-forward the body only. |
| **502** | Drive upload failed after the inquiry row was already created. The inquiry exists in Mission Control but with no attachments. | Re-send the original email — a new inquiry will be created. The orphan inquiry can be marked LOST manually. |
| **503** | `INTAKE_EMAIL_WEBHOOK_SECRET` is not set on the server. | Complete step 1 above and redeploy. |

---

## 6. RFP routing

If the email subject contains `RFP`, `ITB`, `request for proposal`, `invitation to bid`, `bid request`, or a bracketed `[RFP]` tag added by the forwarder, the inquiry is auto-classified as:

- `source = RFP`
- `inquiry_type_initial = PROJECT`
- `assigned_to_user_id = ` the active user with role `gm` (for Kula Glass, that's Sean)
- `assigned_role = GM`

All other emails are classified as `source = EMAIL`, `inquiry_type_initial = UNCLEAR`, and are left unassigned for manual triage in the inquiry inbox.

The inquiry state is always `NEW` after intake — there is no auto-advance. A human reviews and transitions it.

---

## 7. What this connector does NOT do (yet)

These are deliberately deferred:

- **No Kai parsing.** Subject keyword matching is deterministic. AI-enhanced parsing arrives in a later phase.
- **No reply automation.** The connector ingests email only; no acknowledgement reply is sent back to the GC.
- **No bidirectional sync.** Replies to the original email from inside Outlook are not threaded into the inquiry.
- **No polling fallback.** The webhook must fire — there is no scheduled poll of the Outlook mailbox.
- **No auto-conversion to project / WO.** The inquiry must be promoted manually via the existing inquiry routes once the operator reviews it.
