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

To compare login/register page variants, copy `.env.example` to `.env.local` and set:

```bash
NEXT_PUBLIC_AMPLITUDE_WEB_EXPERIMENT_SCRIPT_URL="https://..."
```

Use the Web Experiment script URL from your Amplitude project. The app records these events for conversion analysis:

- `Auth Page Viewed`
- `Auth Form Submitted`
- `Auth Conversion`
- `Auth Form Failed`
- `User Registered`
- `User Logged In`

Recommended conversion metric: `Auth Conversion` filtered by `auth_mode = register` for registration conversion, or `auth_mode = login` for login conversion. The auth UI also exposes stable selectors such as `[data-auth-form="register"]` and `[data-auth-primary-action="login"]` for Amplitude's visual editor.

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
