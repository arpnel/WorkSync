"use client";

import { useState } from "react";
import { Building2, Check, FileText, Lock, UploadCloud, UserRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type HiringType = "individual" | "business";

export function ClientHiringTypeSection() {
  const [hiringType, setHiringType] = useState<HiringType>("individual");
  const [businessName, setBusinessName] = useState("");
  const [businessTin, setBusinessTin] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");

  return (
    <section className="rounded-2xl border bg-background p-4 shadow-sm sm:p-6">
      <div className="mb-5">
        <h3 className="text-base font-semibold">Who are you hiring as?</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Tell us whether you’re hiring for yourself or on behalf of a business.
        </p>
      </div>

      <div role="group" aria-label="Choose who you are hiring as" className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          aria-pressed={hiringType === "individual"}
          onClick={() => setHiringType("individual")}
          className={`min-h-32 rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${hiringType === "individual" ? "border-primary bg-primary/10 ring-1 ring-primary" : "bg-muted/50 hover:border-primary/50 hover:bg-muted"}`}
        >
          <span className="mb-3 flex items-center justify-between">
            <UserRound aria-hidden="true" className={`size-6 ${hiringType === "individual" ? "text-primary" : "text-muted-foreground"}`} />
            {hiringType === "individual" && <Check aria-hidden="true" className="size-4 text-primary" />}
          </span>
          <span className="block font-semibold">Individual</span>
          <span className="mt-1 block text-sm text-muted-foreground">I’m hiring for myself or a personal project.</span>
        </button>

        <button
          type="button"
          aria-pressed={hiringType === "business"}
          onClick={() => setHiringType("business")}
          className={`min-h-32 rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${hiringType === "business" ? "border-primary bg-primary/10 ring-1 ring-primary" : "bg-muted/50 hover:border-primary/50 hover:bg-muted"}`}
        >
          <span className="mb-3 flex items-center justify-between">
            <Building2 aria-hidden="true" className={`size-6 ${hiringType === "business" ? "text-primary" : "text-muted-foreground"}`} />
            {hiringType === "business" && <Check aria-hidden="true" className="size-4 text-primary" />}
          </span>
          <span className="block font-semibold">Business or company</span>
          <span className="mt-1 block text-sm text-muted-foreground">I’m hiring on behalf of a registered business or organization.</span>
        </button>
      </div>

      {hiringType === "business" && <div className="mt-4 space-y-5 rounded-xl border bg-muted/20 p-4 sm:p-5" aria-live="polite">
        <div className="space-y-1">
          <h4 className="text-sm font-semibold">Business Information</h4>
          <p className="text-sm text-muted-foreground">Provide basic details to enable billing and invoicing features.</p>
        </div>

        <BusinessPreviewField
          id="client-business-name"
          label="Registered Business Name"
          placeholder="Enter registered business name"
          hint="As registered with BIR, SEC, or DTI."
          value={businessName}
          onChange={setBusinessName}
        />

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="client-business-tin" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tax Identification Number (TIN) <span className="text-destructive">*</span></Label>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-500"><Lock className="size-3" /> Required for business profile</span>
          </div>
          <div className="relative">
            <FileText aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="client-business-tin"
              type="text"
              inputMode="numeric"
              maxLength={17}
              value={[
                businessTin.slice(0, 3),
                businessTin.slice(3, 6),
                businessTin.slice(6, 9),
                businessTin.slice(9),
              ]
                .filter(Boolean)
                .join("-")}
              onChange={(event) => {
                const digits = event.target.value.replace(/\D/g, "").slice(0, 14);
                setBusinessTin(digits);
              }}
              aria-label="Business Tax Identification Number"
              className="h-11 rounded-xl bg-card pl-10 font-mono focus-visible:border-emerald-500 focus-visible:ring-emerald-500"
              placeholder="000-000-000-0000"
            />
          </div>
          <p className="text-xs text-muted-foreground">Enter 12 to 14 digits, including the branch code if applicable. Hyphens separate the first three groups.</p>
        </div>

        <BusinessPreviewField
          id="client-business-address"
          label="Business Address"
          placeholder="Building, street, city, ZIP code"
          hint="Use the address registered for billing and invoicing."
          value={businessAddress}
          onChange={setBusinessAddress}
        />

        <div className="space-y-3 rounded-xl border bg-background/30 p-4">
          <div className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-muted/60 text-muted-foreground">
              <FileText aria-hidden="true" className="size-4" />
            </span>
            <div>
              <h5 className="text-sm font-semibold">BIR Form 2303 (COR)</h5>
              <p className="mt-0.5 text-xs text-muted-foreground">Certificate of Registration for your business</p>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="client-business-bir-preview">Form 2303 document</Label>
            <div id="client-business-bir-preview" className="flex min-h-[76px] w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-3 py-4 text-center">
              <span className="flex items-center gap-2 text-sm font-medium"><UploadCloud aria-hidden="true" className="size-4 shrink-0 text-emerald-500" />Drag &amp; drop your file here or browse</span>
              <span className="text-xs text-muted-foreground">PDF, JPG, or PNG (up to 5 MB)</span>
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">Business details are preview-only and aren’t saved by this setup form.</p>
      </div>}
    </section>
  );
}

function BusinessPreviewField({
  id,
  label,
  placeholder,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  placeholder: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return <div className="space-y-2">
    <Label htmlFor={id} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label} <span className="text-destructive">*</span></Label>
    <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-11 rounded-xl bg-card" />
    <p className="text-xs text-muted-foreground">{hint}</p>
  </div>;
}
