# Sign-In Email

Last updated: 2026-10-23

Read when: changing the sign-in screen, Supabase Auth email settings, email templates or the sending domain.

## How sign-in works

The caregiver enters an email and the app calls `signInWithOtp`. The email contains both a 6-digit code and a link. The code is typed into the sign-in screen (`verifyOtp` with `type: 'email'`), which works even when the email is read on another device. Mail apps that open links themselves (for example Gmail on Android) can use up the link before the app sees it, so the code is the main path and the link is a fallback.

## Sending

Supabase's built-in mailer allows only a few emails per hour for the whole project, so Auth sends through Cloudflare Email Service over SMTP:

| Setting | Value |
| --- | --- |
| Host | `smtp.mx.cloudflare.net` |
| Port | `465` (implicit TLS) |
| Username | `api_token` |
| Password | Cloudflare API token with **Email Sending: Edit** (account `Jonas.jancarik@gmail.com's Account`) |
| Sender | `prihlaseni@anaboard.jonasjancarik.cz`, name `ÁňaBoard` |

The sending subdomain `anaboard.jonasjancarik.cz` is onboarded under Email Service; Cloudflare manages its SPF, DKIM, DMARC and bounce records. The account quota is 1000 emails per day. Supabase's own Auth rate limit for emails (Authentication → Rate Limits) still applies on top.

These settings live in the Supabase dashboard (Authentication → Emails → SMTP Settings), not in this repo.

## Templates

`supabase/templates/confirmation.html` (Confirm signup) and `supabase/templates/magic_link.html` (Magic link) are the Czech templates pasted into Authentication → Emails → Templates. Both must keep `{{ .Token }}` and `{{ .ConfirmationURL }}`. Suggested subjects: `Potvrď svůj e-mail pro ÁňaBoard` and `Tvůj kód pro přihlášení do ÁňaBoard`.
