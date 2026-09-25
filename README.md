# GDH Appointments — sign-in reference

A white-label, phone-OTP sign-in flow: "Sign in to **{brand}** with GDH Appointments." Each client business (tenant) gets its own name, accent color, and allowed countries; identity and delivery stay centralized.

Design doc: tenancy model, flow, data model, API surface, and security limits are written up separately (see the published artifact link shared alongside this repo).

## Running locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — it lists the demo tenants, each with its own branded `/t/{slug}/sign-in`.

No SMS provider is wired up: the OTP is logged to the server console and, outside of production, also returned to the browser and shown on the code screen so the flow is clickable end to end.

## What's implemented vs. left for production

**Implemented:** tenant-driven theming/copy, phone entry + validation (`libphonenumber-js`), 6-digit OTP with expiry/attempt/resend limits, per-phone and per-IP rate limiting, first-time profile capture, signed session cookie, sign-out.

**Left for production:** a real SMS provider, a persistent database (everything currently lives in an in-memory store and resets on restart), refresh-token rotation, and the embeddable widget/custom-domain resolution described in the design doc.
