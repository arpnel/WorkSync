export interface MarketplaceCategory {
  name: string;
  services: string[];
}

export const marketplaceCategories: MarketplaceCategory[] = [
  {
    name: "Creative & Design",
    services: [
      "Graphic Design",
      "Logo Design",
      "Brand Identity",
      "Illustration",
      "UI/UX Design",
      "Presentation Design",
      "Print Design",
    ],
  },
  {
    name: "Development & IT",
    services: [
      "Web Development",
      "Mobile App Development",
      "WordPress",
      "Shopify",
      "API Development",
      "Desktop Applications",
      "Cybersecurity",
      "Cloud Computing",
    ],
  },
  {
    name: "Video & Animation",
    services: [
      "Video Editing",
      "Motion Graphics",
      "2D Animation",
      "3D Animation",
      "Visual Effects",
      "Explainer Videos",
      "Intro & Outro",
      "Short-form Content",
    ],
  },
  {
    name: "Writing & Translation",
    services: [
      "Copywriting",
      "Content Writing",
      "Technical Writing",
      "Blog Writing",
      "Translation",
      "Proofreading",
      "Resume Writing",
    ],
  },
  {
    name: "Marketing",
    services: [
      "SEO",
      "Social Media Marketing",
      "Digital Marketing",
      "Email Marketing",
      "Content Marketing",
      "Google Ads",
      "Facebook Ads",
    ],
  },
  {
    name: "AI & Data",
    services: [
      "AI Chatbots",
      "Prompt Engineering",
      "Machine Learning",
      "Data Analysis",
      "Automation",
      "Data Visualization",
      "AI Consulting",
    ],
  },
  {
    name: "Audio & Music",
    services: [
      "Voice Over",
      "Music Production",
      "Podcast Editing",
      "Audio Editing",
      "Sound Design",
    ],
  },
  {
    name: "Business",
    services: [
      "Virtual Assistant",
      "Customer Support",
      "Project Management",
      "Accounting",
      "Bookkeeping",
      "Data Entry",
      "Market Research",
    ],
  },
];