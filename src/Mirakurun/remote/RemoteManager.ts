/*
 * Copyright 2026 nyanz00
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy at http://www.apache.org/licenses/LICENSE-2.0
 * Distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND.
 */
import * as path from "path";
import { ConfigServer, RemoteMirakurun, RemotePeerStatus, RemoteStatus } from "../../../api";
import _ from "../_";
import * as log from "../log";
import { hostAddresses, normalizeIP, pingHost, requestJSON } from "./network";
import { Recovery } from "./Recovery";
import { canRestartService, restartService } from "../service-process";

interface Peer extends RemotePeerStatus {
    pending?: Promise<void>;
    nextCheck: number;
    attempts: { id: string; at: number }[];
    lastFailureCount: number;
    alert: boolean;
    limitAlert: boolean;
    graceUntil: number;
    recovering: boolean;
    lastRecoveryRequest: number;
}
interface Incoming {
    ip: string;
    subject: string;
    stage: string;
    at: number;
    dataAt: number;
    firstData: number;
    closed: boolean;
    retryable: boolean;
    setPriority: (value: number) => void;
}

export class RemoteManager {
    private peers = new Map<string, Peer>();
    private incoming = new Map<string, Incoming>();
    private streams = new Map<string, { peer: string; state: string; error?: string }>();
    private addresses = new Map<string, { at: number; values: string[] }>();
    private timer?: NodeJS.Timeout;
    private controller = new AbortController();
    private recovery?: Recovery;
    private restartTimer?: NodeJS.Timeout;
    private notificationError: string = null;
    private notificationQueue: Promise<void> = Promise.resolve();
    private started = false;

    constructor(
        private config: () => ConfigServer = () => _.config.server || { allowOrigins: [], allowPNA: false, tsplayEndpoint: "" },
        private now = Date.now,
        private request = requestJSON,
        private ping = pingHost,
        private restart = restartService,
        private restartSupported = canRestartService
    ) {}

    start(): void {
        if (this.started) {
            return;
        }
        this.started = true;
        this.controller = new AbortController();
        this.recovery = new Recovery(path.resolve(path.dirname(process.env.SERVER_CONFIG_PATH || "data/config/server.yml"),
            "../remote/recovery.json"), this.now);
        for (const config of this.config().remoteMirakuruns || []) {
            this.peers.set(config.id, {
                ...config, state: "unknown", checkedAt: null, lastSuccess: null, inboundAt: null,
                failures: 0, error: null, ping: "unknown", streamState: "idle", streamError: null,
                recovery: "", nextCheck: 0, attempts: [], lastFailureCount: 0, alert: false,
                limitAlert: false, graceUntil: 0, recovering: false, lastRecoveryRequest: 0
            });
        }
        if (this.config().remoteManagementEnabled) {
            this.timer = setInterval(() => this.tick(), 1000);
            this.timer.unref();
            this.tick();
        }
    }

    async stop(): Promise<void> {
        this.started = false;
        clearInterval(this.timer);
        clearTimeout(this.restartTimer);
        this.restartTimer = undefined;
        this.controller.abort();
        await Promise.all([...this.peers.values()].map(peer => peer.pending));
        await this.notificationQueue;
        this.peers.clear();
        this.incoming.clear();
        this.streams.clear();
        this.addresses.clear();
    }

    status(): RemoteStatus {
        return {
            enabled: this.config().remoteManagementEnabled === true,
            peers: [...this.peers.values()].map(peer => {
                const { pending, nextCheck, attempts, lastFailureCount, alert, limitAlert, graceUntil, recovering, lastRecoveryRequest, ...visible } = peer;
                return visible;
            }),
            recovery: this.recoveryStatus(), notificationError: this.notificationError
        };
    }

    async check(id: string): Promise<void> {
        const peer = this.peers.get(id);
        if (!peer || !this.started || !this.config().remoteManagementEnabled) {
            return;
        }
        if (peer.pending) {
            return peer.pending;
        }
        if (peer.checkedAt !== null && this.now() - peer.checkedAt < 30000) {
            return;
        }
        peer.checkedAt = this.now();
        peer.pending = this.probe(peer).finally(() => { peer.pending = undefined; });
        return peer.pending;
    }

