// Entities of ZenMoney API v8.
// Reference: https://github.com/zenmoney/ZenPlugins/wiki/ZenMoney-API

/** Unix timestamp in seconds. */
export type Timestamp = number;
/** Date in 'yyyy-MM-dd' format. */
export type DateString = string;
export type UserId = number;
export type InstrumentId = number;
export type CompanyId = number;
export type AccountId = string;
export type TagId = string;
export type MerchantId = string;

export interface Instrument {
  id: InstrumentId;
  changed: Timestamp;
  title: string;
  /** Currency code, e.g. 'RUB'. */
  shortTitle: string;
  symbol: string;
  /** Price of one unit in rubles. */
  rate: number;
}

export interface Company {
  id: CompanyId;
  changed: Timestamp;
  title: string;
  fullTitle: string | null;
  www: string | null;
  country: string | null;
}

export interface User {
  id: UserId;
  changed: Timestamp;
  login: string | null;
  /** Main currency of the user. */
  currency: InstrumentId;
  /** Family administrator; null for the main user. */
  parent: UserId | null;
}

export type AccountType = 'cash' | 'ccard' | 'checking' | 'loan' | 'deposit' | 'emoney' | 'debt';

export interface Account {
  id: AccountId;
  changed: Timestamp;
  user: UserId;
  role: UserId | null;
  instrument: InstrumentId | null;
  company: CompanyId | null;
  type: AccountType;
  title: string;
  syncID: string[] | null;

  balance: number | null;
  startBalance: number | null;
  creditLimit: number | null;

  /** Whether the account counts towards the total balance. */
  inBalance: boolean;
  savings: boolean | null;
  enableCorrection: boolean;
  enableSMS: boolean;
  archive: boolean;

  // Loans and deposits only.
  capitalization?: boolean | null;
  percent?: number | null;
  startDate?: DateString | null;
  endDateOffset?: number | null;
  endDateOffsetInterval?: 'day' | 'week' | 'month' | 'year' | null;
  payoffStep?: number | null;
  payoffInterval?: 'month' | 'year' | null;
}

export interface Tag {
  id: TagId;
  changed: Timestamp;
  user: UserId;
  title: string;
  /** Parent category; nesting is at most one level deep. */
  parent: TagId | null;
  icon: string | null;
  picture: string | null;
  /** ARGB packed into an integer. */
  color: number | null;
  showIncome: boolean;
  showOutcome: boolean;
  budgetIncome: boolean;
  budgetOutcome: boolean;
  required: boolean | null;
}

export interface Merchant {
  id: MerchantId;
  changed: Timestamp;
  user: UserId;
  title: string;
}

/** Fields shared by transactions, reminders and reminder markers. */
interface OperationFields {
  id: string;
  changed: Timestamp;
  user: UserId;

  incomeInstrument: InstrumentId;
  incomeAccount: AccountId;
  income: number;
  outcomeInstrument: InstrumentId;
  outcomeAccount: AccountId;
  outcome: number;

  tag: TagId[] | null;
  merchant: MerchantId | null;
  payee: string | null;
  comment: string | null;
}

export interface Transaction extends OperationFields {
  created: Timestamp;
  deleted: boolean;
  hold: boolean | null;
  originalPayee: string | null;
  date: DateString;
  mcc: number | null;
  reminderMarker: string | null;

  /** Amounts in the operation currency when it differs from the account currency. */
  opIncome: number | null;
  opIncomeInstrument: InstrumentId | null;
  opOutcome: number | null;
  opOutcomeInstrument: InstrumentId | null;

  latitude: number | null;
  longitude: number | null;
}

export interface Reminder extends OperationFields {
  /** null means a one-time reminder. */
  interval: 'day' | 'week' | 'month' | 'year' | null;
  step: number | null;
  points: number[] | null;
  startDate: DateString;
  endDate: DateString | null;
  notify: boolean;
}

export interface ReminderMarker extends OperationFields {
  date: DateString;
  reminder: string;
  state: 'planned' | 'processed' | 'deleted';
  notify: boolean;
}

export interface Budget {
  changed: Timestamp;
  user: UserId;
  /** null — uncategorized; all-zero UUID — budget for the whole month. */
  tag: TagId | null;
  /** First day of the month. */
  date: DateString;
  income: number;
  incomeLock: boolean;
  outcome: number;
  outcomeLock: boolean;
}

export interface Deletion {
  id: string;
  object: string;
  stamp: Timestamp;
  user: UserId;
}

export interface EntityCollections {
  instrument?: Instrument[];
  company?: Company[];
  user?: User[];
  account?: Account[];
  tag?: Tag[];
  merchant?: Merchant[];
  budget?: Budget[];
  reminder?: Reminder[];
  reminderMarker?: ReminderMarker[];
  transaction?: Transaction[];
  deletion?: Deletion[];
}

export interface DiffRequest extends EntityCollections {
  currentClientTimestamp: Timestamp;
  /** Timestamp from the previous sync; 0 fetches everything. */
  serverTimestamp: Timestamp;
  forceFetch?: Array<keyof EntityCollections>;
}

export interface DiffResponse extends EntityCollections {
  serverTimestamp: Timestamp;
}
