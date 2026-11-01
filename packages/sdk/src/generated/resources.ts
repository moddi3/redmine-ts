// Generated from spec/redmine-openapi/*.yaml by `vp run gen`. Do not edit.

import type { CallOptions } from "../core/config.ts";
import type { Listing } from "../core/listing.ts";
import type { Included } from "../core/op.ts";
import type { AtLeast } from "../core/version.ts";
import type {
  AddRelatedIssueInput,
  AddUserToGroupInput,
  AddWatcherInput,
  ArchiveProjectInput,
  CloseProjectInput,
  CreateFileInput,
  CreateGroupInput,
  CreateIssueCategoryInput,
  CreateIssueInput,
  CreateIssueRelationInput,
  CreateMembershipInput,
  CreateNewsInput,
  CreateProjectInput,
  CreateTimeEntryInput,
  CreateUserInput,
  CreateVersionInput,
  DeleteAttachmentInput,
  DeleteGroupInput,
  DeleteIssueCategoryInput,
  DeleteIssueInput,
  DeleteIssueRelationInput,
  DeleteMembershipInput,
  DeleteNewsInput,
  DeleteProjectInput,
  DeleteTimeEntryInput,
  DeleteUserInput,
  DeleteVersionInput,
  DeleteWikiPageInput,
  GetAttachmentInput,
  GetCurrentUserInclude,
  GetCurrentUserInput,
  GetCustomFieldsInput,
  GetDocumentCategoriesInput,
  GetFilesInput,
  GetGroupInclude,
  GetGroupInput,
  GetGroupsInput,
  GetIssueCategoriesInput,
  GetIssueCategoryInput,
  GetIssueInclude,
  GetIssueInput,
  GetIssuePrioritiesInput,
  GetIssueRelationInput,
  GetIssueRelationsInput,
  GetIssueStatusesInput,
  GetIssuesInclude,
  GetIssuesInput,
  GetMembershipInput,
  GetMembershipsInput,
  GetMyAccountInput,
  GetNewsInclude,
  GetNewsInput,
  GetNewsListByProjectInput,
  GetNewsListInput,
  GetProjectInclude,
  GetProjectInput,
  GetProjectsInclude,
  GetProjectsInput,
  GetQueriesInput,
  GetRoleInput,
  GetRolesInput,
  GetSearchByProjectInput,
  GetSearchInput,
  GetTimeEntriesInput,
  GetTimeEntryActivitiesInput,
  GetTimeEntryInput,
  GetTrackersInput,
  GetUserInclude,
  GetUserInput,
  GetUsersInclude,
  GetUsersInput,
  GetVersionInput,
  GetVersionsByProjectInput,
  GetWikiPageByVersionInclude,
  GetWikiPageByVersionInput,
  GetWikiPageInclude,
  GetWikiPageInput,
  GetWikiPagesInput,
  RemoveRelatedIssueInput,
  RemoveUserFromGroupInput,
  RemoveUsersFromGroupInput,
  RemoveWatcherInput,
  ReopenProjectInput,
  UnarchiveProjectInput,
  UpdateAttachmentInput,
  UpdateGroupInput,
  UpdateIssueCategoryInput,
  UpdateIssueInput,
  UpdateJournalInput,
  UpdateMembershipInput,
  UpdateMyAccountInput,
  UpdateNewsInput,
  UpdateProjectInput,
  UpdateTimeEntryInput,
  UpdateUserInput,
  UpdateVersionInput,
  UpdateWikiPageInput,
} from "./inputs.ts";
import type {
  Attachment,
  CustomField,
  DocumentCategory,
  File,
  Group,
  GroupSummary,
  IdName,
  Issue,
  IssueCategory,
  IssuePriority,
  IssueRelation,
  IssueStatus,
  IssueSummary,
  Membership,
  MyAccount,
  News,
  Project,
  ProjectSummary,
  Query,
  Role,
  Search,
  TimeEntry,
  TimeEntryActivity,
  Tracker,
  User,
  UserSummary,
  Version,
  VersionSummary,
  WikiPage,
  WikiPageSummary,
} from "./schemas.ts";
import type { RedmineVersion } from "./versions.ts";

