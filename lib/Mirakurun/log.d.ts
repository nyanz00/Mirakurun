import { EventEmitter } from "events";
export declare enum LogLevel {
    "FATAL" = -1,
    "ERROR" = 0,
    "WARN" = 1,
    "INFO" = 2,
    "DEBUG" = 3
}
export declare let logLevel: LogLevel;
export declare let maxLogHistory: number;
declare class LogEvent extends EventEmitter {
    logs: string[];
    emit(ev: "data", level: LogLevel, log: string): boolean;
    debug(...msgs: any[]): void;
    info(...msgs: any[]): void;
    warn(...msgs: any[]): void;
    error(...msgs: any[]): void;
    fatal(...msgs: any[]): void;
    write(line: any): void;
}
export declare const event: LogEvent;
export declare const debug: (...msgs: any[]) => void;
export declare const info: (...msgs: any[]) => void;
export declare const warn: (...msgs: any[]) => void;
export declare const error: (...msgs: any[]) => void;
export declare const fatal: (...msgs: any[]) => void;
export {};
