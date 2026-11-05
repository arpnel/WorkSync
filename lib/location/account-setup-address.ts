import {
  getAllProvinces,
  getMunicipalitiesByProvince,
  type PHMunicipality,
  type PHProvince,
} from "@aivangogh/ph-address";

export const NCR_REGION_CODE = "1300000000";
export const METRO_MANILA_PROVINCE = {
  name: "Metro Manila",
  psgcCode: NCR_REGION_CODE,
  regionCode: NCR_REGION_CODE,
} satisfies PHProvince;

export function getAccountSetupProvinces(): readonly PHProvince[] {
  return [...getAllProvinces(), METRO_MANILA_PROVINCE].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

export function getAccountSetupMunicipalities(
  provinceCode: string,
): readonly PHMunicipality[] {
  return getMunicipalitiesByProvince(provinceCode);
}

export function normalizeAccountSetupLocalityName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/^(?:city|municipality)\s+of\s+/i, "")
    .replace(/\s+(?:city|municipality)$/i, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function findAccountSetupMunicipality(
  provinceCode: string,
  name: string,
): PHMunicipality | undefined {
  const normalizedName = normalizeAccountSetupLocalityName(name);
  if (!normalizedName) return undefined;

  return getAccountSetupMunicipalities(provinceCode).find(
    (municipality) =>
      normalizeAccountSetupLocalityName(municipality.name) === normalizedName,
  );
}