/**
 * Issues.
 * @see https://www.redmine.org/projects/redmine/wiki/Rest_Issues
 */
export interface IssuesNamespace {
  /**
   * List issues
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_Issues#Listing-issues
   */
  list<const I extends GetIssuesInclude = never>(
    input?: GetIssuesInput<I>,
    options?: CallOptions,
  ): Listing<
    [I] extends [never] ? IssueSummary : Included<IssueSummary, Extract<I, "attachments">>
  >;

  /**
   * Create issue
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_Issues#Creating-an-issue
   */
  create(input: CreateIssueInput, options?: CallOptions): Promise<IssueSummary>;

  /**
   * Show issue
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_Issues#Showing-an-issue
   */
  get<const I extends GetIssueInclude = never>(
    input: GetIssueInput<I>,
    options?: CallOptions,
  ): Promise<
    [I] extends [never]
      ? Issue
      : Included<
          Issue,
          Extract<I, "attachments" | "changesets" | "journals" | "watchers" | "allowed_statuses">
        >
  >;

  /**
   * Update issue
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_Issues#Updating-an-issue
   */
  update(input: UpdateIssueInput, options?: CallOptions): Promise<void>;

  /**
   * Delete issue
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_Issues#Deleting-an-issue
   */
  delete(input: DeleteIssueInput, options?: CallOptions): Promise<void>;

  /**
   * Add watcher
   *
   * Returns 204 even when the user_id does not exist (the watcher is silently not added). A nonexistent issue yields 403, not 404.
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_Issues#Adding-a-watcher
   */
  addWatcher(input: AddWatcherInput, options?: CallOptions): Promise<void>;

  /**
   * Remove watcher
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_Issues#Removing-a-watcher
   */
  removeWatcher(input: RemoveWatcherInput, options?: CallOptions): Promise<void>;
}

/**
 * Projects.
 * @see https://www.redmine.org/projects/redmine/wiki/Rest_Projects
 */
export interface ProjectsNamespace {
  /**
   * List projects
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_Projects#Listing-projects
   */
  list<const I extends GetProjectsInclude = never>(
    input?: GetProjectsInput<I>,
    options?: CallOptions,
  ): Listing<
    [I] extends [never] ? ProjectSummary : Included<ProjectSummary, Extract<I, "enabled_modules">>
  >;

  /**
   * Create project
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_Projects#Creating-a-project
   */
  create(input: CreateProjectInput, options?: CallOptions): Promise<Project>;

  /**
   * Show project
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_Projects#Showing-a-project
   */
  get<const I extends GetProjectInclude = never>(
    input: GetProjectInput<I>,
    options?: CallOptions,
  ): Promise<[I] extends [never] ? Project : Included<Project, Extract<I, "enabled_modules">>>;

  /**
   * Update project
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_Projects#Updating-a-project
   */
  update(input: UpdateProjectInput, options?: CallOptions): Promise<void>;

  /**
   * Delete project
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_Projects#Deleting-a-project
   */
  delete(input: DeleteProjectInput, options?: CallOptions): Promise<void>;

  /**
   * Archive project
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_Projects#Archiving-a-project
   */
  archive(input: ArchiveProjectInput, options?: CallOptions): Promise<void>;

  /**
   * Unarchive project
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_Projects#Unarchiving-a-project
   */
  unarchive(input: UnarchiveProjectInput, options?: CallOptions): Promise<void>;

  /**
   * Close project
   *
   * Undocumented: This operation is not listed in the official documentation.
   */
  close(input: CloseProjectInput, options?: CallOptions): Promise<void>;

  /**
   * Reopen project
   *
   * Undocumented: This operation is not listed in the official documentation.
   */
  reopen(input: ReopenProjectInput, options?: CallOptions): Promise<void>;
}

/**
 * Project Memberships.
 * @see https://www.redmine.org/projects/redmine/wiki/Rest_Memberships
 */
export interface MembershipsNamespace {
  /**
   * List memberships
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_Memberships#GET
   * @stability alpha
   */
  list(input: GetMembershipsInput, options?: CallOptions): Listing<Membership>;

  /**
   * Create membership
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_Memberships#POST
   * @stability alpha
   */
  create(input: CreateMembershipInput, options?: CallOptions): Promise<Membership>;

