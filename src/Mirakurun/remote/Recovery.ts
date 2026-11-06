/*
 * Copyright 2026 nyanz00
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy at http://www.apache.org/licenses/LICENSE-2.0
 * Distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND.
 */
import * as fs from "fs";
import * as path from "path";
import { RemoteRecoveryStatus } from "../../../api";

export class Recovery {
    private history: { at: number; reason: string }[] = [];
    private incidentAttempts = 0;
    private error: string;
    private lastRestart = 0;
    private subjects: string[] = [];
    private startedAt: number;

    constructor(private file: string, private now = Date.now) {
        this.startedAt = now();
        try {
            if (fs.existsSync(file)) {
                const saved = JSON.parse(fs.readFileSync(file, "utf8"));
                if (!Array.isArray(saved.history) || !Number.isInteger(saved.incidentAttempts) ||
                    saved.incidentAttempts < 0 || !Number.isFinite(saved.lastRestart) ||
                    saved.history.some(item => !Number.isFinite(item.at) || typeof item.reason !== "string") ||
                    (saved.subjects !== undefined && (!Array.isArray(saved.subjects) || saved.subjects.some(item => typeof item !== "string")))) {
                    throw new Error("Invalid recovery state");
                }
                this.history = saved.history;
                this.incidentAttempts = saved.incidentAttempts;
                this.lastRestart = saved.lastRestart;
                this.subjects = saved.subjects || [];
            }
        } catch (_) {
            this.error = "再起動履歴を読み込めないため自動再起動を停止しています";
        }
    }

    status(enabled: boolean, supported: boolean): RemoteRecoveryStatus {
        const recent = this.history.filter(item => this.now() - item.at < 3600000);
        return {
            enabled, supported, blocked: !!this.error || this.incidentAttempts >= 2,
            incidentAttempts: this.incidentAttempts,
            nextAllowedAt: Math.max(this.startedAt + 120000, this.lastRestart + 600000,
                recent.length >= 2 ? recent[recent.length - 2].at + 3600000 : 0),
            history: this.history.slice(-20), error: this.error
        };
    }

    ensureAvailable(): void {
        const state = this.status(true, true);
        if (state.blocked || state.nextAllowedAt > this.now()) {
            throw new Error("再起動猶予・間隔・回数制限により保留しています");
        }
    }

    reserve(reason: string, subjects: string[] = []): void {
        this.ensureAvailable();
        const now = this.now();
        this.history.push({ at: now, reason });
        this.history = this.history.slice(-20);
        this.lastRestart = now;
        this.incidentAttempts++;
        this.subjects = [...new Set([...this.subjects, ...subjects])];
        this.save();
    }

    recovered(subject?: string): void {
        if (subject !== undefined && !this.subjects.includes(subject)) {
            return;
        }
        if (this.incidentAttempts > 0 && !this.error) {
            this.incidentAttempts = 0;
            this.subjects = [];
            this.save();
        }
    }

    private save(): void {
        try {
            fs.mkdirSync(path.dirname(this.file), { recursive: true });
            fs.writeFileSync(this.file + ".tmp", JSON.stringify({
                history: this.history, incidentAttempts: this.incidentAttempts, lastRestart: this.lastRestart, subjects: this.subjects
            }));
            fs.renameSync(this.file + ".tmp", this.file);
        } catch (_) {
            this.error = "再起動履歴を保存できないため自動再起動を停止しています";
            throw new Error(this.error);
        }
    }
}
