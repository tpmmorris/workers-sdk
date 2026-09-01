---
"@cloudflare/local-explorer-ui": minor
"miniflare": minor
---

Add `.eml` upload and captured-email resend tools to the Local Explorer email UI

You can now send a local `.eml` file directly to a Worker's email handler, edit and resend composer-created captures, or immediately replay captured MIME from a Routing row. Raw uploads preserve MIME bytes while generating a new Message-ID, and existing structured test-email API callers remain compatible.

Truncated captures remain replayable with explicit captured-portion warnings. The composer no longer displays Bcc, while the existing optional API field is still accepted.
