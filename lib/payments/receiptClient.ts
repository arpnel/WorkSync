"use client";
import { supabase } from "@/lib/supabaseClient";
import { openReceiptPdf, receiptDetailsFromSnapshot } from "@/lib/payments/receiptPdf";

async function openReceiptView(paymentId: string, view: "transaction" | "payout", download: boolean) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Sign in to access this receipt.");
  const response = await fetch(`/api/tax-receipts?paymentId=${encodeURIComponent(paymentId)}&view=${view}`, { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
  const body = await response.json();
  if (!response.ok || !body.receipt) throw new Error(body.error || "Receipt unavailable.");

  const details = receiptDetailsFromSnapshot(body.receipt);
  try {
    const logoResponse = await fetch("/worksynclogo.png", { cache: "force-cache" });
    if (logoResponse.ok) {
      const bitmap = await createImageBitmap(await logoResponse.blob());
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d");
      if (context) {
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(bitmap, 0, 0);
        bitmap.close();
        const jpeg = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.9));
        if (jpeg) {
          details.logoJpeg = new Uint8Array(await jpeg.arrayBuffer());
          details.logoWidth = canvas.width;
          details.logoHeight = canvas.height;
        }
      } else {
        bitmap.close();
      }
    }
  } catch {
    // Logo loading is optional; receipt data remains available if conversion fails.
  }
  openReceiptPdf(details, download);
}

export function openSavedTaxReceipt(paymentId: string, download = false) {
  return openReceiptView(paymentId, "transaction", download);
}

export function openFreelancerPayoutStatement(paymentId: string, download = false) {
  return openReceiptView(paymentId, "payout", download);
}
