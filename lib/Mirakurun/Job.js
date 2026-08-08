"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Job = void 0;
exports.isValidCronExpression = isValidCronExpression;
const os = __importStar(require("os"));
const log = __importStar(require("./log"));
const common_1 = require("./common");
const Event_1 = __importDefault(require("./Event"));
const _1 = __importDefault(require("./_"));
class Job {
    maxRunning = _1.default.config.server.jobMaxRunning || Math.min(100, Math.max(1, Math.floor(os.cpus().length / 2)));
    maxStandby = _1.default.config.server.jobMaxStandby || Math.min(100, Math.max(1, Math.floor(os.cpus().length - 1)));
    maxHistory = 50;
    _jobIdPrefix = Date.now().toString(36).toUpperCase() + ".";
    _jobIdCounter = 0;
    _queuedJobItems = [];
    _standbyJobItems = [];
    _runningJobItemSet = new Set();
    _scheduleItemSet = new Set();
    _finishedJobItems = [];
    _scheduleInterval;
    _queueCheckTimeout = null;
    constructor() {
        this._scheduleInterval = setInterval(() => this._checkSchedule(), 1000 * 60);
    }
    get schedules() {
        return Array.from(this._scheduleItemSet).map(schedule => ({
            key: schedule.key,
            schedule: schedule.schedule,
            job: {
                key: schedule.job.key,
                name: schedule.job.name
            }
        }));
    }
    get jobs() {
        const result = [];
        for (const job of this._queuedJobItems) {
            result.push(jobToJSON("queued", job));
        }
        for (const job of this._standbyJobItems) {
            result.push(jobToJSON("standby", job));
        }
        for (const job of this._runningJobItemSet) {
            result.push(jobToJSON("running", job));
        }
        for (const job of this._finishedJobItems) {
            result.push(jobToJSON("finished", job));
        }
        return result;
    }
    close() {
        clearInterval(this._scheduleInterval);
        if (this._queueCheckTimeout) {
            clearTimeout(this._queueCheckTimeout);
            this._queueCheckTimeout = null;
        }
        for (const job of this._runningJobItemSet) {
            job.ac.abort();
        }
    }
    add(jobItem, _retryCount = 0) {
        log.info(`Job#add() adding "${jobItem.key}"`);
        for (const job of [...this._queuedJobItems, ...this._standbyJobItems, ...this._runningJobItemSet]) {
            if (job.key === jobItem.key) {
                log.warn(`Job#add() ignore adding "${jobItem.key}" because already in the queue or running.`);
                return;
            }
        }
        const queuedJob = {
            ...jobItem,
            id: this._jobIdPrefix + (++this._jobIdCounter),
            ac: new AbortController(),
            createdAt: Date.now(),
            retryCount: _retryCount
        };
        this._queuedJobItems.push(queuedJob);
        Event_1.default.emit("job", "create", jobToJSON("queued", queuedJob));
        this._checkQueue();
    }
    rerun(id) {
        for (const job of [...this._finishedJobItems]) {
            if (job.id === id) {
                log.info(`Job#rerun() rerun requested "${job.key}" (id: ${job.id})`);
                if (job.isRerunnable !== true) {
                    log.warn(`Job#rerun() "${job.key}" (id: ${job.id}) is not rerunnable`);
                    return false;
                }
                this.add({
                    key: job.key,
                    name: job.name,
                    fn: job.fn,
                    readyFn: job.readyFn,
                    isRerunnable: true,
                    retryOnAbort: false,
                    retryOnFail: false,
                    retryMax: 0
                }, 0);
                return true;
            }
        }
        log.warn(`Job#rerun() "${id}" not found in finished jobs`);
        return false;
    }
    abort(id, reason) {
        for (const job of [...this._runningJobItemSet, ...this._standbyJobItems, ...this._queuedJobItems]) {
            if (job.id === id && !job.ac.signal.aborted) {
                job.ac.abort(reason);
                log.info(`Job#abort() abort requested "${job.key}" (id: ${job.id})`);
                let status = "queued";
                if (this._runningJobItemSet.has(job)) {
                    status = "running";
                }
                else if (this._standbyJobItems.includes(job)) {
                    status = "standby";
                }
                Event_1.default.emit("job", "update", jobToJSON(status, job));
                return true;
            }
        }
        log.warn(`Job#abort() "${id}" not found in running or queued jobs`);
        return false;
    }
    addSchedule(schedule) {
        for (const job of this._scheduleItemSet) {
            if (job.key === schedule.key) {
                log.warn(`Job#addSchedule() ignore adding "${schedule.key}" because already in the schedule.`);
                return;
            }
        }
        log.info(`Job#addSchedule() adding "${schedule.key}"`);
        if (!isValidCronExpression(schedule.schedule)) {
            throw new Error(`Invalid schedule format: ${schedule.schedule}`);
        }
        this._scheduleItemSet.add(schedule);
        Event_1.default.emit("job_schedule", "create", {
            key: schedule.key,
            schedule: schedule.schedule,
            job: {
                key: schedule.job.key,
                name: schedule.job.name
            }
        });
    }
    runSchedule(scheduleJobKey) {
        for (const schedule of this._scheduleItemSet) {
            if (schedule.key === scheduleJobKey) {
                this.add(schedule.job);
                return true;
            }
        }
        log.warn(`Job#runSchedule() "${scheduleJobKey}" not found in schedule`);
        return false;
    }
    async _checkSchedule() {
        const date = new Date();
        const invalidJobs = new Set();
        for (const schedule of this._scheduleItemSet) {
            try {
                if (matchCronExpression(schedule.schedule, date)) {
                    const job = { ...schedule.job, retryCount: 0 };
                    this.add(job);
                }
            }
            catch (err) {
                const error = err instanceof Error ? err : new Error(String(err));
                log.error(`Job#_checkSchedule() ${schedule.key} err=${error.message}`);
                invalidJobs.add(schedule);
            }
        }
        for (const job of invalidJobs) {
            this._scheduleItemSet.delete(job);
        }
    }
    _checkQueue() {
        log.debug(`Job#_checkQueue() queue=${this._queuedJobItems.length} standby=${this._standbyJobItems.length} running=${this._runningJobItemSet.size}`);
        if (this._standbyJobItems.length >= this.maxStandby) {
            log.debug("Job#_checkQueue() standby is full [skip]");
            return;
        }
        if (this._queuedJobItems.length === 0) {
            log.debug("Job#_checkQueue() queue is empty [skip]");
            return;
        }
        for (const job of this._queuedJobItems) {
            if (this._standbyJobItems.length >= this.maxStandby) {
                break;
            }
            this._checkReady(job);
        }
    }
    async _checkReady(job) {
        log.debug(`Job#_checkReady() checking "${job.key}" (id: ${job.id})`);
        if (!this._queuedJobItems.includes(job)) {
            log.error(`Job#_checkReady() "${job.key}" (id: ${job.id}) not found in queue`);
            return;
        }
        if (this._standbyJobItems.includes(job)) {
            log.error(`Job#_checkReady() "${job.key}" (id: ${job.id}) already in standby`);
            return;
        }
        if (this._standbyJobItems.length >= this.maxStandby) {
            log.error(`Job#_checkReady() "${job.key}" (id: ${job.id}) standby is full`);
            return;
        }
        const index = this._queuedJobItems.indexOf(job);
        if (index !== -1) {
            this._queuedJobItems.splice(index, 1);
        }
        this._standbyJobItems.push(job);
        Event_1.default.emit("job", "update", jobToJSON("standby", job));
        let skip = false;
        if (job.readyFn) {
            try {
                skip = await job.readyFn() === false;
            }
            catch (err) {
                const error = err instanceof Error ? err : new Error(String(err));
                log.error(`Job#_checkReady() "${job.key}" readyFn error: ${error.message}`);
                skip = true;
            }
        }
        if (!skip && this._runningJobItemSet.size >= this.maxRunning) {
            log.debug(`Job#_checkReady() running is full [wait]`);
            while (this._runningJobItemSet.size >= this.maxRunning) {
                await (0, common_1.sleep)(1000);
            }
        }
        const waitingIndex = this._standbyJobItems.indexOf(job);
        if (waitingIndex !== -1) {
            this._standbyJobItems.splice(waitingIndex, 1);
        }
        if (skip || job.ac.signal.aborted) {
            const skippedJob = {
                ...job,
                retryCount: job.retryCount || 0,
                startedAt: Date.now()
            };
            if (skip) {
                skippedJob.ac.abort("skipped");
                log.debug(`Job#_checkReady() skipped "${job.key}" (id: ${job.id}) due to readyFn returning false`);
            }
            else {
                log.debug(`Job#_checkReady() aborted "${job.key}" (id: ${job.id}) due to abort signal`);
            }
            this._finishJob(skippedJob, true);
        }
        else {
            const runningJob = {
                ...job,
                retryCount: job.retryCount || 0,
                startedAt: Date.now()
            };
            this._run(runningJob);
        }
        log.debug(`Job#_checkReady() done "${job.key}" (id: ${job.id})`);
        clearTimeout(this._queueCheckTimeout);
        this._queueCheckTimeout = setTimeout(() => this._checkQueue(), 1000);
    }
    async _run(job) {
        log.debug(`Job#_run() starting "${job.key}" (id: ${job.id})`);
        if (this._runningJobItemSet.has(job)) {
            log.error(`Job#_run() "${job.key}" (id: ${job.id}) already running`);
            return;
        }
        if (this._runningJobItemSet.size >= this.maxRunning) {
            log.error(`Job#_run() "${job.key}" (id: ${job.id}) running is full`);
            return;
        }
        this._runningJobItemSet.add(job);
        Event_1.default.emit("job", "update", jobToJSON("running", job));
        try {
            await job.fn({ signal: job.ac.signal });
            this._finishJob(job, true);
        }
        catch (error) {
            this._finishJob(job, false, error);
            setImmediate(() => this._retryJob(job));
        }
        this._runningJobItemSet.delete(job);
        log.debug(`Job#_run() done "${job.key}" (id: ${job.id})`);
    }
    _finishJob(job, ok, error) {
        const finishedAt = Date.now();
        const hasAborted = job.ac.signal.aborted;
        const hasSkipped = job.ac.signal.aborted && job.ac.signal.reason === "skipped";
        const hasFailed = !ok;
        const pastJob = {
            ...job,
            hasAborted,
            hasSkipped,
            hasFailed,
            finishedAt,
            error
        };
        this._finishedJobItems.unshift(pastJob);
        if (this._finishedJobItems.length > this.maxHistory) {
            const removedJobs = this._finishedJobItems.splice(this.maxHistory, this._finishedJobItems.length - this.maxHistory);
            for (const removedJob of removedJobs) {
                Event_1.default.emit("job", "update", jobToJSON("finished", {
                    ...removedJob,
                    isRerunnable: false
                }));
            }
        }
        const duration = finishedAt - job.startedAt;
        const statusMsg = ok ? "completed" : "failed";
        const abortMsg = hasAborted ? " (aborted)" : "";
        log.info(`Job#_finishJob() "${job.key}" ${statusMsg}${abortMsg} in ${duration}ms`);
        Event_1.default.emit("job", "update", jobToJSON("finished", pastJob));
    }
    async _retryJob(job) {
        const shouldRetryOnAbort = job.retryOnAbort === true && job.ac.signal.aborted;
        const shouldRetryOnFail = job.retryOnFail === true && !job.ac.signal.aborted;
        const retryMax = job.retryMax !== undefined ? job.retryMax : 0;
        const nextRetryCount = job.retryCount + 1;
        const canRetry = nextRetryCount <= retryMax;
        if ((shouldRetryOnAbort || shouldRetryOnFail) && canRetry) {
            const retryDelay = Math.max(1000, job.retryDelay || 1000);
            log.warn(`Job#_handleJobError() "${job.key}" will retry (${nextRetryCount}/${retryMax}) after ${retryDelay}ms`);
            await (0, common_1.sleep)(retryDelay);
            this.add({
                key: job.key,
                name: job.name,
                fn: job.fn,
                readyFn: job.readyFn,
                isRerunnable: job.isRerunnable,
                retryOnAbort: job.retryOnAbort,
                retryOnFail: job.retryOnFail,
                retryMax: job.retryMax,
                retryDelay: job.retryDelay
            }, nextRetryCount);
        }
    }
}
exports.Job = Job;
function isValidCronExpression(cronExpression) {
    const cronParts = cronExpression.split(" ");
    if (cronParts.length !== 5) {
        return false;
    }
    try {
        const patterns = [
            /^(\*|([0-9]|[1-5][0-9])((-([0-9]|[1-5][0-9]))?))(\/([1-9]|[1-5][0-9]))?$/,
            /^(\*|([0-9]|1[0-9]|2[0-3])((-([0-9]|1[0-9]|2[0-3]))?))(\/([1-9]|1[0-9]|2[0-3]))?$/,
            /^(\*|([1-9]|[12][0-9]|3[01])((-([1-9]|[12][0-9]|3[01]))?))(\/([1-9]|[12][0-9]|3[01]))?$/,
            /^(\*|([1-9]|1[0-2])((-([1-9]|1[0-2]))?))(\/([1-9]|1[0-2]))?$/,
            /^(\*|([0-6])((-([0-6]))?))(\/([1-6]))?$/
        ];
        for (let i = 0; i < 5; i++) {
            const parts = cronParts[i].split(",");
            for (const part of parts) {
                if (part === "" || !patterns[i].test(part)) {
                    return false;
                }
            }
        }
        return true;
    }
    catch (err) {
        return false;
    }
}
function matchCronExpression(cronExpression, date) {
    const parts = cronExpression.split(" ");
    if (parts.length !== 5) {
        throw new Error(`Invalid schedule format: ${cronExpression}`);
    }
    const [minStr, hourStr, domStr, monStr, dowStr] = parts;
    const dateMin = date.getMinutes();
    const dateHour = date.getHours();
    const dateDom = date.getDate();
    const dateMon = date.getMonth() + 1;
    const dateDow = date.getDay();
    const matchesMinute = matchCronPart(minStr, dateMin, 0, 59);
    const matchesHour = matchCronPart(hourStr, dateHour, 0, 23);
    const matchesDOM = matchCronPart(domStr, dateDom, 1, 31);
    const matchesMON = matchCronPart(monStr, dateMon, 1, 12);
    const matchesDOW = matchCronPart(dowStr, dateDow, 0, 6);
    return matchesMinute && matchesHour && matchesDOM && matchesMON && matchesDOW;
}
function matchCronPart(cronPart, value, min, max) {
    if (cronPart === "*") {
        return true;
    }
    const values = new Set();
    for (const part of cronPart.split(",")) {
        if (part.includes("/")) {
            const [range, step] = part.split("/");
            const stepNum = parseInt(step, 10);
            if (isNaN(stepNum) || stepNum <= 0) {
                throw new Error(`Invalid step value: ${step}`);
            }
            let start = min;
            let end = max;
            if (range !== "*" && range.includes("-")) {
                const [rangeStart, rangeEnd] = range.split("-").map(v => parseInt(v, 10));
                if (isNaN(rangeStart) || isNaN(rangeEnd) || rangeStart < min || rangeEnd > max || rangeStart > rangeEnd) {
                    throw new Error(`Invalid range with step: ${part}`);
                }
                start = rangeStart;
                end = rangeEnd;
            }
            for (let i = start; i <= end; i++) {
                if ((i - start) % stepNum === 0) {
                    values.add(i);
                }
            }
        }
        else if (part.includes("-")) {
            const [start, end] = part.split("-").map(v => parseInt(v, 10));
            if (isNaN(start) || isNaN(end) || start < min || end > max || start > end) {
                throw new Error(`Invalid range: ${part}`);
            }
            for (let i = start; i <= end; i++) {
                values.add(i);
            }
        }
        else {
            const num = parseInt(part, 10);
            if (isNaN(num) || num < min || num > max) {
                throw new Error(`Invalid value: ${part}`);
            }
            values.add(num);
        }
    }
    return values.has(value);
}
function jobToJSON(status, job) {
    const { ac, fn, readyFn, key, name, id, retryCount, createdAt, error, ...safeJob } = job;
    return {
        key,
        name,
        id,
        status,
        retryCount,
        isAborting: ac?.signal.aborted,
        createdAt,
        updatedAt: job.finishedAt || job.startedAt || job.createdAt,
        duration: job.finishedAt ? job.finishedAt - job.startedAt : 0,
        error: error?.message,
        ...safeJob
    };
}
exports.default = Job;
//# sourceMappingURL=Job.js.map