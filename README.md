This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Amplitude Web Experiment

To compare login/register page variants, copy `.env.example` to `.env.local` and set the Amplitude Analytics API key and Experiment deployment key:

```bash
AMPLITUDE_API_KEY="..."
NEXT_PUBLIC_AMPLITUDE_EXPERIMENT_DEPLOYMENT_KEY="client-..."
```

Auth analytics events are sent through `/api/analytics/amplitude`, which forwards them to Amplitude HTTP API v2 from the server. Keep `AMPLITUDE_API_KEY` server-only; it should not use the `NEXT_PUBLIC_` prefix. If your project uses Amplitude EU data residency, set:

```bash
AMPLITUDE_HTTP_API_ENDPOINT="https://api.eu.amplitude.com/2/httpapi"
```

The auth page uses the Amplitude Experiment JavaScript SDK to fetch the `test` experiment variant and falls back to `control` if the SDK cannot load a variant. If you also use Amplitude Web Experiment's visual editor, you can optionally set:

```bash
NEXT_PUBLIC_AMPLITUDE_WEB_EXPERIMENT_SCRIPT_URL="https://..."
```

### Tracking Plan

The app records these events for conversion analysis:

- `Auth Page Viewed`
- `Auth Form Submitted`
- `Auth Conversion`
- `Auth Form Failed`
- `User Registered`
- `User Logged In`
- `Payment Simulated`

Core event properties:

- `experiment_surface`: always `auth`
- `auth_mode`: `login` or `register`
- `page_path`: current auth route
- `experiment_key`: currently `test`
- `experiment_variant`: `control` or `treatment`
- `conversion_type`: present on `Auth Conversion`
- `status_code` and `error_message`: present on `Auth Form Failed`
- `payment_amount`, `currency`, `payment_method`, `source`, and `amount_entry_method`: present on `Payment Simulated`

Recommended experiment metrics:

- Primary metric: `User Registered`, counted as unique users.
- Alternative primary metric: `Auth Conversion` filtered by `auth_mode = register`.
- Secondary metrics: `Auth Form Submitted`, `Auth Form Failed`, and `User Logged In`.

The auth UI also exposes stable selectors such as `[data-auth-form="register"]` and `[data-auth-primary-action="login"]` for Amplitude's visual editor.

The built-in copy experiment uses Amplitude experiment key `test` with these variants:

- `control`: current direct login/register copy
- `treatment`: value-led copy focused on AI trace visibility and issue diagnosis

For local checks, open `/login?auth_copy_variant=treatment` or `/register?auth_copy_variant=treatment`; the query parameter forces the preview variant. In Amplitude Web Experiment, set the treatment variant with this custom snippet if you need a visual-editor fallback:

```js
document.documentElement.dataset.authCopyVariant = "treatment";
window.dispatchEvent(
  new CustomEvent("auth-copy-experiment:variant", {
    detail: { variant: "treatment" },
  })
);
```

The app records `Auth Copy Experiment Exposed` and includes `experiment_key` and `experiment_variant` on auth events for analysis.

### Synthetic AB Experiment Events

To preview 100 synthetic register-page users without sending anything to Amplitude:

```bash
npm run simulate:auth-ab -- --summary-only
```

To upload the synthetic exposure, page-view, submit, and registration conversion events to Amplitude, set `AMPLITUDE_API_KEY` in `.env.local`, then run:

```bash
npm run simulate:auth-ab -- --send --summary-only
```

The synthetic events include `is_synthetic: true`, `experiment_key: test`, `experiment_variant`, `auth_mode: register`, and stable `user_id` / `device_id` values such as `sim-user-001` and `sim-device-001`. They also include matching Amplitude `user_properties` such as `synthetic_user`, `synthetic_simulation_id`, `auth_copy_experiment_key`, and `auth_copy_experiment_variant`.

The simulator also sends Amplitude top-level identity, geo, and device fields. Defaults include `city: San Francisco`, `country: United States`, `region: California`, `device_brand: Apple`, `device_model: Mac`, `language: en-US`, `os_name: macOS`, and `platform: Web`. Override them when needed:

```bash
npm run simulate:auth-ab -- --send --country "China" --city "Shanghai" --region "Shanghai" --ip "8.8.8.8"
```

For easier chart grouping, the same synthetic identity and geo fields are mirrored into event properties and user properties, including `synthetic_user_id`, `synthetic_device_id`, `city`, `country`, and `region`.

## Mixpanel Quick Start

This app also sends product analytics to Mixpanel through the browser SDK. Set the project token in `.env.local` or the deployment environment:

```bash
NEXT_PUBLIC_MIXPANEL_TOKEN="715809b4480606c6237f5ffde5c246b4"
```

Mixpanel is initialized once in `src/lib/mixpanel.ts`. Feature code should use the shared helpers from that file instead of importing `mixpanel-browser` directly.

Current Mixpanel tracking plan:

- Auth funnel: `auth_page_viewed`, `auth_form_submitted`, `auth_form_failed`, `auth_mode_switched`, `sign_up_completed`, `log_in_completed`, `log_out_completed`.
- Dashboard usage: `dashboard_viewed`, `report_download_requested`, `activity_metric_selected`.
- Payment simulation: `payment_simulated`.
- Trace usage: `trace_list_opened`, `trace_list_viewed`, `trace_searched`, `trace_filter_clicked`, `trace_opened`, `trace_viewed`.
- Global navigation and preferences: `project_selected`, `theme_changed`, `language_changed`, `docs_clicked`.

Identity rules:

- `identify` runs after successful login/signup and when a logged-in protected session opens.
- `reset` runs on logout.
- The Mixpanel distinct ID is the internal user ID, not the user's email.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
