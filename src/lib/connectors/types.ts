// Connector interface — see docs/PRD.md section 7 ("Channel Capability Matrix").
// Every channel implements this interface. Phase 1 ships only MockConnector;
// Phase 2 adds real Instagram/Threads/Blogger connectors behind the same
// interface, so UI and orchestration code never need to change.

export type ChannelName = "INSTAGRAM" | "THREADS" | "BLOGGER";

export interface ConnectorCapability {
  validate: boolean;
  preview: boolean;
  publish: boolean;
  schedule: boolean;
  getStatus: boolean;
  fetchMetrics: boolean;
  fetchComments: boolean;
  notes?: string;
}

export interface PublishInput {
  channel: ChannelName;
  title?: string;
  body: string;
  hashtags: string[];
  imageUrl?: string;
  idempotencyKey: string;
}

export interface PublishResult {
  succeeded: boolean;
  externalPostId?: string;
  externalUrl?: string;
  error?: string;
  requestSummary: Record<string, unknown>;
  responseSummary: Record<string, unknown>;
}

export interface MetricsResult {
  impressions?: number;
  reach?: number;
  views?: number;
  likes?: number;
  comments?: number;
  saves?: number;
  shares?: number;
  clicks?: number;
  conversions?: number;
  isEstimated: boolean;
}

export interface Connector {
  readonly channel: ChannelName;
  readonly mode: "MOCK" | "PRODUCTION";
  capability(): ConnectorCapability;
  validate(input: PublishInput): Promise<{ valid: boolean; errors: string[] }>;
  preview(input: PublishInput): Promise<{ html: string }>;
  publish(input: PublishInput): Promise<PublishResult>;
  fetchMetrics(externalPostId: string): Promise<MetricsResult>;
}

/** Phase 1 capability matrix — see docs/PRD.md section 7. */
export const CAPABILITY_MATRIX: Record<ChannelName, ConnectorCapability> = {
  INSTAGRAM: {
    validate: true,
    preview: true,
    publish: true,
    schedule: true,
    getStatus: true,
    fetchMetrics: true,
    fetchComments: true,
    notes: "Graph API 공식 지원 — Phase 2에서 실연동 예정",
  },
  THREADS: {
    validate: true,
    preview: true,
    publish: true,
    schedule: true,
    getStatus: true,
    fetchMetrics: false,
    fetchComments: false,
    notes: "Threads API 공개 지표 범위가 좁음 — Phase 2에서 재확인 필요",
  },
  BLOGGER: {
    validate: true,
    preview: true,
    publish: true,
    schedule: true,
    getStatus: true,
    fetchMetrics: true,
    fetchComments: true,
    notes: "Blogger API 공식 지원, 조회수만 제공",
  },
};
