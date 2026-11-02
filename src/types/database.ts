// Named aliases over the generated database types (src/types/database.gen.ts).
// Regenerate the latter with `npm run db:types` after changing a migration.
import type { Database, Enums, Tables } from './database.gen'

export type { Database, Json, Tables, TablesInsert, TablesUpdate, Enums } from './database.gen'
export { Constants } from './database.gen'
export type MembershipRole = Enums<'membership_role'>
export type RequestStatus = Enums<'request_status'>
export type VoteType = Enums<'vote_type'>

export type Profile = Tables<'profiles'>
export type Group = Tables<'groups'>
export type GroupMember = Tables<'group_members'>
export type Invitation = Tables<'invitations'>
export type MembershipRequest = Tables<'membership_requests'>
export type ClothingItem = Tables<'clothing_items'>
export type Vote = Tables<'votes'>
export type GroupFeedState = Tables<'group_feed_state'>
export type VoteCounts = Database['public']['Functions']['group_vote_counts']['Returns'][number]
export type MyMembershipRequest = Database['public']['Functions']['my_membership_requests']['Returns'][number]
export type Entitlements = Database['public']['Functions']['my_entitlements']['Returns'][number]
export type NotificationRow = Database['public']['Functions']['my_notifications']['Returns'][number]
export type NotificationKind = Enums<'notification_kind'>
export type AccountTier = Enums<'account_tier'>
