// Public hook surface, re-exported from the domain files beside it.
//
// WHY A BARREL. Every screen imports from '../hooks', and keeping that true is
// what let the 681-line original be split without touching a single page. The
// file it replaced held forty-odd hooks across every domain in the app, so any
// change to an attendance hook dirtied the module twelve pages depend on.
//
// WHERE THINGS LIVE. Add a hook to the domain file it belongs to and re-export
// it here — not here directly. This file should stay a list of names.
//
//   cache.js               the two staleTime/gcTime profiles, shared
//   core.js                context accessors + UI primitives; no API imports
//   useHierarchy.js        Pradesh / Mandal / Sabha
//   useLookups.js          form dropdowns, PIN code, mobile check, /users/me
//   useUsers.js            the member list, one record, row actions, sub-resources
//   usePermissionsData.js  another user's matrix, and writing it back
//   useAttendance.js       Sabhas, schedules, marking
//   useDashboard.js        /dashboard's own endpoint — the overall / self split
//   useReports.js          Reports-screen figures, trends, activity feed, module lists
//   usePagination.js       the 100/10 block strategy (unchanged)
//   useFilterState.js      per-screen filter memory (unchanged)

export { HIERARCHY_CACHE, LOOKUP_CACHE } from './cache';

export {
  useAuth, usePermissions, useToast,
  useDisclosure, useDebounced, useDismissable, useTableRows,
} from './core';
export { useNavigation } from './useNavigation';

export {
  usePradeshList, useMandals, useSabhas, useSabhaById, useMandalById,
  useMyGroupLeaderships,
} from './useHierarchy';

export {
  useFeatures,
  useCategories, useRoles, useEducationLevels, useJobIndustries,
  useNaturesOfBusiness, useMandalUsers, useRelations, useFollowupPersons,
  useMe, useAddressByPincode, useMobileCheck,
} from './useLookups';

export {
  useMembers, useSabhaMembers, useTodayBirthdays, useSendBirthdayWish, useMyBirthdayWishes,
  useProfile, useUserListCache, useMemberStatusUpdate,
  useCreateUser, useCreateChild, useUpdateUser, useAssignableRoles, useUpdateRole,
  useUpdateFollowup, useQuickTransfer,
  useUserEducations, useUserJobs, useUserFamily,
  useEducationMutations, useJobMutations, useFamilyMutations,
} from './useUsers';

export { useUserPermissions, useSyncPermissions } from './usePermissionsData';

// The Job Portal — vacancies on a board, and the applications against them.
// Distinct from `useJobMutations` above, which writes a MEMBER's own job
// history on the user form.
export {
  useJobPosts, useMyJobPosts, useJobPostMutations,
  useJobApplications, useJobApplicationMutations,
} from './useJobs';

export {
  useProfileImage, useUploadProfileImage, useRemoveProfileImage, useMyResumes, useResumeMutations,
  useRegenerateQr, useSelfSave,
  // A photo replaced in this session lives at the address the old one did, so
  // anything showing one from outside useProfileImage stamps it too.
  usePhotoStamp, stampPhotoUrl,
} from './useProfileExtras';

export {
  useSabhaDetails, useSabhaSchedules, useAttendanceSummary, usePriorWeek,
  useMarkAttendance, useCreateAttendanceRecord, useSaveAttendanceRecord,
  useCancelSabhaDetail,
} from './useAttendance';

// /dashboard reads its OWN endpoint, not the Reports one — see
// services/dashboardService.js for why the two are separate.
export {
  useDashboardOverview,
  usePresentAbsent,
  usePresentAbsentMembers,
  hasOverallData,
  hasSelfData,
} from './useDashboard';

// Daily Thoughts — file-backed on the server (no DB table); see
// services/thoughtsService.js.
export { useRandomThought, useTodaysThoughtImage, useAllThoughts, useThoughtMutations } from './useThoughts';

export {
  useOverview, useCompare, useOverviewMembers, useWeeklyTrends, useWeeklyReports, useActivityLogs, useModuleList,
  useSabhaReport, useSabhaReportExport, useWeeklySabhaReport, useSittingReportHeads,
  useYuvaSevaReport, useAddYuvaSeva,
  useReportDownload, useReportExportFilters,
} from './useReports';

// Pagination starts at constants/pagination.js's DEFAULT_PAGE_SIZE in both
// modes, and the reader changes it from the pager's Show dropdown. Both hooks
// return { pageSize, setPageSize }; changing the size resets to page 1.
export { useClientPagination, useServerPagination } from './usePagination';
export { useFilterState, clearAllFilterState } from './useFilterState';