    async health(ip: string) {
        const peer = await this.identify(ip);
        if (peer) {
            peer.inboundAt = this.now();
        }
        return {
            protocol: 1, enabled: this.config().remoteManagementEnabled === true,
            registered: !!peer, role: peer?.role, checkedAt: peer?.checkedAt || null,
            lastSuccess: peer?.lastSuccess || null, state: peer?.state || "unknown",
            recovery: this.recoveryStatus(),
            lastRequest: [...this.incoming.entries()].filter(([id, item]) => item.ip === normalizeIP(ip))
                .map(([id, item]) => ({ id, stage: item.stage, at: item.at })).sort((a, b) => b.at - a.at)[0]
        };
    }

    beginIncoming(id: string, ip: string, setPriority: (value: number) => void, resource = ""): boolean {
        if (!/^[a-f0-9-]{36}$/.test(id || "")) {
            return false;
        }
        this.prune();
        if (this.incoming.size >= 256 || this.incoming.has(id)) {
            return false;
        }
        this.incoming.set(id, {
            ip: normalizeIP(ip), subject: `${normalizeIP(ip)}/${resource}`, stage: "received", at: this.now(), dataAt: 0, firstData: 0,
            closed: false, retryable: true, setPriority
        });
        log.debug("remote request %s received", id);
        return true;
    }

    incomingStage(id: string, stage: string, retryable = true): void {
        const entry = this.incoming.get(id);
        if (!entry || (entry.closed && stage !== "closed")) {
            return;
        }
        entry.stage = stage;
        entry.at = this.now();
        entry.retryable = entry.retryable && retryable;
        if (stage === "closed" || stage === "failed") {
            entry.closed = true;
        }
        log.debug("remote request %s %s", id, stage);
    }

    incomingData(id: string): void {
        const entry = this.incoming.get(id);
        if (!entry) {
            return;
        }
        const now = this.now();
        if (!entry.firstData) {
            entry.firstData = now;
            log.debug("remote request %s sending", id);
        }
        entry.dataAt = now;
        entry.stage = "sending";
        if (now - entry.firstData >= 60000) {
            try {
                this.recovery?.recovered(entry.subject);
            } catch (error) {
                log.warn("Remote recovery state could not be saved");
            }
        }
    }

    updatePriority(id: string, ip: string, priority: number): boolean {
        const entry = this.incoming.get(id);
        if (!entry || entry.closed || entry.ip !== normalizeIP(ip) || !Number.isSafeInteger(priority) || priority < 0) {
            return false;
        }
        entry.setPriority(priority);
        return true;
    }

    streamEvent(host: string, port: number, key: string, event: { state: string; id?: string; error?: string; retryable?: boolean }): void {
        const peer = [...this.peers.values()].find(item => item.role === "child" && item.host === host && (item.port || 40772) === port);
        if (!peer || !this.config().remoteManagementEnabled || !this.started) {
            return;
        }
        if (event.state === "idle") {
            this.streams.delete(key);
        } else {
            this.streams.set(key, { peer: peer.id, state: event.state,
                error: event.error || (event.state === "starting" ? this.streams.get(key)?.error : undefined) });
        }
        const streams = [...this.streams.values()].filter(item => item.peer === peer.id);
        peer.streamState = streams.some(item => item.state === "receiving") ? "receiving" :
            streams.some(item => item.state === "failed") ? "failed" : streams.length ? "starting" : "idle";
        peer.streamError = streams.find(item => item.error)?.error || null;
        if (event.state === "receiving" && peer.recovery) {
            peer.recovery = "映像データの受信が再開しました";
        }
        if (event.state === "failed") {
            if (event.retryable && event.id && this.now() - peer.lastFailureCount >= 30000) {
                peer.lastFailureCount = this.now();
                peer.attempts = peer.attempts.filter(item => this.now() - item.at <= 120000);
                peer.attempts.push({ id: event.id, at: this.now() });
            }
            void this.check(peer.id).then(() => event.retryable && this.tryRecovery(peer)).catch(() => undefined);
        }
    }

