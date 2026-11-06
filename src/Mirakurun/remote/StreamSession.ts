/*
 * Copyright 2026 nyanz00
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy at http://www.apache.org/licenses/LICENSE-2.0
 * Distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND.
 */
import * as http from "http";
import { randomUUID } from "crypto";
import { Writable } from "stream";
import { requestJSON } from "./network";

export interface StreamOptions {
    host: string;
    port: number;
    type: string;
    channel: string;
    decode: boolean;
    priority: number;
}

export class StreamSession {
    private request?: http.ClientRequest;
    private response?: http.IncomingMessage;
    private deadline?: NodeJS.Timeout;
    private retry?: NodeJS.Timeout;
    private generation = 0;
    private stopped = false;
    private id: string;
    private priorityUpdate?: Promise<void>;
    private sentPriority: number;
    private controller = new AbortController();

    constructor(private options: StreamOptions, private output: Writable,
        private report: (event: { state: string; id: string; error?: string; retryable?: boolean }) => void,
        private timeout = 20000, private retryDelay = 3000) {}

    start(): void {
        if (this.stopped || this.request) {
            return;
        }
        const generation = ++this.generation;
        this.id = randomUUID();
        const current = () => !this.stopped && generation === this.generation;
        const fail = (error: string, retryable = true) => {
            if (!current()) {
                return;
            }
            const id = this.id;
            this.cleanup();
            this.report({ state: "failed", id, error, retryable });
            this.retry = setTimeout(() => { this.retry = undefined; this.start(); }, retryable ? this.retryDelay : 30000);
        };
        this.report({ state: "starting", id: this.id });
        this.deadline = setTimeout(() => fail("配信応答待ちが20秒を超えました"), this.timeout);
        const options = this.options;
        this.sentPriority = options.priority;
        this.request = http.get({
            host: options.host, port: options.port, agent: false,
            path: `/api/channels/${encodeURIComponent(options.type)}/${encodeURIComponent(options.channel)}/stream?decode=${options.decode ? 1 : 0}`,
            headers: {
                "X-Mirakurun-Priority": String(options.priority), "X-Mirakurun-Remote-ID": this.id,
                "User-Agent": "Mirakurun (Remote)"
            }
        }, response => {
            if (!current()) {
                response.destroy();
                return;
            }
            this.response = response;
            clearTimeout(this.deadline);
            if (response.statusCode !== 200) {
                fail(`配信要求: HTTP ${response.statusCode}`, response.statusCode === 500);
                return;
            }
            this.deadline = setTimeout(() => fail("最初の映像データ待ちが20秒を超えました"), this.timeout);
            response.once("data", () => {
                if (current()) {
                    clearTimeout(this.deadline);
                    this.report({ state: "receiving", id: this.id });
                }
            });
            response.once("end", () => fail("配信が終了しました"));
            response.once("aborted", () => fail("配信が切断されました"));
            response.once("error", () => fail("配信の受信エラー"));
            response.once("close", () => fail("配信接続が閉じられました"));
            response.pipe(this.output, { end: false });
            void this.syncPriority();
        });
        this.request.once("error", error => fail(`配信接続: ${(error as NodeJS.ErrnoException).code || "error"}`));
    }

    setPriority(priority: number): void {
        if (!Number.isSafeInteger(priority) || priority < 0 || priority === this.options.priority) {
            return;
        }
        this.options.priority = priority;
        void this.syncPriority();
    }

    stop(): void {
        this.stopped = true;
        this.controller.abort();
        clearTimeout(this.retry);
        this.cleanup();
        this.report({ state: "idle", id: this.id });
    }

    private async syncPriority(): Promise<void> {
        if (!this.response || this.stopped || this.priorityUpdate || this.sentPriority === this.options.priority) {
            return;
        }
        const host = this.options.host.includes(":") ? `[${this.options.host}]` : this.options.host;
        const id = this.id;
        this.priorityUpdate = (async () => {
            let submitted: number;
            do {
                submitted = this.options.priority;
                try {
                    await requestJSON(`http://${host}:${this.options.port}/api/remote/priority`, "POST",
                        { id, priority: submitted }, this.controller.signal);
                    if (this.id === id) {
                        this.sentPriority = submitted;
                    }
                } catch (_) {
                    // Older servers retain the priority sent when this stream was opened.
                    break;
                }
            } while (!this.stopped && this.id === id && submitted !== this.options.priority);
        })();
        await this.priorityUpdate;
        this.priorityUpdate = undefined;
        if (!this.stopped && this.id !== id) {
            void this.syncPriority();
        }
    }

    private cleanup(): void {
        ++this.generation;
        clearTimeout(this.deadline);
        this.response?.unpipe(this.output);
        this.response?.destroy();
        this.request?.destroy();
        this.response = undefined;
        this.request = undefined;
    }
}