  /**
   * Show membership
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_Memberships#GET-2
   * @stability alpha
   */
  get(input: GetMembershipInput, options?: CallOptions): Promise<Membership>;

  /**
   * Update membership
   *
   * Warning: sending an empty role_ids returns 422 but still destroys the membership — role assignments are saved immediately and a member left without roles is removed.
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_Memberships#PUT
   * @stability alpha
   */
  update(input: UpdateMembershipInput, options?: CallOptions): Promise<void>;

  /**
   * Delete membership
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_Memberships#DELETE
   * @stability alpha
   */
  delete(input: DeleteMembershipInput, options?: CallOptions): Promise<void>;
}

/**
 * Users.
 * @see https://www.redmine.org/projects/redmine/wiki/Rest_Users
 */
export interface UsersNamespace {
  /**
   * List users
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_Users#GET
   */
  list<const I extends GetUsersInclude = never>(
    input?: GetUsersInput<I>,
    options?: CallOptions,
  ): Listing<UserSummary>;

  /**
   * Create user
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_Users#POST
   */
  create(input: CreateUserInput, options?: CallOptions): Promise<User>;

  /**
   * Show user
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_Users#GET-2
   */
  get<const I extends GetUserInclude = never>(
    input: GetUserInput<I>,
    options?: CallOptions,
  ): Promise<[I] extends [never] ? User : Included<User, Extract<I, "memberships" | "groups">>>;

  /**
   * Update user
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_Users#PUT
   */
  update(input: UpdateUserInput, options?: CallOptions): Promise<void>;

  /**
   * Delete user
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_Users#DELETE
   */
  delete(input: DeleteUserInput, options?: CallOptions): Promise<void>;

  /**
   * Show current user
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_Users#GET-2
   */
  current<const I extends GetCurrentUserInclude = never>(
    input?: GetCurrentUserInput<I>,
    options?: CallOptions,
  ): Promise<[I] extends [never] ? User : Included<User, Extract<I, "memberships" | "groups">>>;
}

/**
 * Time Entries.
 * @see https://www.redmine.org/projects/redmine/wiki/Rest_TimeEntries
 */
export interface TimeEntriesNamespace {
  /**
   * List time entries
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_TimeEntries#Listing-time-entries
   */
  list(input?: GetTimeEntriesInput, options?: CallOptions): Listing<TimeEntry>;

  /**
   * Create time entry
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_TimeEntries#Creating-a-time-entry
   */
  create(input: CreateTimeEntryInput, options?: CallOptions): Promise<TimeEntry>;

  /**
   * Show time entry
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_TimeEntries#Showing-a-time-entry
   */
  get(input: GetTimeEntryInput, options?: CallOptions): Promise<TimeEntry>;

  /**
   * Update time entry
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_TimeEntries#Updating-a-time-entry
   */
  update(input: UpdateTimeEntryInput, options?: CallOptions): Promise<void>;

  /**
   * Delete time entry
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_TimeEntries#Deleting-a-time-entry
   */
  delete(input: DeleteTimeEntryInput, options?: CallOptions): Promise<void>;
}

/**
 * News.
 * @see https://www.redmine.org/projects/redmine/wiki/Rest_News
 */
export interface NewsNamespace {
  /**
   * List news
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_News#Listing-news
   */
  list(input?: GetNewsListInput, options?: CallOptions): Listing<News>;

  /**
   * Show news
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_News#Showing-a-news-item
   */
  get<const I extends GetNewsInclude = never>(
    input: GetNewsInput<I>,
    options?: CallOptions,
  ): Promise<[I] extends [never] ? News : Included<News, Extract<I, "attachments" | "comments">>>;

  /**
   * Update news
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_News#Updating-a-news-item
   */
  update(input: UpdateNewsInput, options?: CallOptions): Promise<void>;

  /**
   * Delete news
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_News#Deleting-a-news-item
   */
  delete(input: DeleteNewsInput, options?: CallOptions): Promise<void>;

  /**
   * List news by project
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_News#Listing-news
   */
  listByProject(input: GetNewsListByProjectInput, options?: CallOptions): Listing<News>;

