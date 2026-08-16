import { notFound } from "next/navigation";
import { getTenantBySlug } from "@/lib/tenants";
import { getAllCountries, getCountryOptions } from "@/lib/phone";
import { SignInFlow } from "@/components/SignInFlow";

// TENANT_SLUG is only reliably set on the long-running `next start` process
// (via the systemd unit's EnvironmentFile) - the `npm run build` step during
// deploy runs under `sudo -u <deploy_user>` without env passthrough, so a
// statically-prerendered page would bake in the fallback tenant regardless
// of what's configured. Force per-request rendering instead.
export const dynamic = "force-dynamic";

export default function HomePage() {
  const tenant = getTenantBySlug(process.env.TENANT_SLUG ?? "riverstone-dental");
  if (!tenant) notFound();

  const countries = getCountryOptions(tenant.allowedCountries);
  const defaultCountry =
    countries.find((c) => c.code === tenant.defaultCountry) ??
    getAllCountries().find((c) => c.code === tenant.defaultCountry) ??
    countries[0];

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-16 sm:px-6">
      <SignInFlow tenant={tenant} countries={countries} defaultCountry={defaultCountry} />
    </main>
  );
}