    async recover(ip: string, ids: string[]): Promise<string> {
        const peer = await this.identify(ip);
        if (!this.started || !this.config().remoteManagementEnabled || !peer || peer.role !== "parent") {
            throw new Error("登録済みの親機だけが復旧を要求できます");
        }
        if (!this.config().remoteAutoRestart || !this.restartSupported() || this.restartTimer) {
            throw new Error("自動再起動が無効、未対応、または実行待ちです");
        }
        if (!Array.isArray(ids) || ids.length !== 3 || new Set(ids).size !== 3) {
            throw new Error("配信失敗記録が不足しています");
        }
        const records = ids.map(id => this.incoming.get(id));
        if (records.some(item => !item || item.ip !== normalizeIP(ip) || !item.retryable || item.firstData ||
            !item.closed || this.now() - item.at > 120000)) {
            throw new Error("子機で確認した配信開始失敗と一致しません");
        }
        const times = records.map(item => item.at).sort((a, b) => a - b);
        // Allow network timing differences while rejecting a burst of requests as an incident.
        if (times[1] - times[0] < 25000 || times[2] - times[1] < 25000 || times[2] - times[0] < 55000) {
            throw new Error("短時間の失敗連打では再起動しません");
        }
        await this.check(peer.id);
        if (!this.started || this.restartTimer || peer.state !== "online" || peer.error ||
            !peer.lastSuccess || this.now() - peer.lastSuccess > 30000) {
            throw new Error("親機の稼働を確認できないため再起動しません");
        }
        // Never restart while another successful view/recording is active.
        if (this.hasActiveStream()) {
            throw new Error("録画・視聴が継続中のため再起動を保留しています");
        }
        this.recovery.ensureAvailable();
        peer.recovery = "再起動待ち";
        this.restartTimer = setTimeout(() => {
            this.restartTimer = undefined;
            if (!this.started) {
                return;
            }
            if (this.hasActiveStream()) {
                peer.recovery = "録画・視聴が開始されたため再起動を保留しています";
                return;
            }
            try {
                this.recovery.reserve(`remote配信開始失敗: ${peer.name}`, records.map(item => item.subject));
                this.restart();
            } catch (error) {
                peer.recovery = error.message;
                log.warn("Remote automatic restart was deferred: %s", error.message);
            }
        }, 1000);
        return "再起動を受け付けました";
    }

    resetRecovery(): void {
        this.recovery?.recovered();
    }

    private hasActiveStream(): boolean {
        return (_.tuner?.devices || []).some(device => device.users.some(user => user.priority >= 0 &&
            (!user.streamInfo || Object.values(user.streamInfo).some(info => info.packet > 0))));
    }

    private recoveryStatus() {
        return this.recovery?.status(this.config().remoteAutoRestart === true, this.restartSupported()) || {
            enabled: false, supported: false, blocked: false, incidentAttempts: 0, nextAllowedAt: 0, history: []
        };
    }

    private tick(): void {
        this.prune();
        for (const peer of this.peers.values()) {
            if (this.now() >= peer.nextCheck) {
                void this.check(peer.id);
            }
        }
    }

    private prune(): void {
        for (const [id, item] of this.incoming) {
            if (item.closed && this.now() - item.at > 120000) {
                this.incoming.delete(id);
            }
        }
    }

    private url(peer: RemoteMirakurun, resource: string): string {
        const host = peer.host.includes(":") ? `[${peer.host}]` : peer.host;
        return `http://${host}:${peer.port || 40772}/api/${resource}`;
    }

    private async identify(ip: string): Promise<Peer> {
        if (!this.config().remoteManagementEnabled) {
            return undefined;
        }
        const address = normalizeIP(ip);
        for (const peer of this.peers.values()) {
            try {
                let cached = this.addresses.get(peer.host);
                if (!cached || this.now() - cached.at > 300000) {
                    cached = { at: this.now(), values: await hostAddresses(peer.host) };
                    this.addresses.set(peer.host, cached);
                }
                if (cached.values.includes(address)) {
                    return peer;
                }
            } catch (_) {
                // An unresolvable configured host cannot authorize a request.
            }
        }
        return undefined;
    }