  /**
   * Create news
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_News#Creating-a-news-item
   */
  create(input: CreateNewsInput, options?: CallOptions): Promise<void>;
}

/**
 * Issue Relations.
 * @see https://www.redmine.org/projects/redmine/wiki/Rest_IssueRelations
 */
export interface RelationsNamespace {
  /**
   * List issue relations
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_IssueRelations#GET
   * @stability alpha
   */
  list(input: GetIssueRelationsInput, options?: CallOptions): Listing<IssueRelation>;

  /**
   * Create issue relation
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_IssueRelations#POST
   * @stability alpha
   */
  create(input: CreateIssueRelationInput, options?: CallOptions): Promise<IssueRelation>;

  /**
   * Show issue relation
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_IssueRelations#GET-2
   * @stability alpha
   */
  get(input: GetIssueRelationInput, options?: CallOptions): Promise<IssueRelation>;

  /**
   * Delete issue relation
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_IssueRelations#DELETE
   * @stability alpha
   */
  delete(input: DeleteIssueRelationInput, options?: CallOptions): Promise<void>;
}

/**
 * Versions.
 * @see https://www.redmine.org/projects/redmine/wiki/Rest_Versions
 */
export interface VersionsNamespace {
  /**
   * List versions by project
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_Versions#GET
   * @stability alpha
   */
  list(input: GetVersionsByProjectInput, options?: CallOptions): Listing<VersionSummary>;

  /**
   * Create version
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_Versions#POST
   * @stability alpha
   */
  create(input: CreateVersionInput, options?: CallOptions): Promise<Version>;

  /**
   * Show version
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_Versions#GET-2
   * @stability alpha
   */
  get(input: GetVersionInput, options?: CallOptions): Promise<Version>;

  /**
   * Update version
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_Versions#PUT
   * @stability alpha
   */
  update(input: UpdateVersionInput, options?: CallOptions): Promise<void>;

  /**
   * Delete version
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_Versions#DELETE
   * @stability alpha
   */
  delete(input: DeleteVersionInput, options?: CallOptions): Promise<void>;
}

/**
 * Wiki Pages.
 * @see https://www.redmine.org/projects/redmine/wiki/Rest_WikiPages
 */
export interface WikiNamespace {
  /**
   * List wiki pages
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_WikiPages#Getting-the-pages-list-of-a-wiki
   * @stability alpha
   */
  list(input: GetWikiPagesInput, options?: CallOptions): Listing<WikiPageSummary>;

  /**
   * Show wiki page
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_WikiPages#Getting-a-wiki-page
   * @stability alpha
   */
  get<const I extends GetWikiPageInclude = never>(
    input: GetWikiPageInput<I>,
    options?: CallOptions,
  ): Promise<[I] extends [never] ? WikiPage : Included<WikiPage, Extract<I, "attachments">>>;

  /**
   * Create or update wiki page
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_WikiPages#Creating-or-updating-a-wiki-page
   * @stability alpha
   */
  update(input: UpdateWikiPageInput, options?: CallOptions): Promise<WikiPage | undefined>;

  /**
   * Delete wiki page
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_WikiPages#Deleting-a-wiki-page
   * @stability alpha
   */
  delete(input: DeleteWikiPageInput, options?: CallOptions): Promise<void>;

  /**
   * Show wiki page by specific version
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_WikiPages#Getting-an-old-version-of-a-wiki-page
   * @stability alpha
   */
  getVersion<const I extends GetWikiPageByVersionInclude = never>(
    input: GetWikiPageByVersionInput<I>,
    options?: CallOptions,
  ): Promise<[I] extends [never] ? WikiPage : Included<WikiPage, Extract<I, "attachments">>>;
}

/**
 * Queries.
 * @see https://www.redmine.org/projects/redmine/wiki/Rest_Queries
 */
export interface QueriesNamespace {
  /**
   * List queries
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_Queries#GET
   * @stability alpha
   */
  list(input?: GetQueriesInput, options?: CallOptions): Listing<Query>;
}

/**
 * Attachments.
 * @see https://www.redmine.org/projects/redmine/wiki/Rest_Attachments
 */
