# Security

Itchy is made for children, so we take its safety seriously.

## What Itchy does with data

- Everything stays in the browser. Songs and recordings are saved in the browser's own storage (IndexedDB, or
  localStorage as a fallback) on the device being used. Nothing is uploaded.
- There are no accounts, no tracking, no analytics, no adverts and no third-party scripts. The app makes no network
  requests other than loading its own files.
- The microphone is only switched on when a child presses the record button, and only after the browser has asked
  for permission. Recordings never leave the device.

If you find that any of this isn't true, please treat it as a security problem and report it as below.

## Reporting a problem

Please **don't** open a public issue. Instead, report it privately through
[GitHub's private vulnerability reporting](https://github.com/hcaw/itchy/security/advisories/new). Include what you
found, how to reproduce it, and which browser and device you used.

You can expect a first reply within a week. We'll keep you updated while we fix it and credit you when the fix is
released, unless you'd rather stay anonymous.

## Supported versions

Only the latest version, the one deployed to <https://hcaw.github.io/itchy/> from the `main` branch, gets security
fixes.
