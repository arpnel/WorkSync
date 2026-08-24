
export type Freelancer = {
  // Proposal
  proposalid: number;
  projectid: number;
  freelancerid: number;

  // Basic Information
  name: string;
  job: string;
  rate: number;

  // Media
  avatar: string;
  logo: string;

  // Marketplace
  rating?: number;
  reviewCount?: number;
  description?: string;
};

export interface MarketplaceFilters {
  search: string;

  // Sorting
  relevance: boolean;
  latest: boolean;
  topSales: boolean;

  // Listing Type
  freelancers: boolean;
  bid: boolean;

  // Price
  minPrice: number | null;
  maxPrice: number | null;

  // Rating
  rating: number;
}

export interface MarketplaceHeaderProps {
  search: string;
  onSearchChange: (value: string) => void;
  onSearch: () => void;
  onFilterClick: () => void;
  onCreateClick: () => void;
}