export interface Member {
  uid: number;
  name?: string;
  dynamic?: boolean;
  live?: boolean;
}

export interface DynamicItem {
  id: string;
  author: string;
  summary: string;
  url: string;
  publishedAt?: number;
}

export interface LiveStatus {
  uid: number;
  name: string;
  isLive: boolean;
  title: string;
  url: string;
}

export interface PollResult {
  dynamicsChecked: number;
  liveUsersChecked: number;
}
