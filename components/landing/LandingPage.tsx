"use client";
import HeroSection from "@/components/dashboard/hero-section-one";
import Features from "@/components/dashboard/features-1";
import StatsSection from "@/components/dashboard/stats-two";
import FooterSection from "@/components/dashboard/footer-four";
export default function LandingPage() {
  return (
    <div
      onClick={(event) => {
        const anchor =
          event.target instanceof Element ? event.target.closest("a") : null;
        if (
          !anchor ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        const href = anchor.getAttribute("href");
        if (href !== "#features" && href !== "#about") return;
        const section = document.getElementById(href.slice(1));
        if (!section) return;
        event.preventDefault();
        history.replaceState(null, "", href);
        requestAnimationFrame(() =>
          section.scrollIntoView({
            behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
              ? "auto"
              : "smooth",
            block: "start",
          }),
        );
      }}
    >
      <HeroSection />
      <Features />
      <StatsSection />
      <FooterSection />
    </div>
  );
}