    private async probe(peer: Peer): Promise<void> {
        try {
            let health: any;
            try {
                health = await this.request(this.url(peer, "remote/health"), "GET", undefined, this.controller.signal);
            } catch (error) {
                if (error.message !== "HTTP 404") {
                    throw error;
                }
                const status = await this.request(this.url(peer, "status"), "GET", undefined, this.controller.signal);
                if (!status || typeof status.version !== "string") {
                    throw new Error("Mirakurunの応答ではありません");
                }
                health = { protocol: 0 };
            }
            if (health.protocol !== 1 && health.protocol !== 0) {
                throw new Error("接続管理APIの応答が不正です");
            }
            if (!this.started) {
                return;
            }
            peer.state = "online";
            peer.ping = "unknown";
            peer.failures = 0;
            peer.error = health.protocol === 0 ? "相手は接続管理APIに未対応です" :
                !health.enabled ? "相手の接続管理がOFFです" : !health.registered ? "相手に自機が登録されていません" :
                    health.role !== (peer.role === "child" ? "parent" : "child") ? "相手側の親機・子機設定が一致しません" : null;
            peer.lastSuccess = this.now();
            peer.remoteRecovery = health.recovery;
            peer.lastRequest = health.lastRequest;
            if (peer.alert) {
                peer.alert = false;
                this.notify(peer, "API通信が回復しました");
            }
            if (health.recovery?.blocked && !peer.limitAlert) {
                peer.limitAlert = true;
                this.notify(peer, "子機の自動再起動が上限に達したか停止しています");
            } else if (health.recovery && !health.recovery.blocked) {
                peer.limitAlert = false;
            }
        } catch (error) {
            if (!this.started) {
                return;
            }
            if (this.now() < peer.graceUntil) {
                peer.recovery = "子機の再起動完了待ち";
                return;
            }
            peer.failures++;
            peer.error = String(error.message || "API request failed");
            peer.state = /HTTP (400|401|403)/.test(peer.error) ? "error" : peer.failures >= 3 ? "offline" : "suspect";
            if (peer.failures >= 3) {
                peer.ping = await this.ping(peer.host) ? "ok" : "failed";
                if (this.started && !peer.alert) {
                    peer.alert = true;
                    this.notify(peer, "API通信を確認できません");
                }
            }
        } finally {
            peer.nextCheck = this.now() + (peer.state === "online" && !peer.error && this.now() >= peer.graceUntil ? 300000 : 30000);
        }
    }

    private async tryRecovery(peer: Peer): Promise<void> {
        peer.attempts = peer.attempts.filter(item => this.now() - item.at <= 120000);
        if (!this.started || peer.recovering || this.now() - peer.lastRecoveryRequest < 30000 || peer.attempts.length < 3 ||
            ![...this.streams.values()].some(stream => stream.peer === peer.id && stream.state === "failed") || peer.state !== "online" || peer.error ||
            this.now() < peer.graceUntil || !peer.remoteRecovery?.enabled || !peer.remoteRecovery.supported) {
            return;
        }
        peer.recovering = true;
        peer.lastRecoveryRequest = this.now();
        try {
            const result = await this.request(this.url(peer, "remote/recover"), "POST",
                { ids: peer.attempts.slice(-3).map(item => item.id) }, this.controller.signal);
            peer.recovery = result.message;
            if (result.accepted) {
                peer.graceUntil = this.now() + 120000;
                peer.nextCheck = this.now() + 30000;
                peer.attempts = [];
            }
        } catch (_) {
            peer.recovery = "復旧要求を送信できませんでした";
        } finally {
            peer.recovering = false;
        }
    }

    private notify(peer: Peer, message: string): void {
        const webhook = this.config().remoteDiscordWebhook;
        if (!webhook || peer.role !== "child") {
            return;
        }
        const content = ["Mirakurun Remote", peer.name, `${peer.host}:${peer.port || 40772}`, message,
            `最終正常応答: ${peer.lastSuccess ? new Date(peer.lastSuccess).toISOString() : "未確認"}`,
            `API: ${peer.error || "正常"} / ping: ${peer.ping}`].join("\n").slice(0, 1900);
        this.notificationQueue = this.notificationQueue.then(async () => {
            if (!this.started) {
                return;
            }
            try {
                const url = new URL(webhook);
                url.searchParams.set("wait", "true");
                await this.request(url.toString(), "POST", { content, allowed_mentions: { parse: [] } }, this.controller.signal);
                this.notificationError = null;
            } catch (_) {
                this.notificationError = "Discord通知に失敗しました。Webhook設定・通信状態を確認してください。";
                log.warn("Remote Discord notification failed");
            }
        });
    }
}

export default new RemoteManager();
