// The user form's sections. Each renders one `kind` from the schema in
// utils/userFormSchema.js; the page orchestrates them and owns the values.
export { default as PlainField } from './PlainField';
export { default as HierarchySection } from './HierarchySection';
export { default as PincodeSection } from './PincodeSection';
export { default as RepeatableSection } from './RepeatableSection';
export { default as FamilyRoster } from './FamilyRoster';
export {
  COL_CLASS, FIELD_CLASS, applyOwnPlacement, labelFor, readAddress, toAddressRows,
} from './shared';
// Self-edit only: what goes through approval, and what is already waiting on it.
export {
  APPROVAL_NOTICE_BY_TAB, ApprovalNotice, PendingApprovalCard, needsApproval,
} from './ApprovalNotice';
