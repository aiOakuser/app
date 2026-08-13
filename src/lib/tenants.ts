export type TenantConfig = {
  slug: string;
  displayName: string;
  accent: string;
  accentSoft: string;
  allowedCountries: string[];
  defaultCountry: string;
};

const TENANTS: TenantConfig[] = [
  {
    slug: "riverstone-dental",
    displayName: "Riverstone Dental",
    accent: "#0e6e63",
    accentSoft: "#dcede9",
    allowedCountries: ["US", "CA"],
    defaultCountry: "US",
  },
  {
    slug: "marigold-salon",
    displayName: "Marigold Salon & Spa",
    accent: "#b4682a",
    accentSoft: "#f3e3d4",
    allowedCountries: ["US"],
    defaultCountry: "US",
  },
  {
    slug: "northline-vet",
    displayName: "Northline Veterinary",
    accent: "#3457a6",
    accentSoft: "#dde5f5",
    allowedCountries: ["US", "CA", "GB"],
    defaultCountry: "GB",
  },
];

export function listTenants(): TenantConfig[] {
  return TENANTS;
}

export function getTenantBySlug(slug: string): TenantConfig | undefined {
  return TENANTS.find((t) => t.slug === slug);
}
