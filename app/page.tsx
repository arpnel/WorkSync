import Features from "@/components/dashboard/features-1"
import FooterSection from "@/components/dashboard/footer-four"
import HeroSection from "@/components/dashboard/hero-section-one"
import StatsSection from "@/components/dashboard/stats-two"

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
