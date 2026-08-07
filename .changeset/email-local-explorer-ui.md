---
"miniflare": minor
---

Add an Email section to the local explorer for inspecting and testing a worker's email during local dev. A new "Email" group in the sidebar exposes two views. Routing lists emails received by the worker's `email()` handler, with a detail page that shows the handling flow for each message (`received`, `forwarded`, `replied`, `rejected`, `unhandled`) alongside its metadata. Sending lists emails the worker sent through a `send_email` binding, with a detail page for each message. A "Send Test Email" dialog lets you trigger the worker's `email()` handler directly from the UI.
