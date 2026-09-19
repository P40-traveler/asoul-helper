import * as https from "node:https";
import type { DynamicItem, LiveStatus, Member } from "./types";

interface ApiEnvelope {
  code?: number;
  message?: string;
  data?: unknown;
}

const REQUEST_TIMEOUT_MS = 15_000;
const USER_AGENT = "Mozilla/5.0 VSCode-ASOUL-Notifier/0.1";
let anonymousCookiePromise: Promise<string> | undefined;

export async function fetchDynamics(member: Member): Promise<DynamicItem[]> {
  const url = new URL("https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space");
  url.searchParams.set("host_mid", String(member.uid));
  url.searchParams.set("timezone_offset", "-480");
  url.searchParams.set("features", "itemOpusStyle");
  url.searchParams.set("web_location", "333.1387");
  const cookie = await getAnonymousCookie();
  const envelope = await requestJson<ApiEnvelope>(url, `https://space.bilibili.com/${member.uid}/dynamic`, cookie);
  assertApiSuccess(envelope, "动态");

  const data = asRecord(envelope.data);
  const items = Array.isArray(data?.items) ? data.items : [];
  return items.flatMap((raw): DynamicItem[] => {
    const item = asRecord(raw);
    const id = stringValue(item?.id_str) ?? stringValue(item?.id);
    if (!id) {
      return [];
    }

    const modules = asRecord(item?.modules);
    const authorModule = asRecord(modules?.module_author);
    const dynamicModule = asRecord(modules?.module_dynamic);
    const author = member.name || stringValue(authorModule?.name) || String(member.uid);
    const publishedAt = numberValue(authorModule?.pub_ts);

    return [{
      id,
      author,
      summary: dynamicSummary(dynamicModule, item),
      url: `https://t.bilibili.com/${id}`,
      ...(publishedAt !== undefined ? { publishedAt } : {})
    }];
  });
}

export async function fetchLiveStatuses(members: Member[]): Promise<LiveStatus[]> {
  if (members.length === 0) {
    return [];
  }

  const url = new URL("https://api.live.bilibili.com/room/v1/Room/get_status_info_by_uids");
  for (const member of members) {
    url.searchParams.append("uids[]", String(member.uid));
  }

  const envelope = await requestJson<ApiEnvelope>(url, "https://live.bilibili.com/");
  assertApiSuccess(envelope, "直播状态");
  const data = asRecord(envelope.data) ?? {};

  return members.map(member => {
    const raw = asRecord(data[String(member.uid)]) ?? {};
    const roomId = numberValue(raw.room_id);
    const liveUrl = stringValue(raw.live_url);
    return {
      uid: member.uid,
      name: member.name || stringValue(raw.uname) || String(member.uid),
      isLive: numberValue(raw.live_status) === 1,
      title: stringValue(raw.title) || "正在直播",
      url: liveUrl || (roomId ? `https://live.bilibili.com/${roomId}` : `https://space.bilibili.com/${member.uid}`)
    };
  });
}

function dynamicSummary(dynamicModule: Record<string, unknown> | undefined, item: Record<string, unknown> | undefined): string {
  const desc = asRecord(dynamicModule?.desc);
  const descText = stringValue(desc?.text)?.trim();
  if (descText) {
    return clip(descText);
  }

  const major = asRecord(dynamicModule?.major);
  for (const key of ["archive", "article", "opus", "common", "live_rcmd"]) {
    const section = asRecord(major?.[key]);
    const title = stringValue(section?.title) || stringValue(asRecord(section?.summary)?.text);
    if (title) {
      return clip(title);
    }
  }

  const type = stringValue(item?.type);
  return type === "DYNAMIC_TYPE_AV" ? "发布了新视频" : "发布了新动态";
}

function clip(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 80 ? `${normalized.slice(0, 77)}...` : normalized;
}

function assertApiSuccess(envelope: ApiEnvelope, operation: string): void {
  if (envelope.code !== 0) {
    throw new Error(`B站${operation}接口返回 ${envelope.code ?? "未知错误"}：${envelope.message ?? "无错误信息"}`);
  }
}

async function getAnonymousCookie(): Promise<string> {
  anonymousCookiePromise ??= (async () => {
    const url = new URL("https://api.bilibili.com/x/frontend/finger/spi");
    const envelope = await requestJson<ApiEnvelope>(url, "https://www.bilibili.com/");
    assertApiSuccess(envelope, "匿名设备初始化");
    const data = asRecord(envelope.data);
    const buvid3 = stringValue(data?.b_3);
    const buvid4 = stringValue(data?.b_4);
    if (!buvid3 || !buvid4) {
      throw new Error("B站匿名设备接口没有返回设备标识");
    }
    return [
      `buvid3=${buvid3}`,
      `buvid4=${buvid4}`,
      `b_nut=${Math.floor(Date.now() / 1000)}`,
      "CURRENT_FNVAL=4048"
    ].join("; ");
  })();
  return anonymousCookiePromise;
}

function requestJson<T>(url: URL, referer: string, cookie = ""): Promise<T> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      Accept: "application/json, text/plain, */*",
      Referer: referer,
      "User-Agent": USER_AGENT
    };
    if (cookie) headers.Cookie = cookie;

    const request = https.get(url, {
      headers
    }, response => {
      const chunks: Buffer[] = [];
      response.on("data", chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      response.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`HTTP ${response.statusCode ?? "未知"}：${body.slice(0, 160)}`));
          return;
        }
        try {
          resolve(JSON.parse(body) as T);
        } catch {
          reject(new Error(`接口返回了无法解析的内容：${body.slice(0, 160)}`));
        }
      });
    });

    request.setTimeout(REQUEST_TIMEOUT_MS, () => request.destroy(new Error("请求超时")));
    request.on("error", reject);
  });
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}
