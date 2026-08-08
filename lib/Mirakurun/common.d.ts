import ChannelItem from "./ChannelItem";
import * as apid from "../../api";
export interface User {
    readonly id: string;
    readonly priority: number;
    readonly agent?: string;
    readonly url?: string;
    readonly disableDecoder?: boolean;
    readonly streamSetting?: StreamSetting;
    readonly streamInfo?: StreamInfo;
}
export type UserRequest = Omit<User, "streamSetting">;
interface StreamSetting {
    channel: ChannelItem;
    networkId?: number;
    serviceId?: number;
    eventId?: number;
    parseNIT?: boolean;
    parseSDT?: boolean;
    parseEIT?: boolean;
}
export interface StreamInfo {
    [PID: string]: {
        packet: number;
        drop: number;
    };
}
export declare const grAltChannelTypes: apid.ChannelType[];
export declare const channelTypes: apid.ChannelType[];
export declare function isGRChannelType(type: apid.ChannelType): boolean;
export declare function getTuningChannelType(type: apid.ChannelType): apid.ChannelType;
export declare const deepClone: <T>(input: T) => T;
export declare function updateObject<T, U>(target: T, input: U): boolean;
export declare function sleep(ms: number): Promise<void>;
export declare function getTimeFromMJD(buffer: Uint8Array | Buffer): number;
export declare function getTimeFromBCD24(buffer: Uint8Array | Buffer): number;
export declare function replaceCommandTemplate(template: string, vars: Record<string, string | number>): string;
export declare function parseCommandForSpawn(cmdString: string): {
    command: string;
    args: string[];
};
export {};