export interface AttachmentsNamespace {
  /**
   * Show attachment
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_Attachments#GET
   * @stability alpha
   */
  get(input: GetAttachmentInput, options?: CallOptions): Promise<Attachment>;

  /**
   * Update attachment
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_Attachments#PATCH
   * @stability alpha
   */
  update(input: UpdateAttachmentInput, options?: CallOptions): Promise<void>;

  /**
   * Delete attachment
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_Attachments#DELETE
   * @stability alpha
   */
  delete(input: DeleteAttachmentInput, options?: CallOptions): Promise<void>;
}

/**
 * Issue Statuses.
 * @see https://www.redmine.org/projects/redmine/wiki/Rest_IssueStatuses
 */
export interface IssueStatusesNamespace {
  /**
   * List issue statuses
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_IssueStatuses#GET
   * @stability alpha
   */
  list(input?: GetIssueStatusesInput, options?: CallOptions): Listing<IssueStatus>;
}

/**
 * Trackers.
 * @see https://www.redmine.org/projects/redmine/wiki/Rest_Trackers
 */
export interface TrackersNamespace {
  /**
   * List trackers
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_Trackers#GET
   * @stability alpha
   */
  list(input?: GetTrackersInput, options?: CallOptions): Listing<Tracker>;
}

/**
 * Enumerations.
 * @see https://www.redmine.org/projects/redmine/wiki/Rest_Enumerations
 */
export interface EnumerationsNamespace {
  /**
   * List issue priorities
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_Enumerations#GET
   * @stability alpha
   */
  listIssuePriorities(
    input?: GetIssuePrioritiesInput,
    options?: CallOptions,
  ): Listing<IssuePriority>;

  /**
   * List time entry activities
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_Enumerations#GET-2
   * @stability alpha
   */
  listTimeEntryActivities(
    input?: GetTimeEntryActivitiesInput,
    options?: CallOptions,
  ): Listing<TimeEntryActivity>;

  /**
   * List document categories
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_Enumerations#GET-3
   * @stability alpha
   */
  listDocumentCategories(
    input?: GetDocumentCategoriesInput,
    options?: CallOptions,
  ): Listing<DocumentCategory>;
}

/**
 * Issue Categories.
 * @see https://www.redmine.org/projects/redmine/wiki/Rest_IssueCategories
 */
export interface IssueCategoriesNamespace {
  /**
   * List issue categories
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_IssueCategories#GET
   * @stability alpha
   */
  list(input: GetIssueCategoriesInput, options?: CallOptions): Listing<IssueCategory>;

  /**
   * Create issue category
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_IssueCategories#POST
   * @stability alpha
   */
  create(input: CreateIssueCategoryInput, options?: CallOptions): Promise<IssueCategory>;

  /**
   * Show issue category
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_IssueCategories#GET-2
   * @stability alpha
   */
  get(input: GetIssueCategoryInput, options?: CallOptions): Promise<IssueCategory>;

  /**
   * Update issue category
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_IssueCategories#PUT
   * @stability alpha
   */
  update(input: UpdateIssueCategoryInput, options?: CallOptions): Promise<void>;

  /**
   * Delete issue category
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_IssueCategories#DELETE
   * @stability alpha
   */
  delete(input: DeleteIssueCategoryInput, options?: CallOptions): Promise<void>;
}

/**
 * Roles.
 * @see https://www.redmine.org/projects/redmine/wiki/Rest_Roles
 */
export interface RolesNamespace {
  /**
   * List roles
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_Roles#GET
   * @stability alpha
   */
  list(input?: GetRolesInput, options?: CallOptions): Listing<IdName>;

  /**
   * Show role
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_Roles#GET-2
   * @stability alpha
   */
  get(input: GetRoleInput, options?: CallOptions): Promise<Role>;
}

/**
 * Groups.
 * @see https://www.redmine.org/projects/redmine/wiki/Rest_Groups
 */
export interface GroupsNamespace {
  /**
   * List groups
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_Groups#GET
   * @stability alpha
   */
  list(input?: GetGroupsInput, options?: CallOptions): Listing<GroupSummary>;

  /**
   * Create group
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_Groups#POST
   * @stability alpha
   */
  create(input: CreateGroupInput, options?: CallOptions): Promise<Group>;

