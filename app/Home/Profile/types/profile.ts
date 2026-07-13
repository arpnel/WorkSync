/**
 * Main profile type
 * Combines Users + profiles + freelancer_profile
 */
export type Profile = {
  // Users table
  user_id: string
  first_name: string
  last_name: string
  email: string
  role: "client" | "freelancer" | "admin"

  // profiles table
  avatar_url: string | null
  bio: string | null
  location: string | null
  banner_url: string | null


  // freelancer_profile table
  username: string | null
  headline: string | null
  hourly_rate: number | null
  verification_status: string | null

  // Computed data
  rating: number | null
  reviews_count: number
  projects_completed: number
  total_earnings: number | null

  // Timestamps
  created_at: string
  updated_at: string
}


/**
 * Skill type
 */
export type Skill = {
  id: string
  name: string
  endorsed_count: number
}


/**
 * Portfolio project type
 */
export type PortfolioProject = {
  id: string
  user_id: string
  title: string
  description: string
  image_url: string | null
  technologies: string[]
  external_link: string | null
  created_at: string
}


/**
 * Experience entry type
 */
export type Experience = {
  id: string
  user_id: string
  company: string
  title: string
  description: string
  start_date: string
  end_date: string | null
  is_current: boolean
}


/**
 * Education entry type
 */
export type Education = {
  id: string
  user_id: string
  school: string
  degree: string
  field: string
  start_year: number
  end_year: number | null
}


/**
 * Service type
 */
export type Service = {
  id: string
  user_id: string
  name: string
  description: string
  price: number
}


/**
 * Review type
 */
export type Review = {
  id: string
  user_id: string
  client_name: string
  client_avatar: string | null
  rating: number
  text: string
  project_title: string
  created_at: string
}



/**
 * Update payloads
 */

export type UpdateProfilePayload = {
  first_name?: string
  last_name?: string

  avatar_url?: string | null
  banner_url?: string | null

  bio?: string | null
  location?: string | null

  username?: string | null
  headline?: string | null
  hourly_rate?: number | null
}