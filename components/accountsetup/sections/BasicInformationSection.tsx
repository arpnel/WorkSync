"use client";

import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { listProvinces, listMuncities } from "@jobuntux/psgc";

import { ENGLISH_PROFICIENCY } from "@/constants/account-setup.constants";

import type { ClientSetupValues } from "@/types/account-setup.types";

type TValues = ClientSetupValues;

interface BasicInformationSectionProps {
  values: TValues;
  errors: Partial<Record<keyof TValues, string>>;
  handleChange: (field: keyof TValues, value: TValues[keyof TValues]) => void;
}

export function BasicInformationSection({
  values,
  errors,
  handleChange,
}: BasicInformationSectionProps) {
  const [provinceFocused, setProvinceFocused] = useState(false);
  const [cityFocused, setCityFocused] = useState(false);

  // Load all Philippine provinces once
  const provinces = useMemo(() => listProvinces(), []);

  // Find the selected province
  const selectedProvince = useMemo(
    () =>
      provinces.find(
        (province) =>
          province.provName.toLowerCase() === values.province.toLowerCase(),
      ),
    [provinces, values.province],
  );

  // Load cities/municipalities for the selected province
  const cities = useMemo(() => {
    if (!selectedProvince) {
      return [];
    }

    return listMuncities(selectedProvince.provCode);
  }, [selectedProvince]);

  // Filter provinces based on what the user types
  const filteredProvinces = useMemo(() => {
    const search = values.province.trim().toLowerCase();

    if (!search) {
      return provinces;
    }

    return provinces.filter((province) =>
      province.provName.toLowerCase().includes(search),
    );
  }, [provinces, values.province]);

  // Filter cities based on what the user types
  const filteredCities = useMemo(() => {
    const search = values.city.trim().toLowerCase();

    if (!search) {
      return cities;
    }

    return cities.filter((city) =>
      city.munCityName.toLowerCase().includes(search),
    );
  }, [cities, values.city]);

  const handleProvinceInput = (value: string) => {
    handleChange("province", value);
    handleChange("city", "");
  };

  const handleProvinceSelect = (provinceName: string) => {
    handleChange("province", provinceName);
    handleChange("city", "");
    setProvinceFocused(false);
  };

  const handleCitySelect = (cityName: string) => {
    handleChange("city", cityName);
    setCityFocused(false);
  };

  return (
    <section className="rounded-2xl border bg-background p-6 shadow-sm">
      <div className="mb-5 flex items-center gap-3">
        <h3 className="text-sm font-semibold">Basic Information</h3>

        <div className="h-px flex-1 bg-border" />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {/* First Name */}
        <div className="space-y-2">
          <Label htmlFor="firstName">
            First Name <span className="text-destructive">*</span>
          </Label>

          <Input
            id="firstName"
            value={values.firstName}
            onChange={(e) => handleChange("firstName", e.target.value)}
          />

          {errors.firstName && (
            <p className="text-xs text-destructive">{errors.firstName}</p>
          )}
        </div>

        {/* Last Name */}
        <div className="space-y-2">
          <Label htmlFor="lastName">
            Last Name <span className="text-destructive">*</span>
          </Label>

          <Input
            id="lastName"
            value={values.lastName}
            onChange={(e) => handleChange("lastName", e.target.value)}
          />

          {errors.lastName && (
            <p className="text-xs text-destructive">{errors.lastName}</p>
          )}
        </div>

        {/* Display Name */}
        <div className="space-y-2">
          <Label htmlFor="display_name">Display Name</Label>

          <Input
            id="display_name"
            value={values.display_name}
            onChange={(e) => handleChange("display_name", e.target.value)}
          />
        </div>

        {/* Province */}
        <div className="space-y-2">
          <Label htmlFor="province">
            Province <span className="text-destructive">*</span>
          </Label>

          <div className="relative">
            <Input
              id="province"
              placeholder="Search province..."
              value={values.province}
              autoComplete="off"
              onFocus={() => setProvinceFocused(true)}
              onChange={(e) => handleProvinceInput(e.target.value)}
              onBlur={() => {
                setTimeout(() => setProvinceFocused(false), 150);
              }}
            />

            {provinceFocused && (
              <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-xl border bg-background p-1 shadow-lg">
                {filteredProvinces.length > 0 ? (
                  filteredProvinces.map((province) => (
                    <button
                      key={province.provCode}
                      type="button"
                      className="w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleProvinceSelect(province.provName)}
                    >
                      {province.provName}
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-2 text-sm text-muted-foreground">
                    No province found.
                  </p>
                )}
              </div>
            )}
          </div>

          {errors.province && (
            <p className="text-xs text-destructive">{errors.province}</p>
          )}
        </div>

        {/* City / Municipality */}
        <div className="space-y-2">
          <Label htmlFor="city">
            City / Municipality <span className="text-destructive">*</span>
          </Label>

          <div className="relative">
            <Input
              id="city"
              placeholder={
                selectedProvince
                  ? "Search city or municipality..."
                  : "Select province first"
              }
              value={values.city}
              disabled={!selectedProvince}
              autoComplete="off"
              onFocus={() => setCityFocused(true)}
              onChange={(e) => handleChange("city", e.target.value)}
              onBlur={() => {
                setTimeout(() => setCityFocused(false), 150);
              }}
            />

            {cityFocused && selectedProvince && (
              <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-xl border bg-background p-1 shadow-lg">
                {filteredCities.length > 0 ? (
                  filteredCities.map((city) => (
                    <button
                      key={city.munCityCode}
                      type="button"
                      className="w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleCitySelect(city.munCityName)}
                    >
                      {city.munCityName}
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-2 text-sm text-muted-foreground">
                    No city or municipality found.
                  </p>
                )}
              </div>
            )}
          </div>

          {errors.city && (
            <p className="text-xs text-destructive">{errors.city}</p>
          )}
        </div>

        {/* English Proficiency */}
        <div className="space-y-2">
          <Label htmlFor="englishProficiency">
            English Proficiency <span className="text-destructive">*</span>
          </Label>

          <Select
            value={values.englishProficiency}
            onValueChange={(value) => handleChange("englishProficiency", value)}
          >
            <SelectTrigger id="englishProficiency">
              <SelectValue placeholder="Select proficiency" />
            </SelectTrigger>

            <SelectContent position="popper" side="bottom" sideOffset={4}>
              {ENGLISH_PROFICIENCY.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {errors.englishProficiency && (
            <p className="text-xs text-destructive">
              {errors.englishProficiency}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
