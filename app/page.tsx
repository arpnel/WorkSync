import Features from "@/components/features-1"
import FooterSection from "@/components/footer-four"
import HeroSection from "@/components/hero-section-one"
import StatsSection from "@/components/stats-two"
import { Button } from "@/components/ui/button"
import { Stats } from "node:fs"

export default function Page() {
  return (
    <div>
      <HeroSection />
      <Features />
      <StatsSection />
      <FooterSection />
    </div>
  )
}
