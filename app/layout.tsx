import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Metadata } from "next";
import {
  Plus_Jakarta_Sans,
  Source_Serif_4,
  JetBrains_Mono,
} from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";

import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

const siteDescription =
  "WorkSync is a Philippine freelance marketplace connecting clients with skilled freelancers.";
const socialImage = "https://worksync.website/opengraph-image.png";

export const metadata: Metadata = {
  metadataBase: new URL("https://worksync.website"),
  title: "WorkSync",
  description: siteDescription,
  openGraph: {
    type: "website",
    url: "https://worksync.website/",
    siteName: "WorkSync",
    title: "WorkSync",
    description: siteDescription,
    images: [
      {
        url: socialImage,
        width: 1200,
        height: 630,
        alt: "WorkSync — Connect. Collaborate. Get Work Done.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "WorkSync",
    description: siteDescription,
    images: [socialImage],
  },
};

const fontSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

const fontSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-source-serif",
  display: "swap",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontMono.variable,
        "font-sans",
        fontSans.variable,
        fontSerif.variable,
      )}
    >
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider>
            {children}
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
