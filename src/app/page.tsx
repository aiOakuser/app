import Link from "next/link";
import { listTenants } from "@/lib/tenants";

export default function HomePage() {
  const tenants = listTenants();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-6 py-16">
      <p className="mb-2 text-[13px] font-medium uppercase tracking-wide text-neutral-400">
        GDH Appointments
      </p>
      <h1 className="mb-3 text-2xl font-semibold text-neutral-900">
        Reference sign-in
      </h1>
      <p className="mb-10 max-w-md text-[15px] text-neutral-500">
        In production a business is resolved from its subdomain or custom
        domain. Locally, pick one to see its own branded sign-in.
      </p>

      <div className="flex flex-col gap-3">
        {tenants.map((tenant) => (
          <Link
            key={tenant.slug}
            href={`/t/${tenant.slug}/sign-in`}
            className="group flex items-center justify-between rounded-2xl border border-neutral-200 px-5 py-4 transition hover:border-neutral-300"
          >
            <span className="flex items-center gap-3">
              <span
                className="h-8 w-8 rounded-lg"
                style={{ background: tenant.accent }}
                aria-hidden
              />
              <span>
                <span className="block text-[15px] font-medium text-neutral-900">
                  {tenant.displayName}
                </span>
                <span className="block text-[13px] text-neutral-400">
                  {tenant.slug}.gdhappointments.com
                </span>
              </span>
            </span>
            <span className="text-neutral-300 transition group-hover:text-neutral-500">
              →
            </span>
          </Link>
        ))}
      </div>
    </main>
  );
}