  /**
   * Show group
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_Groups#GET-2
   * @stability alpha
   */
  get<const I extends GetGroupInclude = never>(
    input: GetGroupInput<I>,
    options?: CallOptions,
  ): Promise<[I] extends [never] ? Group : Included<Group, Extract<I, "users" | "memberships">>>;

  /**
   * Update group
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_Groups#PUT
   * @stability alpha
   */
  update(input: UpdateGroupInput, options?: CallOptions): Promise<void>;

  /**
   * Delete group
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_Groups#DELETE
   * @stability alpha
   */
  delete(input: DeleteGroupInput, options?: CallOptions): Promise<void>;

  /**
   * Add user to group
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_Groups#POST-2
   * @stability alpha
   */
  addUser(input: AddUserToGroupInput, options?: CallOptions): Promise<void>;

  /**
   * Remove user from group
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_Groups#DELETE-2
   * @stability alpha
   */
  removeUser(input: RemoveUserFromGroupInput, options?: CallOptions): Promise<void>;
}

/**
 * Custom Fields.
 * @see https://www.redmine.org/projects/redmine/wiki/Rest_CustomFields
 */
export interface CustomFieldsNamespace {
  /**
   * List custom fields
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_CustomFields#GET
   * @stability alpha
   */
  list(input?: GetCustomFieldsInput, options?: CallOptions): Listing<CustomField>;
}

/**
 * Search.
 * @see https://www.redmine.org/projects/redmine/wiki/Rest_Search
 */
export interface SearchNamespace {
  /**
   * Search
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_Search#GET
   * @stability alpha
   */
  list(input: GetSearchInput, options?: CallOptions): Listing<Search>;

  /**
   * Search within project
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_Search#GET
   * @stability alpha
   */
  listByProject(input: GetSearchByProjectInput, options?: CallOptions): Listing<Search>;
}

/**
 * Files.
 * @see https://www.redmine.org/projects/redmine/wiki/Rest_Files
 */
export interface FilesNamespace {
  /**
   * List files
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_Files#GET
   * @stability alpha
   */
  list(input: GetFilesInput, options?: CallOptions): Listing<File>;

  /**
   * Create file
   *
   * An invalid or unknown upload token results in 404, not 400 — the controller's 400 render references an API template that does not exist, and the MissingTemplate handler responds with 404.
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_Files#POST
   * @stability alpha
   */
  create(input: CreateFileInput, options?: CallOptions): Promise<void>;
}

/**
 * My Account.
 * @see https://www.redmine.org/projects/redmine/wiki/Rest_MyAccount
 */
export interface MyAccountNamespace {
  /**
   * Show my account
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_MyAccount#GET
   * @stability alpha
   */
  get(input?: GetMyAccountInput, options?: CallOptions): Promise<MyAccount>;

  /**
   * Update my account
   *
   * Requests authenticated via OAuth are rejected with 403, regardless of the token's scopes.
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_MyAccount#PUT
   * @stability alpha
   */
  update(input?: UpdateMyAccountInput, options?: CallOptions): Promise<void>;
}

/**
 * Journals.
 * @see https://www.redmine.org/projects/redmine/wiki/Rest_Journals
 */
export interface JournalsNamespace {
  /**
   * Update journal
   *
   * On Redmine 6.1.0 to 6.1.3 and on 7.0.0, a journal left with empty `notes` and no property changes (`details`) is deleted. On 6.1.4, 7.0.1 and later it is kept and can still be updated, but the issue's `include=journals` response leaves it out until it has notes again.
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_Journals#Updating-a-journal
   * @stability alpha
   */
  update(input: UpdateJournalInput, options?: CallOptions): Promise<void>;
}

/**
 * Repositories.
 */
export interface RepositoriesNamespace {
  /**
   * Add related issue
   *
   * Undocumented: This operation is not listed in the official documentation.
   * @stability alpha
   */
  addRelatedIssue(input: AddRelatedIssueInput, options?: CallOptions): Promise<void>;

  /**
   * Remove related issue
   *
   * Undocumented: This operation is not listed in the official documentation.
   * @stability alpha
   */
  removeRelatedIssue(input: RemoveRelatedIssueInput, options?: CallOptions): Promise<void>;
}

