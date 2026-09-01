export type Profile = {
  /* ---------------- Users ---------------- */

  user_id: string
  email: string
  role: "client" | "freelancer" | "admin"

  /* ---------------- profiles ---------------- */

  first_name: string
  last_name: string

  avatar_url: string | null
  bio: string | null
  location: string | null

  display_name: string | null
  banner_url: string | null

  account_setup_completed: boolean

  province: string | null
  city: string | null
  english_proficiency: string | null

  /* ---------------- freelancer_profiles ---------------- */

  headline: string | null
  hourly_rate: number | null
  verification_status: string | null

  /* ---------------- Computed data ---------------- */

  rating: number | null
  reviews_count: number
  projects_completed: number
  total_earnings: number | null

  /* ---------------- Timestamps ---------------- */

  created_at: string
  updated_at: string
}


/**
 * Skill type
 *
 * Based on:
 * - skills
 */
export type Skill = {
  id: string
  name: string
  created_at?: string
}


/**
 * Freelancer skill relationship
 *
 * Based on:
 * - freelancer_skills
 */
export type FreelancerSkill = {
  freelancer_id: string
  skill_id: string
  created_at: string
}


/**
 * Freelancer category relationship
 *
 * Based on:
 * - freelancer_categories
 */
export type FreelancerCategory = {
  freelancer_id: string
  category_id: string
  created_at: string
}


/**
 * Portfolio project type
 *
 * Based on:
 * - portfolio
 */
export type PortfolioProject = {
  portfolio_id: string
  freelancer_id: string

  title: string
  description: string | null

  project_url: string | null
  thumbnail_image_id: string | null

  created_at: string
}


/**
 * Portfolio image type
 *
 * Based on:
 * - portfolio_images
 */
export type PortfolioImage = {
  id: string
  portfolio_id: string

  image_url: string
  display_order: number

  created_at: string
}


/**
 * Service type
 *
 * Based on:
 * - services
 *
 * Includes related category/profile information
 * used by the profile UI.
 */
export type Service = {
  id: string

  freelancer_id?: string
  category_id?: string

  title: string
  description: string

  price: number
  pricing_mode?: string

  deliveryTimeDays: number
  revisionCount: number

  service_type: string
  status?: string

  slug?: string
  cover_image_url: string | null

  category: string

  display_name: string | null
  avatar_url: string | null

  created_at: string
  updated_at?: string
}


/**
 * Service media type
 *
 * Based on:
 * - service_media
 */
export type ServiceMedia = {
  media_id: string
  service_id: string

  media_url: string
  media_type: string
  display_order: number

  created_at: string
}


/**
 * Service milestone type
 *
 * Based on:
 * - service_milestones
 */
export type ServiceMilestone = {
  service_milestone_id: string
  service_id: string

  title: string
  description: string | null
  amount: number

  display_order: number

  created_at: string
}


/**
 * Review type
 *
 * Based on:
 * - reviews
 *
 * Client information is obtained separately
 * from Users/profiles when needed.
 */
export type Review = {
  review_id: string

  rating: number
  comment: string | null

  created_at: string

  project_id: string
  client_id: string
  freelancer_id: string

  reviewer_role: string
}


/**
 * Job category type
 *
 * Based on:
 * - job_categories
 */
export type JobCategory = {
  id: string
  name: string
  created_at: string
}


/**
 * Category-skill relationship
 *
 * Based on:
 * - category_skills
 */
export type CategorySkill = {
  category_id: string
  skill_id: string
}


/**
 * Update profile payload
 *
 * Fields from profiles and freelancer_profiles
 * that can be edited through the profile UI.
 */
export type UpdateProfilePayload = {
  /* ---------------- profiles ---------------- */

  first_name?: string
  last_name?: string

  avatar_url?: string | null
  banner_url?: string | null

  bio?: string | null
  location?: string | null

  display_name?: string | null

  province?: string | null
  city?: string | null
  english_proficiency?: string | null

  /* ---------------- freelancer_profiles ---------------- */

  headline?: string | null
  hourly_rate?: number | null
}

