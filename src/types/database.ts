// Hand-maintained mirror of supabase/migrations. Regenerate with
// `supabase gen types typescript --local > src/types/database.ts` once a local stack runs.

export type MembershipRole = 'owner' | 'member'
export type RequestStatus = 'pending' | 'approved' | 'rejected'
export type VoteType = 'keep' | 'let_go' | 'want'

export type Profile = {
  id: string
  display_name: string
  created_at: string
  updated_at: string
}

export type Group = {
  id: string
  name: string
  owner_id: string
  created_at: string
}

export type GroupMember = {
  group_id: string
  user_id: string
  role: MembershipRole
  joined_at: string
}

export type Invitation = {
  id: string
  group_id: string
  created_by: string
  token_hash: string
  created_at: string
  expires_at: string
  revoked_at: string | null
  redeemed_at: string | null
  redeemed_by: string | null
}

export type MembershipRequest = {
  id: string
  group_id: string
  user_id: string
  invitation_id: string | null
  message: string
  status: RequestStatus
  created_at: string
  reviewed_by: string | null
  reviewed_at: string | null
}

export type ClothingItem = {
  id: string
  group_id: string
  uploader_id: string
  storage_path: string
  title: string
  created_at: string
  retention_deadline: string
}

export type Vote = {
  item_id: string
  voter_id: string
  vote: VoteType
  created_at: string
  updated_at: string
}

export type GroupFeedState = {
  group_id: string
  version: number
  updated_at: string
}

export type VoteCounts = {
  item_id: string
  keep_count: number
  let_go_count: number
  want_count: number
}

type Row<T> = { Row: T; Insert: Partial<T>; Update: Partial<T>; Relationships: [] }

export interface Database {
  public: {
    Tables: {
      profiles: Row<Profile>
      groups: Row<Group>
      group_members: Row<GroupMember>
      invitations: Row<Invitation>
      membership_requests: Row<MembershipRequest>
      clothing_items: Row<ClothingItem>
      votes: Row<Vote>
      group_feed_state: Row<GroupFeedState>
    }
    Views: Record<string, never>
    Functions: {
      create_group: { Args: { p_name: string }; Returns: Group }
      create_invitation: {
        Args: { p_group_id: string }
        Returns: { id: string; token: string; expires_at: string }[]
      }
      revoke_invitation: { Args: { p_invitation_id: string }; Returns: undefined }
      invitation_preview: {
        Args: { p_token: string }
        Returns: { group_name: string | null; valid: boolean }[]
      }
      redeem_invitation: { Args: { p_token: string; p_message?: string }; Returns: MembershipRequest }
      review_membership_request: {
        Args: { p_request_id: string; p_approve: boolean }
        Returns: MembershipRequest
      }
      transfer_group_ownership: { Args: { p_group_id: string; p_new_owner: string }; Returns: undefined }
      cast_vote: { Args: { p_item_id: string; p_vote: VoteType }; Returns: Vote }
      group_vote_counts: { Args: { p_group_id: string }; Returns: VoteCounts[] }
      my_retention_notices: { Args: Record<string, never>; Returns: ClothingItem[] }
    }
    Enums: {
      membership_role: MembershipRole
      request_status: RequestStatus
      vote_type: VoteType
    }
    CompositeTypes: Record<string, never>
  }
}
