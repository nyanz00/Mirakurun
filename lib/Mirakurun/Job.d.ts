import * as apid from "../../api";
export interface JobFnOptions {
    signal: AbortSignal;
}
export type JobFn = (options: JobFnOptions) => Promise<any>;
export type ReadyFn = () => Promise<boolean>;
export interface JobItem {
    key: string;
    name: string;
    fn: JobFn;
    readyFn?: ReadyFn;
    isRerunnable?: boolean;
    retryOnAbort?: boolean;
    retryOnFail?: boolean;
    retryMax?: number;
    retryDelay?: number;
}
export interface QueuedJobItem extends JobItem {
    id: string;
    ac: AbortController;
    retryCount: number;
    createdAt: number;
}
export interface RunningJobItem extends QueuedJobItem {
    startedAt: number;
}
export interface FinishedJobItem extends Omit<RunningJobItem, "ac"> {
    hasAborted: boolean;
    hasSkipped: boolean;
    hasFailed: boolean;
    finishedAt: number;
    error?: Error;
}
export interface ScheduleItem {
    key: string;
    job: JobItem;
    schedule: string;
}
export declare class Job {
    maxRunning: number;
    maxStandby: number;
    maxHistory: number;
    private _jobIdPrefix;
    private _jobIdCounter;
    private _queuedJobItems;
    private _standbyJobItems;
    private _runningJobItemSet;
    private _scheduleItemSet;
    private _finishedJobItems;
    private _scheduleInterval;
    private _queueCheckTimeout;
    constructor();
    get schedules(): apid.JobScheduleItem[];
    get jobs(): apid.JobItem[];
    close(): void;
    add(jobItem: JobItem, _retryCount?: number): void;
    rerun(id: string): boolean;
    abort(id: string, reason: string): boolean;
    addSchedule(schedule: ScheduleItem): void;
    runSchedule(scheduleJobKey: string): boolean;
    private _checkSchedule;
    private _checkQueue;
    private _checkReady;
    private _run;
    private _finishJob;
    private _retryJob;
}
export declare function isValidCronExpression(cronExpression: string): boolean;
export default Job;
