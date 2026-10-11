# Chrome Web Store listing: WebMCP Recorder 1.0.0

## Name
WebMCP Recorder

## Summary (132 chars max, shown under the name)
Do a task on any website once, then run it again in one click or for every row of a spreadsheet. 100% local.

## Category
Productivity → Workflow & Planning

## Description

Stop doing the same web task by hand. Show WebMCP Recorder a task once (an invoice, a refund, a booking, a new customer), and it runs it again for you: with new values in one click, or for every row of a spreadsheet.

HOW IT WORKS
1. Teach: open the side panel, click "Teach a new task", and do the task on the site as you normally would.
2. Check: see the steps in plain words and choose which fields to ask for each time.
3. Reuse: run it with new values, paste or drop a spreadsheet to run it for every row, or let an AI agent run it.

WHAT YOU CAN DO
• Run on the page: watch a cursor fill in the form and click, step by step.
• Run in the background: when the task is a single form submit, it's sent directly in a fraction of a second.
• Run from a spreadsheet: paste rows from Excel or Google Sheets, or drop a CSV. Every row shows its status live. Retry failed rows, download the results, and see how much time you saved.
• Fix in one click: if the site changes and a button moves, the run asks you to point at it. Click it once and the task remembers.
• Trust the result: each run reports what the site itself said ("Invoice INV-104 saved", "Email is invalid"), never a silent "done".
• Share with your team: export a site's tasks to a file; teammates import it and get the same tasks.
• Works with AI agents: saved tasks are exposed as WebMCP tools (document.modelContext), so in-browser agents can call them.

GOOD FOR
Data entry into web portals, support refunds and ticket updates, invoices and bookings, admin panels without an API, and any form you fill in more than twice a day.

PRIVATE BY DESIGN
• 100% local: tasks are stored in your browser. There is no server, no account and no tracking.
• Sign-ins are never stored: passwords are never recorded, and login and security tokens are left out of saved tasks; runs reuse the session you're already signed in with.
• Nothing is sent anywhere except to the website you're automating, exactly as if you did it yourself.

Note: steps like CAPTCHAs, one-time passcodes and payments stay with you.

## Single purpose (Privacy tab)
Record a task a user performs on a website and replay it on that website with new values, one at a time or for each row of a spreadsheet.

## Permission justifications (Privacy tab)
- storage: saves the user's recorded tasks, their last-run results and an in-progress recording, locally in chrome.storage.local.
- sidePanel: the extension's interface (task list, recording, review, run and spreadsheet screens) is a side panel.
- Host access (content scripts on all sites): the user chooses which site to automate, so the recorder must be able to observe the fields they fill in and the requests the page sends on that site, and replay the task there. Nothing is collected unless the user starts a recording or runs a task.
- Remote code: none. All code ships in the package.

## Data usage (Privacy tab)
Collected: "Website content" and "User activity" are processed only inside the user's browser to record and replay tasks the user creates. Nothing is transmitted to the developer or third parties.
Certify: not sold to third parties; not used or transferred for purposes unrelated to the single purpose; not used for creditworthiness or lending.

## Privacy policy URL
Host PRIVACY.md at a public URL (e.g. GitHub repo or your site) and paste the link.

## Assets
- Icon 128×128: public/icons/icon-128.png
- Screenshots 1280×800: store/screenshots/*.png
- Small promo tile 440×280: store/promo-small.png
