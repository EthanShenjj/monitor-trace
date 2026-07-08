<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:mixpanel-agent-rules -->
# Analytics Tracking - Mixpanel

This project uses Mixpanel for product analytics. Mixpanel is the source of truth for event tracking, user identification, and behavioral data. Do not introduce another analytics tool, SDK, or tracking path without explicit instruction from the user.

## Before Adding Or Modifying Tracking

- Confirm the SDK still matches the platform: Next.js App Router, React client components, `mixpanel-browser`.
- Check whether data is routed through a CDP. Current answer: no CDP or warehouse routing.
- Check whether consent gating is required. Current answer: no EU/EEA/UK/Switzerland or California users, so Mixpanel initializes directly.
- Review the tracking plan below before adding new events.

## Tech Stack

| Detail | Value |
|---|---|
| Platform | Next.js 16 App Router web app |
| Mixpanel SDK | `mixpanel-browser` |
| Tracking method | Client-side SDK |
| CDP | none |
| Consent required | no |
| Token location | `.env.local` / deployment env: `NEXT_PUBLIC_MIXPANEL_TOKEN` |

## Mixpanel Initialization

Mixpanel is initialized in `src/lib/mixpanel.ts`. Do not import `mixpanel-browser` directly in feature files; use the shared helpers:

- `trackMixpanelEvent(eventName, properties)`
- `identifyMixpanelUser(userId, profile)`
- `resetMixpanel()`

## Mixpanel Identity

| Action | When | Code location |
|---|---|---|
| `mixpanel.identify(user_id)` | After successful signup/login and when a logged-in session reopens the app | `src/components/AuthForm.tsx`, `src/components/TopNav.tsx` |
| `mixpanel.reset()` | On logout | `src/components/TopNav.tsx` |

Rules:
- Use the stable internal database user ID as the Mixpanel distinct ID. Never use email as `distinct_id`.
- Identify only after authentication succeeds.
- Reset on every logout path before sending the user back to login.

## Current Mixpanel Events

| Event | Trigger | Key properties | File |
|---|---|---|---|
| `auth_page_viewed` | User views login or register page | `auth_mode`, `page_path`, `experiment_key`, `experiment_variant`, `platform` | `src/components/AuthForm.tsx` |
| `auth_form_submitted` | User submits login or register form | `auth_mode`, `page_path`, `experiment_key`, `experiment_variant`, `platform` | `src/components/AuthForm.tsx` |
| `auth_form_failed` | Login or register form returns an error | `auth_mode`, `status_code`, `failure_reason`, `platform` | `src/components/AuthForm.tsx` |
| `auth_mode_switched` | User switches between login and registration | `from_auth_mode`, `to_auth_mode`, `experiment_key`, `experiment_variant` | `src/components/AuthForm.tsx` |
| `sign_up_completed` | User completes email account registration | `sign_up_method`, `platform`, `auth_mode`, `page_path`, `experiment_key`, `experiment_variant` | `src/components/AuthForm.tsx` |
| `log_in_completed` | User completes email login | `login_method`, `platform`, `auth_mode`, `page_path`, `experiment_key`, `experiment_variant` | `src/components/AuthForm.tsx` |
| `log_out_completed` | User logs out | `platform` | `src/components/TopNav.tsx` |
| `dashboard_viewed` | Logged-in user views the dashboard | `visible_trace_count`, `total_requests`, `error_rate`, `platform` | `src/app/(protected)/page.tsx` |
| `report_download_requested` | User clicks Download Report | `source`, `platform` | `src/app/(protected)/page.tsx` |
| `payment_simulated` | User clicks Pay in the payment simulation form | `payment_amount`, `currency`, `payment_method`, `source`, `amount_entry_method`, `platform` | `src/app/(protected)/page.tsx` |
| `activity_metric_selected` | User switches the activity chart metric | `metric`, `previous_metric`, `platform` | `src/components/ActivityChart.tsx` |
| `trace_list_opened` | User opens the trace list from dashboard | `source`, `platform` | `src/app/(protected)/page.tsx` |
| `trace_list_viewed` | Logged-in user views the trace list page | `trace_count`, `platform` | `src/app/(protected)/traces/page.tsx` |
| `trace_searched` | User searches traces by pressing Enter or leaving the search field | `search_query_length`, `trigger`, `platform` | `src/app/(protected)/traces/page.tsx` |
| `trace_filter_clicked` | User clicks the trace filter control | `source`, `platform` | `src/app/(protected)/traces/page.tsx` |
| `trace_opened` | User clicks a trace from dashboard or trace list | `source`, `trace_id`, `project_name`, `model`, `trace_status`, `platform` | `src/app/(protected)/page.tsx`, `src/app/(protected)/traces/page.tsx` |
| `trace_viewed` | Logged-in user opens a trace detail page | `trace_id`, `project_name`, `model`, `trace_status`, `total_tokens`, `latency_ms`, `cost_usd`, `span_count` | `src/app/(protected)/traces/[id]/page.tsx` |
| `message_center_viewed` | Logged-in user views the message center | `status_filter`, `platform` | `src/app/(protected)/messages/page.tsx` |
| `message_opened` | User opens a webhook message | `provider`, `event_type`, `message_status`, `platform` | `src/app/(protected)/messages/page.tsx` |
| `message_marked_read` | User marks a webhook message as read | `provider`, `event_type`, `platform` | `src/app/(protected)/messages/page.tsx` |
| `project_selected` | User changes the top-nav project selector | `project_name`, `platform` | `src/components/TopNav.tsx` |
| `theme_changed` | User changes light/dark theme | `previous_theme`, `new_theme`, `platform` | `src/context/AppContext.tsx` |
| `language_changed` | User changes UI language | `previous_language`, `new_language`, `platform` | `src/context/AppContext.tsx` |
| `docs_clicked` | User clicks Docs in the top nav | `source`, `platform` | `src/components/TopNav.tsx` |

## Naming Rules

- Event names and property names use `snake_case`.
- Use one event for one meaning; do not reuse a vague event name for unrelated actions.
- Do not track PII as event properties.
- Omit empty, null, or undefined properties.
- Verify new events in Mixpanel Live View before considering them done.
<!-- END:mixpanel-agent-rules -->
