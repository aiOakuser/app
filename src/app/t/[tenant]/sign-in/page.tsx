import { notFound } from "next/navigation";
import { getTenantBySlug } from "@/lib/tenants";
import { getAllCountries, getCountryOptions } from "@/lib/phone";
import { SignInFlow } from "@/components/SignInFlow";

export default async function SignInPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const tenant = getTenantBySlug(slug);
  if (!tenant) notFound();

  const countries = getCountryOptions(tenant.allowedCountries);
  const defaultCountry =
    countries.find((c) => c.code === tenant.defaultCountry) ??
    getAllCountries().find((c) => c.code === tenant.defaultCountry) ??
    countries[0];

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <SignInFlow tenant={tenant} countries={countries} defaultCountry={defaultCountry} />
    </main>
  );
}