/**
 * Groups.
 * @see https://www.redmine.org/projects/redmine/wiki/Rest_Groups
 */
export interface GroupsSince70 {
  /**
   * Remove users from group
   * @see https://www.redmine.org/projects/redmine/wiki/Rest_Groups
   * @since 7.0
   * @stability alpha
   */
  removeUsers(input: RemoveUsersFromGroupInput, options?: CallOptions): Promise<void>;
}

export interface BaseResources {
  issues: IssuesNamespace;
  projects: ProjectsNamespace;
  memberships: MembershipsNamespace;
  users: UsersNamespace;
  timeEntries: TimeEntriesNamespace;
  news: NewsNamespace;
  relations: RelationsNamespace;
  versions: VersionsNamespace;
  wiki: WikiNamespace;
  queries: QueriesNamespace;
  attachments: AttachmentsNamespace;
  issueStatuses: IssueStatusesNamespace;
  trackers: TrackersNamespace;
  enumerations: EnumerationsNamespace;
  issueCategories: IssueCategoriesNamespace;
  roles: RolesNamespace;
  groups: GroupsNamespace;
  customFields: CustomFieldsNamespace;
  search: SearchNamespace;
  files: FilesNamespace;
  myAccount: MyAccountNamespace;
  journals: JournalsNamespace;
  repositories: RepositoriesNamespace;
}

export interface Additions70 {
  groups: GroupsSince70;
}

/** The generated namespaces available on a server declared as V. */
export type Resources<V extends RedmineVersion> = BaseResources &
  (AtLeast<V, "7.0"> extends true ? Additions70 : unknown);

/** The HTTP method each generated method sends, in every version. `access` narrows the client type by it. */
export interface HttpMethods {
  issues: {
    list: "GET";
    create: "POST";
    get: "GET";
    update: "PUT";
    delete: "DELETE";
    addWatcher: "POST";
    removeWatcher: "DELETE";
  };
  projects: {
    list: "GET";
    create: "POST";
    get: "GET";
    update: "PUT";
    delete: "DELETE";
    archive: "PUT";
    unarchive: "PUT";
    close: "PUT";
    reopen: "PUT";
  };
  memberships: { list: "GET"; create: "POST"; get: "GET"; update: "PUT"; delete: "DELETE" };
  users: {
    list: "GET";
    create: "POST";
    get: "GET";
    update: "PUT";
    delete: "DELETE";
    current: "GET";
  };
  timeEntries: { list: "GET"; create: "POST"; get: "GET"; update: "PUT"; delete: "DELETE" };
  news: {
    list: "GET";
    get: "GET";
    update: "PUT";
    delete: "DELETE";
    listByProject: "GET";
    create: "POST";
  };
  relations: { list: "GET"; create: "POST"; get: "GET"; delete: "DELETE" };
  versions: { list: "GET"; create: "POST"; get: "GET"; update: "PUT"; delete: "DELETE" };
  wiki: { list: "GET"; get: "GET"; update: "PUT"; delete: "DELETE"; getVersion: "GET" };
  queries: { list: "GET" };
  attachments: { get: "GET"; update: "PATCH"; delete: "DELETE" };
  issueStatuses: { list: "GET" };
  trackers: { list: "GET" };
  enumerations: {
    listIssuePriorities: "GET";
    listTimeEntryActivities: "GET";
    listDocumentCategories: "GET";
  };
  issueCategories: { list: "GET"; create: "POST"; get: "GET"; update: "PUT"; delete: "DELETE" };
  roles: { list: "GET"; get: "GET" };
  groups: {
    list: "GET";
    create: "POST";
    get: "GET";
    update: "PUT";
    delete: "DELETE";
    addUser: "POST";
    removeUsers: "DELETE";
    removeUser: "DELETE";
  };
  customFields: { list: "GET" };
  search: { list: "GET"; listByProject: "GET" };
  files: { list: "GET"; create: "POST" };
  myAccount: { get: "GET"; update: "PUT" };
  journals: { update: "PUT" };
  repositories: { addRelatedIssue: "POST"; removeRelatedIssue: "DELETE" };
}
